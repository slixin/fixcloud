var json2array = function (json){
    var result = [];
    var keys = Object.keys(json);
    keys.forEach(function(key){
        result.push(key + "=" +json[key]);
    });
    return result;
}


var randomString = function(number) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        for (var i = 0; i < number; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text;
}
