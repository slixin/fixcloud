var express = require('express');
var router = express.Router();
var util = require('./util.js');
var fs = require('fs');
var FIXClient = require('./fixjs/fixClient.js');
var _ = require('underscore');
var async = require('async');
var dict = require("dict");
var isJSON = require('is-json');
var log4js = require('log4js');

//################## LOG SETTING ######################
log4js.configure({
  appenders: [
    { type: 'console' },
    { type: 'file', filename: 'logs/client.log', category: 'client' }
  ]
});
var logger = log4js.getLogger('client');
logger.setLevel('ERROR');
//################## LOG SETTING ######################

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.status(404);
    res.send("No authentication");
}

router.use(ensureAuthenticated);

router.post('/connect', function(req, res) {
    var sendercompid = req.body.senderid;
    var targetcompid = req.body.targetid;
    var host = req.body.host;
    var port = req.body.port;
    var version = req.body.version;
    var user_id = req.body.user;

    var user = global.users.get(user_id);

    var logonTimer = setTimeout(function() { res.send({ status: false, error: 'Logon time out' }); }, 5000);

    var client_id = host + "|" + port + "|" + version + "-" + sendercompid + "-" + targetcompid;
    if (global.clients.has(client_id)){
        clearTimeout(logonTimer);
        res.send({ status: true, client_id: client_id, listener_port: user.listener.port });
    }else{
        var client = new FIXClient("FIX." + version, sendercompid, targetcompid, {});
        client.init(function() {
            client.createConnection(
                { port: port, host: host },
                function(error) {
                    if (error){
                        util.request_error(res, error);
                    }
                },
                function(session) {
                    session.sendLogon();
                    session.on('logon', function() {
                        clearTimeout(logonTimer);
                        global.clients.set(client_id, {
                            session: session,
                            executing: false,
                            objects: []
                        });
                        res.send({ status: true, client_id: client_id, listener_port: user.listener.port });
                    });
                    session.on('msg', function(msg) {
                        if (msg[35] != '0' && msg[35] != '1') {
                            if (msg[35] == '5'){
                                remove_client(client_id, function(session){
                                    session.sendLogoff();
                                });
                            } else {
                                var listener_message = {
                                    direction: 0, //incoming
                                    message: msg,
                                    message_time: new Date().getTime(),
                                    session_id: client_id
                                };
                                user.listener.socket.emit('message', listener_message);
                            }
                        }
                    });
                    session.on('outmsg', function(msg) {
                        if (msg[35] != 0 && msg[35] != 1){
                            var listener_message = {
                                direction: 1, //outgoing
                                message: msg,
                                message_time: new Date().getTime(),
                                session_id: client_id
                            };
                            user.listener.socket.emit('message', listener_message);
                        }
                    });
                    session.on('msg-resync', function(msg) {});
                    session.on('outmsg-resync', function(msg) {});
                    session.on('error', function(msg) {});
                    session.on('state', function(msg) {});
                    session.on('disconnect', function(msg) {
                        logger.warn('Disconnect from server side');
                        remove_client(client_id, function(){});
                    });
                });
        });
    }
});

router.post('/isconnected', function(req, res) {
    var client_id = req.body.client;
    if (global.clients.get(client_id) == undefined){
        util.request_error(res, 'Client cannot be found');
    }else{
        if (global.clients.get(client_id).session != undefined){
            res.send({ status: true });
        }else{
            util.request_error(res, 'Client without session');
        }
    }
});

router.post('/disconnect', function(req, res) {
    var client_id = req.body.client;
    remove_client(client_id, function(session){
        session.sendLogoff();
        res.send({ status: true });
    });
});

router.post('/send', function(req, res) {
    var client_id = req.body.client;
    var message = req.body.message;

    var client = global.clients.get(client_id);
    util.isvalid_client(client, function(err){
        if (err){
            res.send({ status: false, error: err });
        } else {
           util.isvalid_message(message, function(err){
                if (err){
                    res.send({ status: false, error: err });
                } else {
                    if (typeof message == "string")
                        message = JSON.parse(message);
                    if (isArray(message)) {
                         message.forEach(function(m){
                            var m_message = inspect(m);
                            m_message = update_tag_random_value_in_message(m_message);
                            client.session.sendMsg(m_message);
                        });
                    } else{
                        var m_message = inspect(message);
                        m_message = update_tag_random_value_in_message(m_message);
                        client.session.sendMsg(m_message);
                    }
                    res.send({ status: true });
                }
           })
        }
    });
});

router.post('/send/bulk', function(req, res) {
    var client_id = req.body.client;
    var message = req.body.message;
    var bulk_amount = req.body.amount == undefined ? 1 : req.body.amount;
    var bulk_tps = req.body.tps == undefined ? 1 : req.body.tps;

    var client = global.clients.get(client_id);

    util.isvalid_client(client, function(err){
        if (err){
            res.send({ status: false, error: err });
        } else {
           util.isvalid_message(message, function(err){
                if (err){
                    res.send({ status: false, error: err });
                } else {
                    if (typeof message == "string")
                        message = JSON.parse(message);

                    if (client.executing){
                        var err_msg = 'Only one bulk sending is supported, you have to stop the current bulk sending before run a new one.';
                        logger.error(err_msg);
                        res.send({status: false, error: err_msg});
                    } else{
                        client.executing = true;
                        client.bulk_objects = [];
                        var index = 0, tps_index = 0;

                        async.whilst(function() {
                                return index < bulk_amount && client.executing == true;
                            },
                            function(next) {
                                if (isArray(message)){
                                    execute_message_action(
                                        client.session,
                                        message,
                                        function(return_object){ client.bulk_objects.push(return_object); }
                                    );
                                }else{
                                    var m_message = inspect(message);
                                    m_message = update_tag_random_value_in_message(m_message);
                                    var fix_object = {
                                        state: false,
                                        error: null,
                                        messages: []
                                    }
                                    fix_object.messages.push(m_message);
                                    client.bulk_objects.push(fix_object);

                                    client.session.sendMsgCallback(m_message, function(msg) {
                                        fix_object.messages.push(msg);

                                        if (msg[35] == 3 || msg[35] == 9 || msg[35] == 'AG' || msg[35] == 'j' ||
                                            msg[39] == '8' ||
                                            msg[150] == '8'){
                                                fix_object.state = false;
                                                fix_object.error = msg[58];
                                        } else {
                                            fix_object.state = true;
                                        }
                                    });
                                }

                                index++;
                                tps_index++;
                                if (tps_index == bulk_tps){
                                    tps_index = 0;
                                    setTimeout(function(){ next(); }, 1000);
                                }else{
                                    next();
                                }
                            },
                            function(err) {
                                client.executing = false;
                                if (err){
                                    res.send({ status: false, error: err });
                                }
                            }
                        );

                        res.send({ status: true });
                    }
                }
           })
        }
    });
});

