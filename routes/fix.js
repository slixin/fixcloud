var express = require('express');
var router = express.Router();
var util = require('util');
var fs = require('fs');
var FIXClient = require('./fixjs/fixClient.js');
var FIXServer = require('./fixjs/fixServer.js');
var _ = require('underscore');
var portfinder = require('portfinder');

router.get('/createServer', function(req, res) {
    portfinder.basePort = 20000;
    portfinder.getPort(function(err, port) {
        create(port);
        res.send({
            port: port,
            status: 'ok'
        });
    });

    create = function(port) {
        var compid =
            console.log("FIX Server listening on port " + port);

        var server = new FIXServer({});
        server.on('logon', function(id) {
            //util.log(">>>>>SERVER-LOGON(" + id + ")");
        });
        server.on('msg', function(id, msg) {
            //util.log(">>>>>SERVER(" + id + "):" + JSON.stringify(msg));
            if (msg['35'] == 'D') server.echo(msg);
        });
        server.on('outmsg', function(id, msg) {
            //util.log("<<<<<SERVER(" + id + "):" + JSON.stringify(msg));
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
    }
});

router.post('/deleteServer', function(req, res) {
    var port = req.body.server_port;

    if (global.servers.has(port.toString())) {
        global.servers.get(port.toString()).close();
        global.servers.delete(port.toString());
        res.send({
            port: port,
            status: 'ok'
        });
    } else {
        res.send({
            port: port,
            status: 'fail',
            errmsg: 'Port is not exists'
        });
    }
});

router.post('/logon', function(req, res) {
    var sendercompid = req.body.senderid;
    var targetcompid = req.body.targetid;
    var host = req.body.host;
    var port = req.body.port;
    var version = req.body.version;
    var messageSize = 10000;

    console.log("Connecting " + host + ":" + port + " sender:" + sendercompid + " target:" + targetcompid);

    var client = new FIXClient("FIX." + version, sendercompid, targetcompid, {});
    client.init(function(clientx) {
        client.createConnection({
                port: port,
                host: host
            },
            function(error) {
                if (error) res.send({
                    status: "error",
                    exception: error
                });
            },
            function(session) {
                var sid = session.getID();
                if (global.sessions.has(sid))
                    res.send({
                        status: "ok",
                        sessionid: sid
                    });

                session.on('logon', function() {
                    var sid = session.getID();
                    var sessionvalue = {
                        session: client,
                        messages: []
                    };
                    global.sessions.set(sid, sessionvalue);
                    res.send({
                        status: "ok",
                        sessionid: sid
                    });
                });
                session.on('msg', function(msg) {
                    //util.log("IN:" + JSON.stringify(msg));
                    if (msg.indexOf("35=0") > -1 || msg.indexOf("35=1") > -1 || msg.indexOf("35=A") > -1)
                      return;

                    var sid = session.getID();
                    if (sid != null) {
                        var message = {
                            direction: "incoming",
                            message: msg
                        };
                        if (global.sessions.has(sid)) {
                            if (global.sessions.get(sid).messages.length >= messageSize)
                            {
                              global.sessions.get(sid).messages.splice(-1,1);
                            }
                            global.sessions.get(sid).messages.unshift(message);
                        }

                    }
                });
                session.on('outmsg', function(msg) {
                    //util.log("OUT:" + JSON.stringify(msg));
                    if (msg.indexOf("35=0") > -1 || msg.indexOf("35=1") > -1 || msg.indexOf("35=A") > -1)
                      return;

                    var sid = session.getID();
                    if (sid != null) {
                        var message = {
                            direction: "outgoing",
                            message: msg
                        };
                        if (global.sessions.has(sid)) {
                            if (global.sessions.get(sid).messages.length >= messageSize)
                            {
                              global.sessions.get(sid).messages.splice(-1,1);
                            }
                            global.sessions.get(sid).messages.unshift(message);
                        }
                    }
                });
                session.on('msg-resync', function(msg) {
                    //util.log(">>>>>CLIENT-RESYNC:" + JSON.stringify(msg));
                });
                session.on('outmsg-resync', function(msg) {
                    //util.log("<<<<<CLIENT-RESYNC:" + JSON.stringify(msg));
                });
                session.on('error', function(msg) {
                    //util.log(">> >> >>CLIENT:" + JSON.stringify(msg));
                });
                session.on('state', function(msg) {
                    //util.log("-----CLIENT STATE");
                });
                session.on('disconnect', function(msg) {
                    //util.log("-----CLIENT DISCONNECT");
                    try {
                        res.send({
                            status: "error",
                            exception: "disconnected"
                        });
                    } catch (err) {
                        console.log(err)
                    }
                });
                session.sendLogon();
            });
    });
});

router.post('/logout', function(req, res) {
    var sid = req.body.sessionId;
    var session = global.sessions.get(sid).session;
    session.sendLogoff();
    global.sessions.delete(sid);
    res.send({
        status: "ok"
    });
});

router.post('/send', function(req, res) {
    var sid = req.body.sessionId;
    var message = req.body.message;
    var session = global.sessions.get(sid).session;

    session.sendMsg(JSON.parse(message));
    res.send({
        status: "ok"
    });
});

router.post('/getmessages', function(req, res) {
    var sid = req.body.sessionId;
    res.send({
        status: "ok",
        messages: global.sessions.get(sid).messages
    });
});

router.post('/resetmessages', function(req, res) {
    var sid = req.body.sessionId;
    global.sessions.get(sid).messages = [];
    res.send({
        status: "ok"
    });
});

module.exports = router;
