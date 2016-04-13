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
    isvalid_client: function(client, callback) {
        var error_msg = 'Cannot find the client';
        if (client == undefined){
            logger.error(error_msg);
            callback(error_msg);
        } else {
            callback(null);
        }
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
