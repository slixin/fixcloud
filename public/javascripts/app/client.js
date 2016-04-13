app.controller('ctrlFixClient',
    ['$scope', '$http', '$timeout', '$location', '$uibModal', 'localStorageService',
    function($scope, $http, $timeout, $location, $uibModal, localStorageService) {
    if(!localStorageService.isSupported) {
         console.log("The browser does not support local storage service.");
    }
    $scope.user = localStorageService.get('User');

    $scope.$watch('user', function(newvalue, oldvalue) {
        if (newvalue != oldvalue)
        {
            $scope.$emit("onUserChangeEvent", newvalue);
        }
    }, true);

    var showForm = function (session, callback) {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modal-newsession.html',
            controller: 'NewSessionModalCtrl',
            size: 'md',
            scope: $scope,
            resolve: {
                sessionForm: function () {
                    return $scope.sessionForm;
                },
                session: function() {
                    if (session != undefined)
                        return session;
                    else
                        return {};
                }
            }
        });

        modalInstance.result.then(function (result) {
            callback(result);
        }, null);
    };

    var load_sessions = function() {
        $scope.user.settings.clients.forEach(function(c, i) {
            if (c.active)
               $scope.selected_tab = i+1;
        });
    }

    $scope.onAdd = function() {
        showForm(undefined, function(result){
            if (result != undefined)
            {
                var session = result;
                $.each($scope.user.settings.clients, function(index, value) {
                    value.active = false;
                });
                $scope.user.settings.clients.push(session);
                $scope.selected_tab = $scope.user.settings.clients.length;
            }
        });
    };

    $scope.onEdit = function(session) {
        showForm(session, function(result){
            return;
        });
    }

    $scope.onRemove = function(index) {
        bootbox.confirm("Are you sure you want to delete the session?", function(result) {
            if (result)
            {
                $scope.user.settings.clients.splice(index, 1);
                $scope.$apply();
            }
        });
    };

    $scope.onConnect = function(session) {
        bootbox.confirm("Are you going to connect?", function(result) {
            if (result)
            {
                $scope.$broadcast("onSessionConnectEvent", session);
            }
        });
    }

    $scope.onDisconnect = function(session) {
        bootbox.confirm("Are you going to disconnect?", function(result) {
            if (result)
            {
                $scope.$broadcast("onSessionDisconnectEvent", session);
            }
        });
    }

    $scope.onSelectTab = function(index) {
        $scope.user.settings.clients.forEach(function(c) {
            c.active = false;
        });
        $scope.user.settings.clients[index].active = true;
        load_sessions();

    }

    if ($scope.user == null){
        bootbox.alert("Please sign in first!");
        $location.path("/");
    } else {
        load_sessions();
    }


}]);

app.controller('NewSessionModalCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance, sessionForm, session) {
    var session_url = "views/session.html";

    $scope.form = {}
    $scope.session = session
    $scope.session.version = "4.4";
    $scope.submitForm = function (session) {
        if ($scope.form.sessionForm.$valid) {
            var newsession = {
                id: newguid(),
                name: session.name,
                version: session.version,
                sender: session.sender,
                target: session.target,
                host: session.host,
                port: session.port,
                isconnected: false,
                active: true,
                url: session_url
            }
            $uibModalInstance.close(newsession);
        }
    };

    $scope.cancel = function () {
        $uibModalInstance.dismiss(null);
    };

    var newguid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
});


