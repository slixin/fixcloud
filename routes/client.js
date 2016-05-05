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
var waitUntil = require('wait-until');

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

router.post('/connect', function(req, res) {
    var sendercompid = req.body.senderid;
    var targetcompid = req.body.targetid;
    var host = req.body.host;
    var port = req.body.port;
    var version = req.body.version;
    var user_id = req.body.user;

    var user = null;
    var listen_port = null;

    if (user_id != undefined){
        user = global.users.get(user_id);
        listen_port = user.listener.port;
    }

    var logonTimer = setTimeout(function() { res.send({ status: false, error: 'Logon time out' }); }, 5000);

    var save_message = function(client_id,msg) {
        if (global.clients.get(client_id) != undefined){
            if ('11' in msg) {
                if (global.clients.get(client_id).messages.has(msg[11])) {
                    var msglist = global.clients.get(client_id).messages.get(msg[11]);
                    msglist.push(msg);
                    global.clients.get(client_id).messages.set(msg[11], msglist);
                } else {
                    var msglist = [];
                    msglist.push(msg);
                    global.clients.get(client_id).messages.set(msg[11], msglist);
                }
            };
        }
    };

    var client_id = host + "|" + port + "|" + version + "-" + sendercompid + "-" + targetcompid;
    var client_obj = global.clients.get(client_id);
    if (client_obj){
        clearTimeout(logonTimer);
        res.send({ status: true, client_id: client_id, listener_port: listen_port });
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
                            messages: new dict(),
                            bulk: new dict()
                        });
                        res.send({ status: true, client_id: client_id, listener_port: listen_port });
                    });
                    session.on('msg', function(msg) {
                        if (msg[35] != '0' && msg[35] != '1') {
                            if (msg[35] == '5'){
                                remove_client(client_id, function(session){
                                    session.sendLogoff();
                                });
                            } else {
                                save_message(client_id, msg);
                                if (user != undefined)
                                    user.listener.socket.emit('message', {
                                    direction: 0, //incoming
                                    message: msg,
                                    message_time: new Date().getTime(),
                                    session_id: client_id
                                });
                            }
                        }
                    });
                    session.on('outmsg', function(msg) {
                        if (msg[35] != 0 && msg[35] != 1){
                            save_message(client_id, msg);
                            if (user != undefined)
                                user.listener.socket.emit('message', {
                                direction: 1, //outgoing
                                message: msg,
                                message_time: new Date().getTime(),
                                session_id: client_id
                            });
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
        res.send({ status: true });
        session.sendLogoff();
    });
});

router.post('/send', function(req, res) {
    var client_id = req.body.client;
    var client = global.clients.get(client_id);
    var message = req.body.message;
    if (message != undefined) {
        if ((typeof message) == "string") {
            message = JSON.parse(message);
        }
    }

    sendmessage(client, client_id, message, null, function(result, key_list) {
        var messages = [];
        key_list.forEach(function(key) {
            messages.push({key: key, messages:global.clients.get(client_id).messages.get(key)});
        });

        res.send({ status: result, messages: messages});
    });
});

