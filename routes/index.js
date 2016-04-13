var express = require('express');
var passport = require("passport");
var router = express.Router();
var fs = require("fs");
var path = require('path');
var portfinder = require('portfinder');
var socket_io = require('socket.io')
var http = require('http');

var listener_server = http.createServer(function(){});

/* GET home page. */
router.get('/', function (req, res) {
    res.redirect("/index.html");
});

router.post('/user/load', ensureAuthenticated, function (req, res){
    var userId = req.body.userid;
    var user = {
        id: userId,
        settings: null
    };
    if (global.users.has(userId)) {
        user.settings = global.users.get(userId).settings;
        res.send({status:true, user: user});
    } else {
        var userFile = path.resolve(global.rootpath+"/usersettings/"+userId+".json");
        fs.exists(userFile, function(exists) {
            if (exists) {
                fs.readFile(userFile, 'utf8', function(err, data) {
                    if (err) res.send({status:false, error: err});
                    else{
                        user.settings = JSON.parse(data).settings;
                        startClientlistener(user, function(listener) {
                            var cached_user = {
                                id: user.id,
                                settings: user.settings,
                                listener: listener
                            }
                            global.users.set(userId, cached_user);
                            res.send({status:true, user: user});
                        });
                    }
                });
            }
            else
            {
                startClientlistener(user, function(listener) {
                    var cached_user = {
                        id: user.id,
                        settings: user.settings,
                        listener: listener
                    }
                    global.users.set(userId, cached_user);
                    fs.writeFile(userFile, JSON.stringify(user), 'utf8', function(err) {
                        if (err) { res.send({status:false, error: err}); }
                        else { res.send({status:true, user: user}); }
                    });
                });
            }
        });
    }
})

router.post('/user/save', ensureAuthenticated, function (req, res){
    var user = req.body.user;
    var user_id = user.id;
    var userFile = path.resolve(global.rootpath+"/usersettings/"+user_id+".json");
    global.users.get(user_id).settings = user.settings;
    fs.writeFile(userFile, JSON.stringify(user), 'utf8', function(err) {
        if (err) { res.send({status:false, error: err}); }
        else { res.send({status:true}); }
    });
})

router.post('/protocol/messagetypes', function (req, res){
    var version = req.body.version;
    var messagetypes = [];
    var protocols = global.protocols.get(version);
    if (protocols != undefined)
    {
        protocols.fix.messages.message.forEach(function(msgtype){
            var messagetype = {
                displayname: msgtype._name,
                type: msgtype._msgtype
            }
            messagetypes.push(messagetype);
        });

        messagetypes.sort(function(a, b) {if (a.name < b.name)  return -1; if (a.name > b.name) return 1;  return 0;});

        res.send({status:true, messagetypes: messagetypes});
    }
    else
    {
        res.send({status:false, error: "Version:"+version+", No protocol definition file."});
    }
})

router.post('/protocol/fields', function (req, res){
    var version = req.body.version;
    var fields = [];
    var protocols = global.protocols.get(version);
    if (protocols != undefined)
    {
        protocols.fix.fields.field.forEach(function(f){
            var field = {
                displayname: f._name,
                field: f._number,
                values: [],
            }
            if(f.hasOwnProperty("value"))
            {
                if (Array.isArray(f.value))
                {
                    f.value.forEach(function(v){
                        var value_pair = {
                            value: v._enum,
                            name: v._description
                        };
                        field.values.push(value_pair);
                    });
                }
                else
                {
                    field.values.push(f.value);
                }
            }
            fields.push(field);
        });

        res.send({status:true, fields: fields});
    }
    else
    {
        res.send({status:false, error: "Version:"+version+", No protocol definition file."});
    }
});

var startClientlistener = function(user, callback) {
    portfinder.basePort = 40000;
    portfinder.getPort(function(err, port) {
        if (err) util.request_error(res, err);

        var io = socket_io(port);
        var listener = {
            port: port,
            socket: io
        };

        io.on('connection', function (socket) {
            socket.on('message', function (from, msg) { console.log('From: ' + from + ', message:' + msg) });
            socket.on('disconnect', function () { socket.disconnect() });
        });
        callback(listener);
    });
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.status(404);
    res.send("No authentication");
}

module.exports = router;
