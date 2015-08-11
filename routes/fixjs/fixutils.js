"use strict";
var _ = require('underscore');

var SOHCHAR = exports.SOHCHAR = String.fromCharCode(1);

exports.getCurrentUTCTimeStamp = function() {
    return getUTCTimeStamp(new Date());
}

var getUTCTimeStamp = exports.getUTCTimeStamp = function(datetime) {
    var timestamp = datetime || new Date();

    var year = timestamp.getUTCFullYear();
    var month = timestamp.getUTCMonth() + 1;
    var day = timestamp.getUTCDate();
    var hours = timestamp.getUTCHours();
    var minutes = timestamp.getUTCMinutes();
    var seconds = timestamp.getUTCSeconds();
    var millis = timestamp.getUTCMilliseconds();


    if (month < 10) {
        month = '0' + month;
    }

    if (day < 10) {
        day = '0' + day;
    }

    if (hours < 10) {
        hours = '0' + hours;
    }

    if (minutes < 10) {
        minutes = '0' + minutes;
    }

    if (seconds < 10) {
        seconds = '0' + seconds;
    }

    if (millis < 10) {
        millis = '00' + millis;
    } else if (millis < 100) {
        millis = '0' + millis;
    }


    var ts = [year, month, day, '-', hours, ':', minutes, ':', seconds, '.', millis].join('');

    return ts;
}

var checksum = exports.checksum = function(str) {
    var chksm = 0;
    for (var i = 0; i < str.length; i++) {
        chksm += str.charCodeAt(i);
    }

    chksm = chksm % 256;

    var checksumstr = '';
    if (chksm < 10) {
        checksumstr = '00' + (chksm + '');
    } else if (chksm >= 10 && chksm < 100) {
        checksumstr = '0' + (chksm + '');
    } else {
        checksumstr = '' + (chksm + '');
    }

    return checksumstr;
}

var convertMapToFIX = exports.convertMapToFIX = function(map) {
    return convertToFIX(map, map[8], map[52], map[49], map[56], map[34]);
}

var buildHeaderMsgArray = function(msg, timeStamp, senderCompID, targetCompID, outgoingSeqNum) {
    delete msg['9']; //bodylength
    delete msg['10']; //checksum

    var headermsgarr = [];
    headermsgarr.push('35=' + msg['35'], SOHCHAR);
    if (_.isNumber(timeStamp)) {
        headermsgarr.push('52=' + getUTCTimeStamp(new Date(timeStamp)), SOHCHAR);
    } else {
        headermsgarr.push('52=' + timeStamp, SOHCHAR);
    }
    headermsgarr.push('49=' + senderCompID, SOHCHAR);
    headermsgarr.push('56=' + targetCompID, SOHCHAR);
    headermsgarr.push('34=' + outgoingSeqNum, SOHCHAR);

    var headermsg = headermsgarr.join('');

    return headermsg;
}

var buildBodyMsgArray = function(msg, parentTag) {
    var bodymsgarr = [];
    for (var tag in msg) {
        if (msg.hasOwnProperty(tag) && tag !== '8' && tag !== '9' && tag !== '35' && tag !== '10' && tag !== '52' && tag !== '49' && tag !== '56' && tag !== '34' && tag !== "") {
            if (typeof(msg[tag]) == 'object') {
                bodymsgarr.push(tag, '=', msg[tag].value, SOHCHAR);
                msg[tag].groups.forEach(function(group) {
                    var groupmsgarr = buildBodyMsgArray(group, tag);
                    bodymsgarr = bodymsgarr.concat(groupmsgarr);
                });
            } else {
                if (parentTag != undefined) {
                    if (parentTag == "555" && tag == "600") {
                        bodymsgarr.unshift(tag, '=', msg[tag], SOHCHAR);
                    } else {
                        bodymsgarr.push(tag, '=', msg[tag], SOHCHAR);
                    }
                } else {
                    bodymsgarr.push(tag, '=', msg[tag], SOHCHAR);
                }
            }
        }
    }

    var bodymsg = bodymsgarr.join('');

    return bodymsg;
}

var convertToFIX = exports.convertToFIX = function(msgraw, fixVersion, timeStamp, senderCompID, targetCompID, outgoingSeqNum) {
    //defensive copy
    var msg = {};
    for (var tag in msgraw) {
        if (msgraw.hasOwnProperty(tag)) msg[tag] = msgraw[tag];
    }
    var headermsg = buildHeaderMsgArray(msg, timeStamp, senderCompID, targetCompID, outgoingSeqNum);
    var bodymsg = buildBodyMsgArray(msg, undefined);

    var outmsgarr = [];
    outmsgarr.push('8=', fixVersion, SOHCHAR);
    outmsgarr.push('9=', (headermsg.length + bodymsg.length), SOHCHAR);
    outmsgarr.push(headermsg);
    outmsgarr.push(bodymsg);

    var outmsg = outmsgarr.join('');

    outmsg += '10=' + checksum(outmsg) + SOHCHAR;

    return outmsg;
}

var convertToMap = exports.convertToMap = function(msg) {
    var fix = {};
    var keyvals = msg.split(SOHCHAR);
    for (var kv in Object.keys(keyvals)) {
        var kvpair = keyvals[kv].split('=');
        fix[kvpair[0]] = kvpair[1];
    }
    return fix;

}

var memoryStore = exports.memoryStore = function(id) {
    console.log("Using default message store for id " + id);
    return new function() {
        var dataarray = [];
        this.add = function(id, data) {
            dataarray.push(data);
        };
        this.each = function(id, func) {
            _.each(dataarray, function(msg) {
                func(msg, false);
            });
            func(null, true);
        };
        //this.eachWithStartEnd = function(start, end, func){_.each(dataarray,func);};
    }
}
