var express = require('express');
var router = express.Router();
var util = require('util');
var fs = require('fs');
var FIXClient = require('./fixjs/fixClient.js');
var _ = require('underscore');

router.post('/logon', function (req, res) {
    var sendercompid = req.body.senderid;
    var targetcompid = req.body.targetid;
    var host = req.body.host;
    var port = req.body.port;
    var version = req.body.version;

    console.log("Connecting "+host+":"+port+" sender:"+sendercompid+" target:"+targetcompid);

    var client = new FIXClient("FIX."+version, sendercompid, targetcompid, {});
    client.init(function(clientx) {
      client.createConnection(
        { port: port, host: host},
        function(error){ if (error) res.send({status: "error", exception: error}); },
        function(session) {
          var sid = session.getID();
          if (global.sessions.has(sid))
            res.send({status: "ok", sessionid: sid});

          session.on('logon', function() {
            var sid = session.getID();
            var sessionvalue = { session: client, messages: [] };
            global.sessions.set(sid, sessionvalue);
            res.send({status: "ok", sessionid: sid});
          });
          session.on('msg', function(msg) {
            util.log(">>>>>CLIENT-MSG:" + JSON.stringify(msg));
            if (msg[35] != 0 && msg[35] != 1)
            {
              var sid = session.getID();
              if (sid != null)
              {
                var message = { direction: "incoming", message: msg };
                if (global.sessions.has(sid))
                  global.sessions.get(sid).messages.unshift(message);
              }
            }
          });
          session.on('outmsg', function(msg) {
            util.log("<<<<<CLIENT-OUTMSG:" + JSON.stringify(msg));
            if (msg[35] != 0 && msg[35] != 1)
            {
              var sid = session.getID();
              if (sid != null)
              {
                var message = { direction: "outgoing", message: msg };
                if (global.sessions.has(sid))
                  global.sessions.get(sid).messages.unshift(message);
              }
            }
          });
          session.on('msg-resync', function(msg) {
            util.log(">>>>>CLIENT-RESYNC:" + JSON.stringify(msg));
          });
          session.on('outmsg-resync', function(msg) {
            util.log("<<<<<CLIENT-RESYNC:" + JSON.stringify(msg));
          });
          session.on('error', function(msg) {
            util.log(">> >> >>CLIENT:" + JSON.stringify(msg));
          });
          session.on('state', function(msg) {
           util.log("-----CLIENT STATE");
          });
          session.on('disconnect', function(msg) {
            util.log("-----CLIENT DISCONNECT");
            try {res.send({status: "error", exception: "disconnected"}); } catch(err){console.log(err)}
          });
          session.sendLogon();
        });
    });
});

router.post('/logout', function (req, res) {
    var sid = req.body.sessionId;
    var session = global.sessions.get(sid).session;
    session.sendLogoff();
    global.sessions.delete(sid);
    res.send({status: "ok"});
});

router.post('/send', function(req, res){
  var sid = req.body.sessionId;
  var message = req.body.message;
  var session = global.sessions.get(sid).session;

  session.sendMsg(JSON.parse(message));
  res.send({status: "ok"});
});

router.post('/getmessages', function(req,res){
  var sid = req.body.sessionId;
  res.send({status: "ok", messages: global.sessions.get(sid).messages});
});

router.post('/resetmessages', function(req,res){
  var sid = req.body.sessionId;
  console.log(global.sessions.get(sid).messages);
  global.sessions.get(sid).messages = [];
  res.send({status: "ok"});
});

module.exports = router;

