var express = require('express');
var router = express.Router();
var util = require('util');
var fs = require('fs');
var FIXClient = require('./fixjs/fixClient.js');
var FIXServer = require('./fixjs/fixServer.js');
var _ = require('underscore');
var async = require('async');

router.post('/create', function(req, res) {
    var sid = req.body.sessionId;
    var order_count = req.body.order_count;
    var session = global.sessions.get(sid).session;

    var new_order_object = JSON.parse(req.body.order);
    console.log("##### new order data #####");
    console.log(new_order_object);

    create_order(session, new_order_object, order_count, function(success, failure) {
        var s = failure.length > 0 ? false : true
        res.send({
            status: s,
            success: success.length,
            orders: success,
            failure: failure
        });
    });
});

router.post('/cancel', function(req, res) {
    var sid = req.body.sessionId;
    var orders = JSON.parse(req.body.orders);
    var session = global.sessions.get(sid).session;

    cancel_order(session, orders, function(success, failure) {
        var s = failure.length > 0 ? false : true
        res.send({
            status: s,
            success: success.length,
            orders: success,
            failure: failure
        });
    });
});

router.post('/amend', function(req, res) {
    var sid = req.body.sessionId;
    var orders = JSON.parse(req.body.orders);
    var session = global.sessions.get(sid).session;

    amend_order(session, orders, function(success, failure) {
        var s = failure.length > 0 ? false : true
        res.send({
            status: s,
            success: success.length,
            orders: success,
            failure: failure
        });
    });
});



function create_order(session, new_order, count, callback) {
    var neworders = [];
    var index = 0;
    var errororders = [];

    async.whilst(function() {
            return index < count;
        },
        function(next) {
            new_order[35] = 'D'
            new_order[11] = guid();
            new_order[60] = new Date().getTime().toString(); // transctTime

            console.log("##### create new order #####");
            console.log(new_order);

            session.sendMsgCallback(new_order, function(message, state) {
                if (state) {
                    if (is_order_created(message, new_order[11])) {
                        neworders.push(message);
                        index++;
                        next();
                    }
                } else {
                    errororders.push(message);
                    index++;
                    next();
                }
            });
        },
        function(err) {
            callback(neworders, errororders);
        }
    );
}

function cancel_order(session, orders, callback) {
    var cancelled_orders = [];
    var errororders = [];
    var index = 0;

    async.whilst(function() {
            return index < orders.length;
        },
        function(next) {
            var c_order = {};
            var o_order = orders[index];
            c_order[41] = o_order[11];
            c_order[35] = 'F'
            c_order[11] = guid();
            c_order[60] = new Date().getTime().toString(); // transctTime
            c_order[48] = o_order[48];
            c_order[22] = o_order[22];
            c_order[54] = o_order[54];
            session.sendMsgCallback(c_order, function(message, state) {
                if (state) {
                    if (is_order_cancelled(message, c_order[11])) {
                        cancelled_orders.push(message);
                        index++;
                        next();
                    }
                } else {
                    errororders.push(message);
                    index++;
                    next();
                }

            });
        },
        function(err) {
            callback(cancelled_orders, errororders);
        }
    );
}

function amend_order(session, orders, callback) {
    var amended_orders = [];
    var errororders = [];
    var index = 0;

    async.whilst(function() {
            return index < orders.length;
        },
        function(next) {
            var a_order = orders[index];
            a_order[41] = a_order[11];
            a_order[35] = 'G'
            a_order[11] = guid();
            a_order[60] = new Date().getTime().toString(); // transctTime

            session.sendMsgCallback(a_order, function(message, state) {
                if (state) {
                    if (is_order_amended(message, a_order[11])) {
                        amended_orders.push(message);
                        index++;
                        next();
                    }
                } else {
                    errororders.push(message);
                    index++;
                    next();
                }

            });
        },
        function(err) {
            callback(amended_orders, errororders);
        }
    );
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

function is_order_in_state(message, clOrdId, state_150, state_39) {
    var tag11 = message[11];
    var tag39 = message[39];
    var tag150 = message[150];

    if (tag11 != undefined && tag150 != undefined && tag39 != undefined) {
        if (tag11 == clOrdId && tag150 == state_150 && tag39 == state_39) {
            return true;
        }
    }

    return false;
}

function is_order_created(message, clOrdId) {
    return is_order_in_state(message, clOrdId, 0, 0);
}

function is_order_cancelled(message, clOrdId) {
    return is_order_in_state(message, clOrdId, 4, 4);
}

function is_order_amended(message, clOrdId) {
    return is_order_in_state(message, clOrdId, 5, 0);
}



module.exports = router;
