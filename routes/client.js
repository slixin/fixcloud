var express = require('express');
var router = express.Router();
var util = require('./util.js');
var fs = require('fs');
var FIXClient = require('./fixjs/fixClient.js');
var _ = require('underscore');
var async = require('async');
var dict = require('dict');
var isJSON = require('is-json');
var log4js = require('log4js');
var waitUntil = require('wait-until');
var now = require("performance-now")


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

    var build_message_index = function(client_id, key, message, message_guid) {
        var key_value = message[key];

        // The Index is exists
        if (global.clients.get(client_id).index.has(key)) {
            var index_dict = global.clients.get(client_id).index.get(key);
            if (index_dict.has(key_value)) {
                index_dict.get(key_value).push(message_guid);
            } else {
                var message_guid_array = [];
                message_guid_array.push(message_guid);
                index_dict.set(key_value, message_guid_array)
            }
        } else { // It is a new Index
            var index_dict = new dict();
            var message_guid_array = [];
            message_guid_array.push(message_guid);
            index_dict.set(key_value, message_guid_array);
            global.clients.get(client_id).index.set(key, index_dict);
        }
    }

    var save_message = function(client_id, message) {
        if (global.clients.get(client_id) != undefined){
            var message_guid = util.guid();
            global.clients.get(client_id).messages.set(message_guid, message);
            if ('11' in message) { build_message_index(client_id, '11', message, message_guid); };
            if ('198' in message) { build_message_index(client_id, '198', message, message_guid); };
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
                            messages: dict(),
                            index: dict(),
                            bulk: dict()
                        });
                        res.send({ status: true, client_id: client_id, listener_port: listen_port });
                    });
                    session.on('msg', function(msg) {
                        if (msg[35] != '0' && msg[35] != '1') {
                            if (msg[35] == '5'){
                                global.clients.delete(client_id);
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
                        global.clients.delete(client_id);
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
    var client = global.clients.get(client_id);
    if (client != undefined) {
        client.session.sendLogoff();
        res.send({ status: true });
    } else {
        res.send( {status: false, error: 'client does not exists'});
    }
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

    sendmessage(client, client_id, message, function(result, key) {
        var messages = [];
        var key_name = Object.keys(key)[0];
        var key_value = key[key_name];
        var index_dict = global.clients.get(client_id).index.get(key_name);
        var message_guids = index_dict.get(key_value);

        message_guids.forEach(function(m) {
            messages.push(global.clients.get(client_id).messages.get(m));
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
    var bulk_refer_id = req.body.refer_id;

    var new_bulk_id = util.guid();
    var new_bulk = {
        id: new_bulk_id,
        state: 1, //0 - stop, 1 - running, 2 - error
        create_time: Date.now(),
        messages: []
    }
    client.bulk.set(new_bulk_id, new_bulk);

    if (message != undefined) {
        if ((typeof message) == "string") {
            message = JSON.parse(message);
        }
    }

    var refer_messages = [];
    if (bulk_refer_id != undefined) {
        var refer_bulk = client.bulk.get(bulk_refer_id);
        refer_bulk.messages.forEach(function(rm) {
            var last_refer_msg = rm.values[rm.values.length - 1];
            refer_messages.push(last_refer_msg);
        });
        bulk_amount = refer_messages.length;
    }

    var interval = (bulk_tps >= 1000) ? 1 : (1000 / bulk_tps - 0.3);
    var index = 0;
    new_bulk.state = 1; // Start bulking

    async.whilst(function() {
            return index < bulk_amount && new_bulk.state == 1;
        },
        function(next) {
            var message_template = deepCopy(message);
            var message_reference = deepCopy(refer_messages[index]);
            var message_sending = null;
            if (bulk_refer_id != undefined) {
                message_sending = build_message_from_reference(message_template, message_reference);
            } else {
                message_sending = message_template;
            }
            sendmessage(client, client_id, message_sending, function(result, key) {
                var messages = [];
                var key_name = Object.keys(key)[0];
                var key_value = key[key_name];
                var index_dict = global.clients.get(client_id).index.get(key_name);
                var message_guids = index_dict.get(key_value);

                message_guids.forEach(function(m) {
                    messages.push(global.clients.get(client_id).messages.get(m));
                });

                new_bulk.messages.push( {
                    key: key_value,
                    values: messages
                });
            });
            setTimeout(function(){ index++; next(); }, interval);
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
                count:  bulk.messages.length
            });
        } else {
            var result = {
                status: bulk.state,
                count:  bulk.messages.length,
                messages: bulk.messages
            };
            res.send(result);
        }
    }
});

router.post('/message/get', function(req, res) {
    var client_id = req.body.client;
    var client = global.clients.get(client_id);
    var messages = [];
    var keys = req.body.keys;
    if (keys != undefined) {
        if ((typeof keys) == "string") {
            keys = JSON.parse(keys);
        }
    }

    keys.forEach(function(key) {
        var key_name = Object.keys(key)[0];
        var key_value = key[key_name];
        var key_messages = [];

        var index_dict = client.index.get(key_name);
        var message_guids = index_dict.get(key_value);

        message_guids.forEach(function(m) {
            key_messages.push(global.clients.get(client_id).messages.get(m));
        });

        messages.push( { key: key_value, messages: key_messages});
    });
    res.send({
        status: true,
        messages: messages
    });
});

// router.post('/send/bulk/result/detail', function(req, res) {
//     var client_id = req.body.client;
//     var bulk_id = req.body.bulk_id;
//     var order_initial_id = req.body.order_id;

//     var client = global.clients.get(client_id);
//     var bulk = client.bulk.get(bulk_id);

//     if (bulk == undefined) {
//         res.send ({status: false, error: 'Cannot find Bulking ' +bulk_id});
//     } else {
//         var result = bulk.orders.filter(function(o) { return o.order_initial_id == order_initial_id});
//         if (result.length > 0) {
//             res.send({
//                 status: true,
//                 order: result[0]
//             });
//         } else {
//             res.send({
//                 status: false,
//                 error: 'Cannot find order: ' +order_initial_id
//             });
//         }
//     }
// });

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

var sendmessage = function(client, client_id, message, callback) {
    var resp_status = false;
    var messageClone = deepCopy(message);
    var s_key = {};
    var s_message = { value: null, expected: null };

    if ('value' in messageClone) {
        s_message.value = enhance_message(messageClone.value);
    } else {
        s_message.value = enhance_message(messageClone);
    }
    if ('expected' in messageClone){
        s_message.expected = messageClone.expected;
    } else {
        switch(messageClone[35]) {
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
    if ('11' in s_message.value){
        s_key = {"11" : s_message.value[11]};
    } else if ('198' in s_message.value) {
        s_key = {"198" : s_message.value[198]};
    }

    client.session.sendMsg(s_message.value);

    var key_name = Object.keys(s_key)[0];
    var key_value = s_key[key_name];
    waitUntil()
        .interval(10)
        .times(100)
        .condition(function() {
            var index_dict = global.clients.get(client_id).index.get(key_name);
            var message_guids = index_dict.get(key_value);
            var found_msg = null;
            message_guids.forEach(function(m) {
                var msg = global.clients.get(client_id).messages.get(m);
                if (is_message_with_expected_tags(msg, s_message.expected))
                    found_msg = msg;
            });
            return found_msg == undefined ?  false : true;
        })
        .done(function(result) {
            callback(result, s_key);
        });
};

var is_message_with_expected_tags = function(message, expected) {
    var is_found = true;
    for (var exp_key in expected) {
        if (expected.hasOwnProperty(exp_key)){
            if (exp_key in message) {
                if (message[exp_key] != expected[exp_key]) {
                    is_found = false;
                    return;
                }
            } else {
                is_found = false;
                return;
            }
        }
    }

    return is_found;
}

var build_message_from_reference = function(message_template, reference_message){
    for (var key in message_template) {
        if (message_template.hasOwnProperty(key)) {
        	if (message_template[key] == undefined) {
        		delete message_template[key];
        	} else {
        		var value = message_template[key].toString();
	            if (value.indexOf(':') === 0)
	            {
	            	var tag_name = message_template[key].replace(':','');
	                var tag_value = null;
	                if (tag_name in reference_message) {
	                    tag_value = reference_message[tag_name];
	                }
	                if (tag_value == undefined)
	                    delete message_template[key];
	                else
	                    message_template[key] = tag_value;
	            }
        	}
        }
    }
    return message_template;
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
