var express = require('express');
var passport = require("passport");
var router = express.Router();
var fs = require("fs");

/* GET home page. */
router.get('/', function (req, res) {
    res.redirect("/index.html");
});

router.get('/auth/facebook', passport.authenticate('facebook',{
  display: 'popup'})
);

// handle the callback after facebook has authenticated the user
router.get('/auth/facebook/callback', passport.authenticate('facebook', {
        successRedirect : '/signin.html',
        failureRedirect : '/',
        failureFlash: true
    }),
    function(req, res) {
        res.send({status:"ok"});
    }
);

router.get('/islogin', ensureAuthenticated, function(req, res){
    res.send({status:"ok", id: req.user.id, displayname: req.user.displayName});
});

// route for logging out
router.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/index.html');
});

router.post('/deletesetting', ensureAuthenticated, function (req, res){
    var userId = req.body.userid;
    var setting = req.body.setting;
    var userFile = __dirname + '../..' + '/usersettings/'+userId+'.json';
    var content = { usersettings: []};

    fs.exists(userFile, function (exists) {
      if (exists)
      {
        fs.readFile(userFile, 'utf8', function(err, data) {
            if (err)
                res.send({status:"error", exception: err});
            else
            {
                content = JSON.parse(data);
                content.usersettings.forEach(function(value, index){
                    if (value.id == setting.id)
                    {
                        content.usersettings.splice(index, 1);
                    }
                });

                fs.writeFile(userFile, JSON.stringify(content), 'utf8', function(err) {
                    if (err)
                        res.send({status:"error", exception: err});
                    else
                        res.send({status:"ok"});
                  });;
            }
        });;
      }
    });
})

router.post('/savesetting', ensureAuthenticated, function (req, res){
    var userId = req.body.userid;
    var newsetting = req.body.setting;
    var userFile = __dirname + '../..' + '/usersettings/'+userId+'.json';
    var content = { usersettings: []};

    fs.exists(userFile, function (exists) {
      if (exists)
      {
        fs.readFile(userFile, 'utf8', function(err, data) {
            if (err)
                res.send({status:"error", exception: err});
            else
            {
                var isedit = false;
                content = JSON.parse(data);
                content.usersettings.forEach(function(value, index){
                    if (value.id == newsetting.id)
                    {
                        content.usersettings[index] = newsetting;
                        isedit = true;
                    }
                    else
                    {
                        value.isactive = false; //Inactive all other setting
                    }
                });
                if (!isedit)
                    content.usersettings.push(newsetting);

                fs.writeFile(userFile, JSON.stringify(content), 'utf8', function(err) {
                    if (err)
                        res.send({status:"error", exception: err});
                    else
                        res.send({status:"ok"});
                  });;
            }
        });;
      }
      else // create new file
      {
        content.usersettings.push(newsetting);
        fs.writeFile(userFile, JSON.stringify(content), 'utf8', function(err) {
            if (err)
                res.send({status:"error", exception: err});
            else
                res.send({status:"ok"});
          });;
      }
    });
})

router.post('/loadsettings', ensureAuthenticated, function (req, res){
    var userId = req.body.userid;
    var userFile = __dirname + '../..' + '/usersettings/'+userId+'.json';
    fs.readFile(userFile, 'utf8', function(err, data) {
        if (err)
            res.send({status:"error", exception: err});
        else
            res.send({status:"ok", settings: data});
    });;
})

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.send({status:"error", exception: "nonauth"});
}

module.exports = router;
