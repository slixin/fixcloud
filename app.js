var express = require('express');
var session = require('express-session');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dict = require("dict");
var passport = require("passport");
var FacebookStrategy = require('passport-facebook').Strategy;
var methodOverride = require('method-override');
var flash = require('connect-flash');
var authConfig = require('./authConfig');
var fs = require('fs');

var routes = require('./routes/index');
var client = require('./routes/client');
var server = require('./routes/server');
var auth = require('./routes/auth');

var app = express();

app.set('trust proxy', '172.17.0.20')
app.enable('trust proxy');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({limit: '5mb',  extended: true }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride());
app.use(session({secret: 'iress.node', resave:true,  saveUninitialized: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use('/', routes);
app.use('/client', client);
app.use('/server', server);
app.use('/auth', auth);

// ######### Global Variable ######
global.clients = new dict();
global.servers = new dict();
global.users = new dict();
global.protocols = new dict();
global.rootpath = __dirname;

load_fix_protocols();

function load_fix_protocols(){

    fs.readdir(path.resolve(global.rootpath+"/specs"), function(err, items) {
        items.forEach(function(item) {
            var version = item.substr(3, 2);
            var filename = path.resolve(global.rootpath+"/specs/fix"+version+".json");
            fs.readFile(filename, 'utf8', function(err, data) {
                if (err) throw err;
                var protocol_data = JSON.parse(data);
                var v = protocol_data.fix.major+protocol_data.fix.minor;
                global.protocols.set(v, protocol_data);
            });
        });
    });
}

// passport config
// =========================================================================
// FACEBOOK ================================================================
// =========================================================================
passport.use(new FacebookStrategy({
    clientID: process.env.FB_ID,//authConfig.facebookAuth.clientID,
    clientSecret: process.env.FB_SECRET,//authConfig.facebookAuth.clientSecret,
    callbackURL: process.env.FB_CALLBACKURL,//authConfig.facebookAuth.callbackURL,
    passReqToCallback: true
}, function(req, token, refreshToken, profile, done) {
    process.nextTick(function() {
        return done(null, profile);
    });
}));

// used to serialize the user for the session
passport.serializeUser(function(user, done) {
    done(null, user);
});

// used to deserialize the user
passport.deserializeUser(function(user, done) {
    done(null, user);
});


// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

app.use(require('domain-middleware'));
app.use(function errorHandler(err, req, res, next) {
  console.log('error on request %s %s: %j', req.method, req.url, err);
  res.status(500).send(err);
});


module.exports = app;
