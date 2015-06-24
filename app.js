var express = require('express');
var session = require('express-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dict = require("dict");
var passport = require("passport");
var FacebookStrategy = require('passport-facebook').Strategy;
var methodOverride = require('method-override');
var flash = require('connect-flash');
var auth = require('./auth');
var fs = require('fs');

var routes = require('./routes/index');
var fix = require('./routes/fix');

var app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.set('trust proxy', '172.17.0.20')
app.enable('trust proxy');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride());
app.use(session({secret: 'iress.node', resave:true,  saveUninitialized: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use('/', routes);
app.use('/fix', fix);

// passport config
// =========================================================================
// FACEBOOK ================================================================
// =========================================================================
passport.use(new FacebookStrategy({
    clientID: auth.facebookAuth.clientID,
    clientSecret: auth.facebookAuth.clientSecret,
    callbackURL: auth.facebookAuth.callbackURL,
    passReqToCallback: true
}, function(req, token, refreshToken, profile, done) {
    process.nextTick(function() {
        var userId = profile.id;
        var userFile = "/usersettings/"+userId+".json";
        fs.exists(userFile, function(exists) {
          if (exists) {
            fs.readFile(userFile, 'utf8', function(err, data) {
                if (err) throw err;
                var settings = JSON.parse(data).settings;
                if (global.userSettings.has(userId))
                    global.userSettings.get(userId).settings = settings;
                else
                    global.userSettings.set(userId, settings);
            });;
          }
          else{
            global.userSettings.set(userId, null);
          }
        });
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
  console.log('error on request %d %s %s: %j', process.domain.id, req.method, req.url, err);
  res.send(500, "Something bad happened. :(");
});

global.sessions = new dict();
global.userSettings = new dict();

module.exports = app;
