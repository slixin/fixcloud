function parselog()
{
    var logcontent = $("#log").val();
    if (logcontent.trim().length > 0) {
        var lines = logcontent.split('\n');
        var messages = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.match(TID = /\d{1,5}\sFIX/g)) {
                messages.push(handleFIXMessage(line));
            }
            else if (line.match(TID=/\d{1,5}\s[A-Z]+\sSDO/g)) {
                handleSDOMessage(line);
            }
        }
        alert(messages.length);
        $('#messagetbl').bootstrapTable({
            data: messages
        });
    }
}

function GetName(tag)
{

}

function handleFIXMessage(line)
{
    var tags = {};
    //remove chars before 8=FIX;
    var fixmsg = line.substring(line.indexOf("8=FIX"), line.length - line.indexOf("8=FIX"));
    fixmsg.split("\u0001").forEach(function (tagvalue) {
        tags[tagvalue.split("=")[0]] = tagvalue.split("=")[1];
    });

    var parsedMsg = {
        "message": fixmsg
    };

    return parsedMsg;
}

function handleSDOMessage(line)
{

}

