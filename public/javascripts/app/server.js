app.controller('ctrlFixServer', ['$scope', '$http', '$timeout', '$cookieStore', '$location', function($scope, $http, $timeout, $cookieStore, $location) {
    $scope.server_tabs = [];
    $scope.selected_server = null;
    $scope.user = null;

    var server_url = "views/service.html";

    var loading_servers = function(servers) {
        if (servers != undefined)
        {
            $scope.server_tabs = [];
            var idx = 1;
            $.each(servers, function(index, value) {
                var server = value;
                var waitsec = idx * 500;
                $timeout(function() {
                    add_new_tab(server);
                }, waitsec);
                if (server.isactive)
                    $scope.selected_server = server;
                idx++;
            });
        }
    }

    var add_new_tab = function(server) {
        var newTab = {
            id: server.id,
            name: server.name,
            port: server.port,
            isactive: server.isactive,
            url: server.url
        }

        $scope.server_tabs.push(newTab);

        $timeout(function() {
            $scope.$broadcast("onNewServerEvent", server);
        }, 200);
    };

    var delete_server = function(id) {
        var server_name = null;
        $scope.user.settings.servers.forEach(function(value, index) {
            if (value.id == id) {
                server_name = value.name;
                $scope.user.settings.servers.splice(index, 1);
            }
        });

        bootbox.alert('Server ' + server_name+ ' is deleted!',function() {
            $scope.selected_server = null;
        });
    }

    var newguid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    $scope.$watch('user', function(newvalue, oldvalue) {
        if (newvalue != oldvalue)
        {
            $scope.$emit("onUserSettingsChangeEvent", $scope.user);
        }
    }, true);

    $scope.$on('onServerChangeEvent', function(event, object) {
        var target_tabs = $.grep($scope.server_tabs, function(e) {
            return e.id == object.id
        });
        if (target_tabs.length == 1) {
            if (target_tabs[0].name != object.name)
                target_tabs[0].name = object.name;
        }

        if ($scope.selected_server != undefined)
        {
            $scope.user.settings.servers.forEach(function(server){
                if (server.id == $scope.selected_server.id)
                {
                    server = object;
                }
            });
        }

    })

    $scope.onClickTab = function(tab) {
        tab.isactive = true;
        $.each($scope.user.settings.servers, function(index, value) {
            if (value.id == tab.id)
                value.isactive = true;
            else
                value.isactive = false;
        });

    }

    $scope.addServer = function() {
        if ($scope.server_tabs.length > 5) {
            bootbox.alert('You have reached the max servers!', function() {
                return;
            });
        } else {
            if ($scope.selected_server != null)
                $scope.selected_server.isactive = false;

            var newserver =  {
                id: newguid(),
                name: "Untitled Server",
                port: null,
                isonline: false,
                isactive: true,
                url: server_url
            }

            $scope.selected_server = newserver;
            add_new_tab(newserver);
            $scope.user.settings.servers.push(newserver);
        }
    };

    $scope.removeServer = function(idx) {
        if ($scope.server_tabs.length > 0) {
            var targetTab = $scope.server_tabs[idx];
            delete_server(targetTab.id);
            $scope.server_tabs.splice(idx, 1);
            if (idx - 1 >= 0)
            {
                $scope.server_tabs[idx - 1].active = true;
                var filter_servers = $scope.user.settings.servers.filter(function(s) {
                    return s.id == $scope.server_tabs[idx - 1].id;
                });
                $scope.selected_server = filter_servers[0];
            }
        }
    };

    if ($cookieStore.get('me') == undefined)
    {
        bootbox.alert('You have to sign in first.', function() {
                console.log('sign in alert');
            });
        $location.path('/');
    }
    else
    {
        $scope.user = $cookieStore.get('me');
        if ($scope.user.settings != undefined)
        {
            loading_servers($scope.user.settings.servers);
        }
        else
        {
            $scope.user.settings = { clients: [], servers: []};
        }
    }
}]);
