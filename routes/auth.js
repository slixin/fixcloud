var express = require('express');
var passport = require("passport");
var router = express.Router();
var fs = require("fs");

router.get('/facebook', passport.authenticate('facebook',{
  display: 'popup'})
);

// handle the callback after facebook has authenticated the user
router.get('/facebook/callback', passport.authenticate('facebook', {
        successRedirect : '/signin.html',
        failureRedirect : '/',
        failureFlash: true
    }),
    function(req, res) {
        res.send({status:true});
    }
);

router.get('/isauthenticated', ensureAuthenticated, function(req, res){
    res.send({status:true, id: req.user.id, displayname: req.user.displayName });
});

// route for logging out
router.get('/logout', function(req, res) {
    req.logout();
    res.send({status:true});
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.send({status:false, error: "nonauth"});
}

module.exports = router;
