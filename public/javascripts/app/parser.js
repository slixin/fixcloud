app.controller("ctrlParser",['$scope', '$http', '$filter',function($scope,$http,$filter) {
    $scope.inputText = null;
    $scope.messages = [];
    $scope.fix_versions = [];
    $scope.selected_message = null;

    $scope.$watch('inputText', function(newvalue, oldvalue) {
        if (newvalue != oldvalue && newvalue != undefined)
        {
            if (newvalue.length > 100000){
                bootbox.alert('Log is too huge, please make it small.', function() { });
            } else {
                $scope.messages = [];
                parse_input_text(newvalue);
            }
        }
    }, true);

    $scope.$watch('messages', function(row) {
        row.filter(function(r) {
            if (r.isSelected) {
                $scope.selected_message = r;
            }
        });
        row.sort(function(a,b) {return a.time - b.time });
    }, true);

    $scope.$watch('fix_versions.value', function(newvalue, oldvalue) {
        if (newvalue != undefined){
            get_message_types(newvalue.value, function(types) {
                $scope.message_types = types;
            });

            get_message_fields(newvalue.value, function(fields) {
                $scope.message_fields = fields;
            });
        }
    }, true);

    var parse_input_text = function(text) {
        var SOHCHAR = String.fromCharCode(1);
        var fix_pattern = /\d{1,4}=[^\s\=]+/g;
        var lines = $('textarea').val().split('\n');
        lines.forEach(function(line) {
            var message = {
                time : null,
                sender : null,
                target : null,
                type : null,
                clordid : null
            }
            var fix_line = line.match(fix_pattern);
            if (fix_line != undefined){
                get_fix_value(60, fix_line, function(value) {
                    if (value.indexOf(":") > 0) {
                        var date = value.split("-")[0];
                        var time = value.split("-")[1];
                        var dt = new Date(date.substring(0,4),
                            date.substring(4,2),
                            date.substring(6,2),
                            time.split(":")[0],
                            time.split(":")[1],
                            time.split(":")[2].split(".")[0],
                            time.split(":")[2].split(".")[1]);
                        message.time = dt;
                    } else {
                        message.time = new Date(parseFloat(value));
                    }
                });
                get_fix_value(49, fix_line, function(value) {
                    message.sender = value;
                });
                get_fix_value(49, fix_line, function(value) {
                    message.target = value;
                });
                get_fix_value(35, fix_line, function(value) {
                    message.type = $scope.message_types.filter(function(o) { return o.type == value.toString()})[0].name;
                });
                get_fix_value(11, fix_line, function(value) {
                    message.clordid = value;
                });
                get_fix_detail(fix_line, function(value) {
                    message.detail = value;
                })

                $scope.messages.push(message);
            }
        });
    }

    var get_fix_detail = function(tags, callback) {
        var tag_detail = [];
        tags.forEach(function(tag) {
            var tag_array = tag.match(/[^=]+/g);
            if (tag_array.length == 2){
                var tag_num = parseInt(tag_array[0]);
                var tag_value = tag_array[1].replace('','');
                var fields = $scope.message_fields.filter(function(o) { return o.field == tag_num.toString()});

                var tag_description = fields.length == 0 ? "" : fields[0].name;
                var tag_value_description = fields[0].values.length == 0 ? "" : fields[0].values.filter(function(o) { return o.value == tag_value.toString()})[0].name;
                tag_detail.push( {
                    tag: tag_num,
                    tag_name: tag_description,
                    value: tag_value,
                    value_name: tag_value_description
                });
            }
        });

        callback(tag_detail);
    }

    var get_fix_value =  function(tag_number, tags, callback) {
        tags.forEach(function(tag) {
            var tag_array = tag.match(/[^=]+/g);
            if (tag_array.length == 2){
                var tag_num = parseInt(tag_array[0]);
                if (tag_num == tag_number){
                    callback(tag_array[1].replace('',''));
                }
            }
        });
    }

    var get_message_types = function(version, callback){
        var types = [];
        $http.post('/protocol/messagetypes', {
            "version": version,
        }).then(function(resp) {
            if (resp.data != null) {
                if (resp.data.status == true) {
                    resp.data.messagetypes.forEach(function(t){
                        types.push({
                            name: t.displayname,
                            type: t.type
                        });
                    });
                    callback(types);
                } else {
                    bootbox.alert(resp.data.error, function() { return; });
                    callback(null);
                }
            }
        }, function(err) {
            console.error('ERR', err);
        });
    }

    var get_message_fields = function(version, callback){
        var fields = [];
        $http.post('/protocol/fields', {
            "version": version,
        }).then(function(resp) {
            if (resp.data != null) {
                if (resp.data.status == true) {
                    resp.data.fields.forEach(function(t){
                        fields.push({
                            name: t.displayname,
                            field: t.field,
                            values: t.values
                        });
                    });
                    callback(fields);
                } else {
                    bootbox.alert(resp.data.error, function() { return; });
                    callback(null);
                }
            }
        }, function(err) {
            console.error('ERR', err);
        });
    }

    var build_fix_version_list = function() {
        $scope.fix_versions = {
            "type": "select",
            "name": "Fix Version",
            "value": { name: "4.4", value: "44"},
            "values": [
                { name: "4.1", value:"41" },
                { name: "4.2", value:"42" },
                { name: "4.3", value:"43" },
                { name: "4.4", value:"44" },
                { name: "5.0", value:"50" }
            ]
        }
    }

    build_fix_version_list();
}]);
