app.controller("ctrlSession",['$scope', '$http', '$timeout', '$interval', 'socket', 'localStorageService', '$uibModal', '$location',function($scope, $http, $timeout, $interval, socket, localStorageService, $uibModal,$location) {
    if(!localStorageService.isSupported) {
         console.log("The browser does not support local storage service.");
    }
    $scope.user = localStorageService.get('User');
    $scope.storage_messages = localStorageService.get('Messages');
    $scope.session = $scope.data;

    $scope.session_messages = [];

    if ($scope.storage_messages == undefined)
        $scope.storage_messages = [];
    if ($scope.storage_messages.filter(function(o) { return o.id == $scope.session.id}).length == 0){
        $scope.storage_messages.push({ id: $scope.session.id, messages: $scope.session_messages});
    } else {
        $scope.session_messages = $scope.storage_messages.filter(function(o) { return o.id == $scope.session.id})[0].messages;
    }

    var timer = null;

    $scope.is_disableSaveTemplate = true;
    $scope.enable_message_display = true;
    $scope.message_modes = [{name: "SINGLE", value: 1}, {name: "BULK", value: 2}];

    $scope.message = {
        mode: 1,
        amount: 1,
        tps: 1,
        progress_percentage: 0,
        processed: 0,
        text: null
    };

    $scope.protocol = {
        message_types : [],
        message_fields : []
    };

    $scope.templates = $scope.user.settings.clients.filter(function(c) { return c.id == $scope.session.id })[0].templates;

    $scope.jsoneditor_options={
      "mode": "tree",
      "modes": [
        "tree",
        "form",
        "code",
        "text"
      ],
      "history": true
    }

    $scope.search = null;

    $scope.$on('$destroy', function () {
        $interval.cancel(timer);
    });

    $scope.$on("onSessionConnectEvent", function(event, data) {
        if ($scope.session != undefined)
            if ($scope.session.id == data.id)
                connect();
    });

    $scope.$on("onSessionDisconnectEvent", function(event, data) {
        if ($scope.session != undefined)
            if ($scope.session.id == data.id){
                disconnect();
            }
    });

    $scope.$watch('user', function(newvalue, oldvalue) {
        if (newvalue != oldvalue)
        {
            $scope.$emit("onUserChangeEvent", $scope.user);
        }
    }, true);

    $scope.$watch('storage_messages', function(newvalue, oldvalue) {
        if (newvalue != oldvalue)
        {
            localStorageService.set('Messages', $scope.storage_messages);
        }
    }, true);

    $scope.$watch('session_messages', function(newvalue, oldvalue) {
        if (newvalue != oldvalue)
        {
            var lm = $scope.storage_messages.filter(function(o) { return o.id == $scope.session.id})[0];
            lm.messages = newvalue;
        }
    }, true);

    $scope.$watch("session.isconnected", function(newvalue, oldvalue) {
        if (newvalue == true){
            subscribe_client_listener($scope.session.listener_port);
            if (newvalue != oldvalue)
                timer = $interval(is_connected, 5000);
        }
        else if (newvalue == false && newvalue != oldvalue){
            $interval.cancel(timer);
        }
    });

    $scope.$watch('message.progress_percentage', function(newvalue, oldvalue) {
        if (newvalue >= 100) {
            $interval.cancel($scope.message.progress_timer);
            bootbox.alert('Bulking completed.', function() {
                $scope.enable_message_display = true;
                $timeout(function() { $scope.message.progress_percentage = 0;}, 2000);
            });
        }
    }, true);

    $scope.$watch('templates', function(newvalue, oldvalue) {
        if (newvalue != null && newvalue != oldvalue) {
            $scope.user.settings.clients.filter(function(c) { return c.id == $scope.session.id })[0].templates = $scope.templates;
        }
    }, true);

    $scope.onStart = function(){
        if ($scope.session.isconnected) {
            bootbox.confirm("Are you going to sending "+ $scope.message.mode.name+" message?", function(result) {
                if (result){
                    // Single mode
                    if ($scope.message.mode.value == 1) {
                        start_single_mode();
                    } else { // Bulk mode
                        $scope.enable_message_display = false;
                        start_bulk_mode();
                    }
                }
            });

        } else {
            bootbox.alert('Please connect to session first!', function() {
                return;
            });
        }
    };

    $scope.onStop = function(){
        if ($scope.session.isconnected) {
            bootbox.confirm("Are you going to stop?", function(result) {
                if (result){
                    $http.post('/client/send/bulk/stop', {
                        "client": $scope.session.client_id
                    }).then(function(resp) {
                        $interval.cancel($scope.message.progress_timer);
                        bootbox.alert('Bulking stopped.', function() {
                             $timeout(function() { $scope.message.progress_percentage = 0;}, 2000);
                        });
                    }, function(err) {
                        bootbox.alert('ERROR:' + err, function() {
                             $timeout(function() { $scope.message.progress_percentage = 0;}, 2000);
                        });
                    });
                }
            });
        } else {
            bootbox.alert('Please connect to session first!', function() { return; });
        }
    }

    $scope.onSaveTemplate = function() {
        bootbox.prompt({
          title: "Save current FIX message as FIX template, name it?",
          callback: function(result) {
            if (result != undefined) {
                if (result.trim().length == 0){
                    bootbox.alert('Template without a name!', function() { return; });
                } else{
                    var message = $scope.message.text;
                    try {
                        var messagetext = JSON.stringify(message);
                        if (messagetext.trim().length == 0){
                            bootbox.alert('The FIX template is empty, please check!', function() { return; });
                        } else {
                            JSON.parse(messagetext);
                            var template_name = result.trim();
                            var exists_templates = $scope.templates.filter(function(t) { return t.name == template_name });
                            if (exists_templates.length > 0) {
                                bootbox.confirm("The template name is already exists, are you going to replace it?", function(result) {
                                    if (result){
                                        exists_templates[0].value = message;
                                        bootbox.alert('Template '+ template_name+' is replaced!', function() { return; });
                                    }
                                });
                            } else {
                                $scope.templates.push( { name: template_name, value: message });
                                $scope.$apply();
                                bootbox.alert('New template saved!', function() { return; });
                            }
                        }
                    } catch(e) {
                        bootbox.alert('The FIX template is invalid, please check!', function() { console.log(e); return; });
                    }
                }
            }
          }
        });
    }

    $scope.onDeleteTemplate = function(template) {
        bootbox.confirm("Are you going to delete the template "+template.name+"?", function(result) {
            if (result){
                $scope.templates.forEach(function (t, i) {
                    if (t.name == template.name){
                        $scope.templates.splice(i, 1);
                        $scope.$apply();
                        bootbox.alert('Template '+template.name+' is deleted', function() { return; });
                        return;
                    }
                });
            }
        });
    }

    $scope.onApplyTemplate = function(template) {
        var template_msg = JSON.parse(JSON.stringify(template.value));
        var filtered_messages = $scope.session_messages.filter(function(m) { return m.selected == true });
        if (filtered_messages.length  == 1){
            var target_msg = filtered_messages[0].message;
            Object.keys(template_msg).forEach(function(key) {
                if (template_msg[key].startsWith(":")) {
                    var target_msg_key = template_msg[key].replace(":","");
                    template_msg[key] = target_msg[target_msg_key];
                } else if (key != 35) {
                    template_msg[key] = target_msg[key];
                }
            });
            $scope.message.text = template_msg;
            $scope.selected_tab = 0;
        } else {
            $scope.message.text = template_msg;
            $scope.selected_tab = 0;
        }
    }

    $scope.onClean = function() {
        bootbox.confirm("Are you going to clean all messages?", function(result) {
            if (result){
                $scope.session_messages = [];
                $scope.$apply();
            }
        });
    }

    $scope.onMessageSelected = function(index, messages) {
      messages.forEach(function(msg, i) {
        if (index != i)
          msg.selected = false;
      });
    }

    $scope.onMessageViewer = function() {
        showMessageViewer(function(){});
    }

    $scope.onEditorHelper = function() {
        showEditorHelper(function(){});
    }

    var showMessageViewer = function (session) {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modal-messageviewer.html',
            controller: 'MessageViewerModalCtrl',
            size: 'lg',
            scope: $scope,
            resolve: {
                messages: function() {
                    if ($scope.session_messages != undefined)
                        return $scope.session_messages;
                    else
                        return {};
                },
                protocol: function() {
                    if ($scope.protocol != undefined)
                        return $scope.protocol;
                    else
                        return {};
                }
            }
        });

        modalInstance.result.then(function () {}, null);
    };

    var showEditorHelper = function (session) {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modal-editorhelper.html',
            controller: 'EditorHelperCtrl',
            size: 'lg',
            scope: $scope,
            resolve: {
            }
        });

        modalInstance.result.then(function () {}, null);
    };

    var connect = function() {
        $http.post('/client/connect', {
            "version": $scope.session.version,
            "senderid": $scope.session.sender,
            "targetid": $scope.session.target,
            "host": $scope.session.host,
            "port": $scope.session.port,
            "user": $scope.user.id,
        }).then(function(resp) {
            if (resp.data != null) {
                if (resp.data.status == true) {
                    $scope.session.isconnected = true;

                    $scope.session.client_id = resp.data.client_id;
                    $scope.session.listener_port = resp.data.listener_port;
                } else {
                    $scope.session.isconnected = false;

                    if (resp.data.exception.code == "ECONNREFUSED") {
                        bootbox.alert('Connection refused!',function() { return; });
                    } else {
                        bootbox.alert('Connection failed, ' + JSON.stringify(resp.data.exception), function() {
                            return;
                        });
                    }
                }
            }
        }, function(err) {
            console.error('ERR', err);
        });
    }

    var disconnect = function() {
        if ($scope.session.isconnected) {
            $http.post('/client/disconnect', {
                "client": $scope.session.client_id
            }).then(function(resp) {
                $scope.session.isconnected = false;
            }, function(err) {
                $scope.session.isconnected = false;
                console.error('ERR', err);
            });
        }
    }

    var is_connected = function(){
        $http.post('/client/isconnected', {
            "client": $scope.session.client_id
        }).then(function(resp) {
            if (resp.data.status == true)
                $scope.session.isconnected = true;
            else{
                $scope.session.isconnected = false;
            }
        }, function(err) {
            $scope.session.isconnected = false;
            $scope.user = null;
            $location.path('/');
        });
    }

    var get_message_types = function(callback){
        var types = [];
        $http.post('/protocol/messagetypes', {
            "version": $scope.session.version.replace(".",""),
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

    var get_message_fields = function(callback){
        var fields = [];
        $http.post('/protocol/fields', {
            "version": $scope.session.version.replace(".",""),
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

    var start_single_mode = function() {
        var message = $scope.message.text;
        $http.post('/client/send', {
            "client": $scope.session.client_id,
            "message": message
        }).then(function(resp) {
            if (!resp.data.status)
            {
                bootbox.alert("Error:"+resp.data.error, function() { return; });
            }
            else
            {
               bootbox.alert("Send successfully.", function() { return; });
            }
        }, function(err) {
            console.error('ERR', err);
        });
    };

    var start_bulk_mode = function() {
        var message = $scope.message.text;
        $http.post('/client/send/bulk', {
                "client": $scope.session.client_id,
                "message": message,
                "amount": $scope.message.amount,
                "tps": $scope.message.tps
        }).then(function(resp) {
            if (!resp.data.status){
                bootbox.alert('ERROR:' + resp.data.error, function() {
                    $timeout(function() { $scope.message.progress_percentage = 0;}, 2000);
                });
            } else {
                $scope.message.progress_percentage = 1;
                $timeout(function() {
                    $scope.message.progress_timer = $interval(function() {
                        get_bulk_result(false, function(result){
                            if (result.status){
                                if (result.count == 0){
                                    $interval.cancel($scope.message.progress_timer);
                                    bootbox.alert('Bulking not started.', function() { return; });
                                }
                                var processed_count = result.count;
                                var processed_percentage = Math.round(100*processed_count / $scope.message.amount, 2);
                                $scope.message.progress_percentage = processed_percentage;
                                $scope.message.processed = processed_count;
                            } else {
                                $interval.cancel($scope.message.progress_timer);
                                bootbox.alert('Bulking not started.', function() { return; });
                            }
                        });
                    }, 1000);
                }, 1000);
            }
        }, function(err) {
            bootbox.alert('ERROR:' + err, function() {
                    $timeout(function() { $scope.message.progress_percentage = 0;}, 2000);
            });
        });
    }

    var get_bulk_result = function(showdetail, callback){
        $http.post('/client/send/bulk/result', {
                "client": $scope.session.client_id,
                "detail": showdetail
        }).then(function(resp) {
            if (resp.data.status)
            {
                callback(resp.data);
            }
        }, function(err) {
            if (err) console.log(err);
        });
    }

    var get_selected_text = function() {
        var textArea = $('#message');
        var len = textArea.val().length;
        var start = textArea[0].selectionStart;
        var end = textArea[0].selectionEnd;
        if (end > start)
            return textArea.val().substring(start, end);

        return null;
    }

    var subscribe_client_listener = function(port){
        socket.connect(port);
        if (!socket.connect){
            console.log('socket is not connected');
        }
        else{
            console.log('connect to socket:'+port);
            socket.subscribe(function(message){
                if($scope.enable_message_display){
                    if (message != undefined && message.session_id == $scope.session.client_id)
                    {
                        if ($scope.session_messages.length > 500){
                            $scope.session_messages.pop();
                        }
                        $scope.session_messages.unshift(message);
                        $scope.$apply();
                    }
                }
            });
        }
    }

    var unsubscribe_client_listener = function(){
        if (socket != null)
            socket.disconnect();
    }

    var buildTemplateMenu = function() {
        var menus = [];
        $scope.templates.forEach(function (t, i) {
            var menu = [''+t.name+'', function($itemScope) {
                console.log('menu here');
            }];
            menu.push(menu);
        });

        $scope.menus = menus;
    }

    if ($scope.session.isconnected){ timer = $interval(is_connected, 5000); }
    get_message_types(function(types) {
        $scope.protocol.message_types = types;
    });

    get_message_fields(function(fields) {
        $scope.protocol.message_fields = fields;
    });

    if ($scope.templates == undefined) {
        $scope.templates = [];
    } else {
        buildTemplateMenu();
    }
}]);


app.controller('EditorHelperCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance) {
    $scope.close = function () {
        $uibModalInstance.dismiss(null);
    };
});

app.controller('MessageViewerModalCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance, messages, protocol) {
    $scope.excluded_tags = null;

    $scope.$watch('excluded_tags', function(newvalue, oldvalue) {
        if (newvalue != oldvalue && newvalue != null)
        {
            var ex_tags = newvalue.split(',').filter(Boolean);
            load_messages_inviewer(ex_tags)
        }
    }, true);

    $scope.close = function () {
        $uibModalInstance.dismiss(null);
    };

    var load_messages_inviewer = function(ex_tags) {
        $scope.events = [];
        messages.forEach(function(m) {
            var msgobj = m.message;
            var title = null;

            var field35 = protocol.message_fields.filter(function(c) { return c.field == 35 })[0];
            var tag35 = field35.values.filter(function(c) { return c.value == msgobj[35] })[0];
            if (tag35 != undefined) {
                title = tag35.name;
            } else {
                title = "35:" + msgobj[35]
            }

            var content = null;

            Object.keys(msgobj).forEach(function(key) {
                if (key != undefined){
                    if (ex_tags != undefined) {
                        if ($.inArray(key, ex_tags) < 0) {
                            content = (content == undefined ? "" : content) + generate_content(msgobj, key);
                            console.log(key);
                            console.log(ex_tags);
                            console.log($.inArray(key, ex_tags));
                            console.log(content);
                        }
                    } else {
                        content = (content == undefined ? "" : content) + generate_content(msgobj, key);
                    }
                }
            });

            $scope.events.push( {
                badgeClass: m.direction == 0 ? 'warning' : 'info',
                badgeIconClass: m.direction == 0 ? "fa fa-cloud-download" : "fa fa-cloud-upload",
                side: m.direction == 0 ? "" : "timeline-inverted",
                title: title,
                time: m.message_time,
                content: content,
            })
        });
    }

    var generate_content = function (msgobj, key) {
        var tag, tag_content, tagvalue_content;
        if (protocol.message_fields.filter(function(c) { return c.field == key }).length > 0){
            tag = protocol.message_fields.filter(function(c) { return c.field == key })[0];
            tag_content = tag.name + "(<b>"+key+"</b>)";
        } else {
            tag = key;
            tag_content = "<b>"+key+"/<b>";
        }
        if (tag.values == undefined){
            tagvalue_content = msgobj[key];
        } else {
            if (tag.values.filter(function(c) { return c.value == msgobj[key] }).length > 0){
                tagvalue_content = tag.values.filter(function(c) { return c.value == msgobj[key] })[0].name +"(<b>"+msgobj[key]+"</b>)";
            } else {
                tagvalue_content = "<b>"+msgobj[key]+"</b>";
            }
        }
        return "<p>"+tag_content+"="+tagvalue_content+"</p>";
    }

    load_messages_inviewer(null);
});