router.post('/send/bulk', function(req, res) {
    var client_id = req.body.client;
    var client = global.clients.get(client_id);
    var message = req.body.message;
    var bulk_amount = req.body.amount;
    var bulk_tps = req.body.tps == undefined ? 1 : req.body.tps;
    var reference_bulk_id = req.body.reference_bulk_id;
    var reference_bulk = null;
    var new_bulk_id = util.guid();
    var new_bulk = {
        id: new_bulk_id,
        state: 1, //0 - stop, 1 - running, 2 - error
        create_time: Date.now(),
        orders: []
    }
    client.bulk.set(new_bulk_id, new_bulk);

    if (message != undefined) {
        if ((typeof message) == "string") {
            message = JSON.parse(message);
        }
    }

    if (reference_bulk_id != undefined) {
        reference_bulk = client.bulk.get(reference_bulk_id);
        if (reference_bulk == null) {
            res.send({ status: false, error: "The reference bulk running "+reference_bulk_id+" is not exists." });
            return;
        } else {
            bulk_amount = reference_bulk.orders.length;
        }
    }

    var interval = (1000 / bulk_tps - 0.3);
    var index = 0;
    new_bulk.state = 1; // Start bulking

    async.whilst(function() {
            return index < bulk_amount && new_bulk.state == 1;
        },
        function(next) {
            var reference = null;
            if (reference_bulk != undefined){
                var refer_order = reference_bulk.orders[index];
                var refer_order_msgs = refer_order.order_messages[refer_order.order_messages.length-1];
                reference = refer_order_msgs.messages[refer_order_msgs.messages.length - 1];
            }
            sendmessage(client, client_id, message, reference, function(result, key_list) {
                var messages = [];
                var k = key_list[0];
                key_list.forEach(function(key) {
                    messages.push({key: key, messages:global.clients.get(client_id).messages.get(key)});
                });
                new_bulk.orders.push( {
                    "order_initial_id": k,
                    "order_status": result,
                    "order_messages" :  messages
                });
            });
            index++;
            setTimeout(function(){ next(); }, interval);
        },
        function(err) {
            if (err) console.log(err);
            new_bulk.state = 0;
        }
    );

    res.send({ status: true, id: new_bulk_id });
});

router.post('/send/bulk/result', function(req, res) {
    var client_id = req.body.client;
    var bulk_id = req.body.id;
    var detail = req.body.detail == undefined ? false : req.body.detail;

    var client = global.clients.get(client_id);
    var bulk = client.bulk.get(bulk_id);

    if (bulk == undefined) {
        res.send ({status: false, error: 'Cannot find Bulking ' +bulk_id});
    } else {
        if (!detail){
            res.send({
                status: bulk.state,
                count:  bulk.orders.length
            });
        } else {
            var result = {
                status: bulk.state,
                count:  bulk.orders.length,
                orders: []
            };
            bulk.orders.forEach(function(o) {
                result.orders.push({
                    "order_initial_id": o.order_initial_id,
                    "order_status": o.order_status,
                });
            })
            res.send(result);
        }
    }
});

router.post('/send/bulk/result/detail', function(req, res) {
    var client_id = req.body.client;
    var bulk_id = req.body.bulk_id;
    var order_initial_id = req.body.order_id;

    var client = global.clients.get(client_id);
    var bulk = client.bulk.get(bulk_id);

    if (bulk == undefined) {
        res.send ({status: false, error: 'Cannot find Bulking ' +bulk_id});
    } else {
        var result = bulk.orders.filter(function(o) { return o.order_initial_id == order_initial_id});
        if (result.length > 0) {
            res.send({
                status: true,
                order: result[0]
            });
        } else {
            res.send({
                status: false,
                error: 'Cannot find order: ' +order_initial_id
            });
        }
    }
});

router.post('/send/bulk/stop', function(req, res) {
    var client_id = req.body.client;
    var bulk_id = req.body.id;

    var client = global.clients.get(client_id);
    var bulk = client.bulk.get(bulk_id);

    if (bulk == undefined) {
        res.send ({status: false, error: 'Cannot find Bulking ' +bulk_id});
    } else {
        bulk.state = 0;
        res.send({ status: true });
    }
});

var sendmessage = function(client, client_id, message, reference, callback) {
    var message_queue = [];
    var message_key_list = [];
    if (Array.isArray(message)){
        message_queue = message;
    } else {
        message_queue.push(message);
    }
    var index = 0;
    var stop_whilst = false;
    var resp_status = false;
    var final_result = false;

    async.whilst(function() {
        return index < message_queue.length && stop_whilst == false;
    },
    function(next) {
        var message = message_queue[index];
        var s_message = {
            value: null,
            expected: null
        };

        index++;
        if ('value' in message) {
            s_message.value = message.value;
        } else {
            s_message.value = message;
        }
        if (('expected' in message)){
            s_message.expected = message.expected;
        } else {
            switch(message[35]) {
                case 'D':
                    s_message.expected = {'39':'0', '150':'0'}
                    break;
                case 'G':
                    s_message.expected = {'39':'0', '150':'5'}
                    break;
                case 'F':
                    s_message.expected = {'39':'4', '150':'4'}
                    break;
            }
        }
        sending_single(client, s_message, reference, function(key, expected) {
            if (key != undefined) {
                message_key_list.push(key);
                waitUntil().interval(10)
                           .times(50)
                           .condition(function() {
                                var msglist = global.clients.get(client_id).messages.get(key);
                                var found = true;
                                msglist.forEach(function(m) {
                                    for (var key in expected) {
                                        if (expected.hasOwnProperty(key)){
                                            if (key in m) {
                                                if (m[key] != expected[key]) {
                                                    found = false;
                                                    return;
                                                } else {
                                                    found = true;
                                                }
                                            } else {
                                                found = false;
                                                return;
                                            }
                                        }
                                    }
                                });
                                return (found);
                           })
                           .done(function(result) {
                                if (result) {
                                    var msglist = global.clients.get(client_id).messages.get(key);
                                    reference = msglist[msglist.length -1];
                                    final_result = true;
                                } else {
                                    stop_whilst = true;
                                    final_result = false;
                                }
                                next();
                           });
            }
        });
    },
    function(err) {
        if (err) console.log(err);
        callback(final_result, message_key_list);
    });
};

