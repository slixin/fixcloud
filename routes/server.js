var express = require('express');
var router = express.Router();
var util = require('util');
var fs = require('fs');
var FIXServer = require('./fixjs/fixServer.js');
var _ = require('underscore');
var portfinder = require('portfinder');
var async = require('async');

var getFreePort = function(base, callback){
    portfinder.basePort = base;
    portfinder.getPort(function(err, port) {
        callback(port);
    });
}

var getReservedPortList = function(){
    var portList = [];

    global.servers.forEach(function (value, key) {
        if (value != undefined)
        {
            var userservers = value.settings.servers;
            if (userservers != undefined)
            {
                userservers.forEach(function(us){
                    if (us.port != undefined)
                        portList.push(us.port);
                });
            }
        }
    });

    return portList;
}

var is_port_occupied = function(portList, port){
    var reservedports = portList.filter(function(p) {
        return p == port;
    });

    if (reservedports.length > 0)
        return true;
    else
        return false;
}

var isPortInUse = function(port){
    getFreePort(port, function(p){
        if(p == port)
            return false;
        else
            return true;
    });
}

// router.get('/port/new', function(req, res){
//     var isReserved = false;
//     var port = 20000;

//     while(isReservedPort(getReservedPortList(), port) || isPortInUse(port))
//     {
//         port = port +1;
//     }

//     res.send({
//         status:true,
//         port: port
//     });
// });

// router.post('/port/isoccupied', function(req, res){
//     var expect_port = req.body.port;

//     if (isReservedPort(getReservedPortList(), expect_port) || isPortInUse(expect_port) )
//     {
//         res.send({
//             status: true
//         });
//     }
//     else
//     {
//         res.send({
//             status: false
//         });
//     }
// });

router.post('/online', function(req, res) {
    var server_id = req.body.server_id;
    var server_port = req.body.port;

    create = function(port, callback) {
        var server = new FIXServer({});
        server.on('logon', function(id) {
            //util.log(">>>>>SERVER-LOGON(" + id + ")");
        });
        server.on('msg', function(id, msg) {
            //util.log(">>>>>SERVER(" + id + "):" + JSON.stringify(msg));
            console.log("IN:"+JSON.stringify(msg));
        });
        server.on('outmsg', function(id, msg) {
            //util.log("<<<<<SERVER(" + id + "):" + JSON.stringify(msg));
            console.log("OUT:"+JSON.stringify(msg));
        });
        server.on('msg-resync', function(id, msg) {
            //util.log(">>>>>SERVER-RESYNC(" + id + "):" + JSON.stringify(msg));
        });
        server.on('outmsg-resync', function(id, msg) {
            //util.log("<<<<<SERVER-RESYNC(" + id + "):" + JSON.stringify(msg));
        });
        server.on('state', function(id, msg) {
            //util.log("-----SERVER("+id+"):"+JSON.stringify(msg));
        });
        server.on('error', function(id, msg) {
            //util.log(">> >> >>SERVER(" + id + "):" + JSON.stringify(msg));
        });
        server.listen(port);
        global.servers.set(port.toString(), server);
        console.log("FIX Server listening on port " + port);
        callback(server);
    }

    create(server_port, function(server){
        // global.webSocketServer.once('connection', function(ws) {
        //     server.on('msg', function(id, msg) {
        //         // if (msg['35'] != '0' && msg['35'] != '1' && msg['35'] != 'A' & msg['35'] !='5')
        //         // {
        //         //     var now = new Date();
        //         //     var utc_now = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
        //         //     var message = {
        //         //         server_id: server_id,
        //         //         direction: "incoming",
        //         //         message: msg,
        //         //         message_time: utc_now.Format('yyyy-MM-dd hh:mm:ss S')
        //         //     };
        //         //     global.webSocketServer.broadcast(JSON.stringify(message));
        //         // }
        //     });
        //     server.on('outmsg', function(id, msg) {
        //         // if (msg['35'] != '0' && msg['35'] != '1' && msg['35'] != '5' )
        //         // {
        //         //     var now = new Date();
        //         //     var utc_now = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
        //         //     var message = {
        //         //         server_id: server_id,
        //         //         direction: "outgoing",
        //         //         message: msg,
        //         //         message_time: utc_now.Format('yyyy-MM-dd hh:mm:ss S')
        //         //     };
        //         //     global.webSocketServer.broadcast(JSON.stringify(message));
        //         // }
        //     });

        //     // global.webSocketServer.on('close', function() { console.log("web socket closed.") });
        // });
        res.send({
            status: true
        });
    })
});

router.post('/offline', function(req, res) {
    var port = req.body.port;

    if (global.servers.has(port.toString())) {
        global.servers.get(port.toString()).close();
        global.servers.delete(port.toString());
        res.send({
            status: true
        });
    } else {
        res.send({
            port: port,
            status: false,
            errmsg: 'Port is not exists'
        });
    }
});

router.post('/echo', function(req, res) {
    var port = req.body.port;
    var msg = JSON.parse(req.body.message);

    if (global.servers.has(port.toString())) {
        var server = global.servers.get(port.toString());
        server.echo(msg);
        res.send({
            status: true
        });
    } else {
        res.send({
            status: false,
            errmsg: 'Port '+ port +' is not exists.'
        });
    }
});

module.exports = router;
