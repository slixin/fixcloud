function bootstrap_alert(elem, message, timeout) {
      $(elem + " .alertMessage").text(message);
      $(elem).show();

      if (timeout || timeout === 0) {
        setTimeout(function() {
          $(elem).hide();
        }, timeout);
      }
    };

function json2array(json){
    var result = [];
    var keys = Object.keys(json);
    keys.forEach(function(key){
        result.push(key + "=" +json[key]);
    });
    return result;
}