var build_message_from_reference = function(message_template, reference_message){
    var message = deepCopy(message_template);

    for (var key in message) {
        if (message.hasOwnProperty(key)) {
            if (message[key].startsWith(':'))
            {
                var tag_name = message[key].replace(':','');
                var tag_value = null;
                if (tag_name in reference_message) {
                    tag_value = reference_message[tag_name];
                }
                if (tag_value == undefined)
                    delete message[key];
                else
                    message[key] = tag_value;
            }
        }
    }

    return message;
}

var remove_client = function(client_id, callback) {
    var client = global.clients.get(client_id);
    if (client != undefined){
        global.clients.delete(client_id);
        callback(client.session);
    }
}

var sending_single = function(client, message, reference, callback) {
    var messageClone = deepCopy(message);
    var msg = enhance_message(messageClone.value);
    if (reference != undefined) {
        msg = build_message_from_reference(msg, reference);
    }
    client.session.sendMsg(msg);
    callback(msg[11], messageClone.expected);
}

var sending_bulk = function(client, message_list, bulk, interval, callback) {
    var index = 0;
    var keys = [];
    async.whilst(function() {
            return index < message_list.length && bulk.state == 1;
        },
        function(next) {
            keys.push(message_list[index][11]);
            client.session.sendMsg(message_list[index]);
            index++;
            setTimeout(function(){ next(); }, interval);
        },
        function(err) {
            if (err) { console.log(err); bulk.state = 2 }
            else { bulk.state = 0; }
            callback(keys);
        }
    );
}

var deepCopy = function(obj) {
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

var enhance_message = function(message) {
    var message_copy =deepCopy(message)
    update_mandatory_tags(message_copy);
    remove_empty_tags(message_copy);
    replace_random_tags(message_copy);
    return message_copy;
}

var update_mandatory_tags = function(message){
    var tag11 = util.convert_datetime(new Date())+util.random_string("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 4);

    if (message.hasOwnProperty(11)) {
        if (message[11] == "") message[11] = tag11;
    }else{
        message[11] = tag11;
    }

    if (message.hasOwnProperty(60)){
        if (message[60] == "") message[60] = new Date().getTime().toString();
    }else{
        message[60] = new Date().getTime().toString();
    }
}

var remove_empty_tags = function(message){
    for (var key in message) {
        if (message.hasOwnProperty(key)) {
            if (typeof(message[key]) == "object")
            {
                if (message[key]["value"] == "")
                {
                    delete message[key];
                }
                else
                {
                    var groups = message[key]["groups"];
                    if (groups != undefined)
                    {
                        groups.forEach(function(g){
                            remove_empty_tags(g);
                        });
                    }
                }
            }
            else
            {
                if (message[key] == "")
                {
                    delete message[key];
                }
            }
        }
    }
}

var replace_random_tags = function(message) {
    for (var key in message) {
        if (message.hasOwnProperty(key)) {
            if (Array.isArray(message[key]))
            {
                var value_array = message[key];
                message[key] = value_array[Math.floor(Math.random() * value_array.length)].toString();
            }
        }
    }

    return message;
}

module.exports = router;
