var log4js = require('log4js');
var isJSON = require('is-json');

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

module.exports = {
    convert_datetime: function(dt) {
       var yyyy = dt.getFullYear().toString();
       var mm = (dt.getMonth()+1).toString();
       var dd  = dt.getDate().toString();
       var hh  = dt.getHours().toString();
       var m  = dt.getMinutes().toString();
       var ss  = dt.getSeconds().toString();
       var sss  = dt.getMilliseconds().toString();
       return yyyy + (mm[1]?mm:"0"+mm[0]) + (dd[1]?dd:"0"+dd[0]) + (hh[1]?hh:"0"+hh[0]) + (m[1]?m:"0"+m[0]) + (ss[1]?ss:"0"+ss[0]) + sss; // padding
    },

    guid: function() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    },

    random_string: function(seed, length){
        var text = "";
        var possible = seed == undefined ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" : seed;

        for( var i=0; i < length; i++ )
            text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text;
    },

    isvalid_message: function(message, callback) {
        var error_msg = null;

        if (message ==  undefined){
            error_msg = 'Message cannot be empty';
        }else{
            if (typeof message == "string") {
                if (message.trim().length == 0){
                    error_msg = 'Message cannot be empty';
                } else {
                    if (!isJSON(message.trim())){
                        error_msg = 'Message is invalid JSON format';
                    }
                    try {
                        JSON.parse(message.trim());
                    } catch (e) {
                        error_msg = 'Message is invalid JSON format';
                    }
                }
            } else{
                try {
                    JSON.parse(JSON.stringify(message));
                } catch (e) {
                    error_msg = 'Message is invalid JSON format';
                }
            }
        }
        if (error_msg)
            logger.error(error_msg);
        callback(error_msg);
    },

    request_error: function(res, err) {
        logger.error(err);
        res.send({status: false, error: err});
    }
};