router.post('/send/bulk/result', function(req, res) {
    var client_id = req.body.client;
    var detail = req.body.detail == undefined ? false : req.body.detail;

    var client = global.clients.get(client_id);

    util.isvalid_client(client, function(err){
        if (err){
            res.send({ status: false, error: err });
        } else {
            if (!detail)
            {
                res.send({
                    status: true,
                    count:  client.bulk_objects.length
                });
            }
            else
            {
                res.send({
                    status: true,
                    count:  client.bulk_objects.length,
                    detail: client.bulk_objects
                });
            }
        }
    });
});

router.post('/send/bulk/stop', function(req, res) {
    var client_id = req.body.client;

    var client = global.clients.get(client_id);
    util.isvalid_client(client, function(err){
        if (err){
            res.send({ status: false, error: err });
        } else {
            if (client.executing)
            {
                client.executing = false;
            }
            res.send({ status: true });
        }
    });
});

function remove_client(client_id, callback) {
    var client = global.clients.get(client_id);
    if (client != undefined)
    {
        global.clients.delete(client_id);
        callback(client.session);
    }
}


function execute_message_action(session, messages, callback){
    var action_count = messages.length;
    var index = 0;
    var object = {};
    var is_failure = false;

    object.messages = [];
    async.whilst(function() {
            return index < action_count && is_failure == false;
        },
        function(next) {
            var message_action = messages[index];
            index++;
            execute_action(session, message_action, object, function(return_object){
                if (!return_object.state)
                    is_failure = true;
                next();
            })
        },
        function(err) {
            if (err){
                error_in_message_actions == true;
                object.state = false;
                object.error = err;
            }

            callback(object);
        }
    );
}

function execute_action(session, action, fix_object, callback){
    var message = inspect(deepCopy(action));
    message = update_tag_random_value_in_message(message);
    message = update_asterisk_in_message(message, fix_object);

    fix_object.messages.push(message);

    session.sendMsgCallback(message, function(msg) {
        message = null;
        delete message;

        fix_object.messages.push(msg);

        if (msg[35] == 3 ||
            msg[35] == 9 ||
            msg[35] == 'AG' ||
            msg[35] == 'j' ||
            msg[39] == '8' ||
            msg[150] == '8'){
                fix_object.state = false;
                callback(fix_object);
        } else {
            fix_object.state = true;
            if(msg[150] != 'A' &&
               msg[150] != '6' &&
               msg[150] != 'E')
                callback(fix_object);
        }
    });
}

function deepCopy(obj) {
    if (Object.prototype.toString.call(obj) === '[object Array]') {
        var out = [], i = 0, len = obj.length;
        for ( ; i < len; i++ ) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    if (typeof obj === 'object') {
        var out = {}, i;
        for ( i in obj ) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    return obj;
}

function inspect(message){
    var object = {};

    object = deepCopy(message);
    if (object.hasOwnProperty(11)) {
        if (object[11] == "") object[11] = guid();
    }else{
        object[11] = guid();
    }

    if (object.hasOwnProperty(60)){
        if (object[60] == "") object[60] = new Date().getTime().toString();
    }else{
        object[60] = new Date().getTime().toString();
    }

    remove_empty_fixtags(object);

    return object
}

function remove_empty_fixtags(obj){
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (typeof(obj[key]) == "object")
            {
                if (obj[key]["value"] == "")
                {
                    delete obj[key];
                }
                else
                {
                    var fixgroups = obj[key]["groups"];
                    if (fixgroups != undefined)
                    {
                        fixgroups.forEach(function(g){
                            remove_empty_fixtags(g);
                        });
                    }
                }
            }
            else
            {
                if (obj[key] == "")
                {
                    delete obj[key];
                }
            }
        }
    }
}

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function isArray(obj) {
    return Array.isArray(obj);
}

function update_tag_random_value_in_message(message) {
    for (var key in message) {
        if (message.hasOwnProperty(key)) {
            if (Array.isArray(message[key]))
            {
                var random_result = Math.random()*message[key].length+1;
                var random_value = Math.floor(random_result);
                message[key] = random_value;
            }
        }
    }

    return message;
}

function update_asterisk_in_message(message, fixobj){
    if (fixobj.messages.length > 0){
        for (var key in message) {
            if (message.hasOwnProperty(key)) {
                if (message[key].startsWith(':'))
                {
                    var tag_name = message[key].replace(':','');
                    var tag_value = fixobj.messages[fixobj.messages.length-1][tag_name];
                    if (tag_value == undefined)
                        delete message[key];
                    else
                        message[key] = tag_value;
                }
            }
        }
    }

    return message;
}

module.exports = router;
