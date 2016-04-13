app.controller("ctrlService", ['$scope', '$http', '$cookieStore', 'socket', function($scope, $http,  $cookieStore, socket) {
    $scope.serverSession = null;
    $scope.active_tab = null;

    $scope.$watch('service', function() {
        if ($scope.service != null) {
            if ($scope.service.isonline) {
                $scope.serverPanel = {
                    btnText: "Offline",
                    btnStyle: "btn-warning",
                }
            } else {
                $scope.serverPanel = {
                    btnText: "Online",
                    btnStyle: "btn-success",
                };
            }
            $scope.$emit("onServerChangeEvent", $scope.service);
        }
    }, true);

    $scope.$on("onNewServerEvent", function(event, data) {
        if ($scope.service == null) {
            $scope.service = data;
        }
    });

    var offline = function(){
        $http.post('/server/offline', {
            "port": $scope.service.port
        }).then(function(resp) {
            if (resp.data.status)
            {
                $scope.service.isonline = false;
            }
            else
            {
                bootbox.alert(resp.data.errmsg).then(function() {
                    return;
                });
            }
        }, function(err) {
            console.log(err);
        });
        unsubscribe();
    }

    var online = function(){
        $http.post('/server/online', {
            "server_id": $scope.service.id,
            "port": $scope.service.port
        }).then(function(resp) {
            console.log(resp);
            if (resp.data.status)
            {
                $scope.service.isonline = true;
            }
            else
            {
                bootbox.alert(resp.data.errmsg).then(function() {
                    return;
                });
            }
        }, function(err) {
            console.log(err);
        });
        $scope.server_data.messages.data = [];
        subscribe();
    }

    var isPortInUse = function(port){
        if (port != undefined)
        {
            $http.post('/server/port/inuse', {
                "port": port
            }).then(function(resp) {
                return resp.data.status;
            }, function(err) {
                console.log(err);
            });
        }
        else
        {
            return false;
        }

    }

    var unsubscribe = function(){
        socket.disconnect();
    }

    var subscribe = function(){
        socket.connect();
        socket.subscribe(function(msg_obj){
            if (msg_obj != undefined)
            {
                var msg_server_id = msg_obj.server_id;
                if (msg_server_id == $scope.service.id)
                {
                    var msg_time = msg_obj.message_time;
                    var msg_dir = msg_obj.direction;
                    var msg_dir_icon = msg_obj.direction == "incoming" ? "fa fa-arrow-right" : "fa fa-arrow-left";
                    var msg_text = json2array(msg_obj.message).join(" ");

                    if ($scope.server_data.messages.data.length > $scope.server_data.messages.max)
                    {
                        $scope.server_data.messages.data.pop();
                    }

                    $scope.server_data.messages.data.unshift({
                        direction: msg_dir,
                        directionIcon: msg_dir_icon,
                        color: msg_dir == "incoming" ? "success" : "active",
                        message: msg_text,
                    });
                    $scope.$apply();
                }
            }
        });
    }

    $scope.onServerSwitch = function(){
        if ($scope.service.isonline)
            offline();
        else
            online();
    }

    $scope.onReservePort = function(){
        $http.get('/server/port/reserve').then(function(resp) {
            var result = resp.data.status;
            if (result)
            {
                $scope.service.port = resp.data.port;
            }
        }, function(err) {
            console.log(err);
        });
    }

    $scope.server_data = {
        messages : {
            max: 2000,
            data: []
        }
    };
}]);
