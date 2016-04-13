app.controller('ctrlMain', ['$scope', '$http', '$location', 'localStorageService','$uibModal',
                function($scope, $http, $location, localStorageService,$uibModal) {
    if(!localStorageService.isSupported) {
         console.log("The browser does not support local storage service.");
    }

    $scope.user = localStorageService.get('User');

    $scope.$watch('user', function(newvalue, oldvalue) {
        if (oldvalue != null) {
            // logoff
            if (newvalue == null){
                localStorageService.set('User', null);
                $location.path("/");
            } else {
                // user changed
                if (newvalue != oldvalue){
                    console.log("modified");
                    localStorageService.set('Modified', true);
                    localStorageService.set('User', newvalue);
                }
            }
        } else {
            // logon
            if (newvalue != null){
                localStorageService.set('User', newvalue);
            }
            else{
                $location.path("/");
            }
        }
    }, true);

    $scope.$on('onUserChangeEvent', function(event, object) {
        $scope.user = object;
    });

    $scope.isModified = function() {
        return localStorageService.get('Modified') ==  undefined ? false : localStorageService.get('Modified');
    }

    $scope.fbSignIn = function() {
        var w = 520;
        var h = 280;
        var left = (screen.width / 2) - (w / 2);
        var top = (screen.height / 2) - (h / 2);
        var win = window.open('/auth/facebook', '_blank', 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
        var timer = setInterval(function() {

            if (win.closed) {
                is_authenticated(function(userInfo) {
                    if (userInfo == undefined){
                        $location.path('/');
                    } else {
                        load_user(userInfo.id, function(user){
                            clearInterval(timer);
                            if (user != undefined){
                                $scope.user = {
                                    id: userInfo.id,
                                    displayname: userInfo.displayname,
                                    settings: user.settings
                                }

                                if ($scope.user.settings == undefined){
                                    $scope.user.settings = {
                                        clients: [],
                                        servers: []
                                    }
                                } else {
                                    if ($scope.user.settings.clients == undefined){
                                        $scope.user.settings.clients = [];
                                    } else if ($scope.user.settings.servers) {
                                        $scope.user.settings.servers = [];
                                    }
                                }

                                localStorageService.set('Modified', false);
                            } else {
                                bootbox.alert("Cannot get the user information", function() { return; });
                            }
                        });
                    }
                });
            }
        }, 2000);
    }

    $scope.fbSignOut = function() {
        bootbox.confirm("Are you sure to exit?", function(result) {
            if (result)
            {
                if (localStorageService.get('Modified')){
                    bootbox.confirm("Your settings is modified, do you want to save it before exit?", function(result) {
                        if (result) { save_user(); }
                        $http.get('/auth/logout').then(
                            function(resp) {
                                $scope.user = null;
                                localStorageService.set('User', null);
                                localStorageService.set('Modified', false);
                                localStorageService.set('Messages', null);
                            },
                            function(err) { bootbox.alert(err, function() { return; }); });
                    });
                } else{
                    $http.get('/auth/logout').then(
                            function(resp) {
                                $scope.user = null;
                                localStorageService.set('User', null);
                                localStorageService.set('Messages', null);
                            },
                            function(err) { bootbox.alert(err, function() { return; }); });
                }
            }
        });
    }

    $scope.saveUser = function() {
        bootbox.confirm("Are you going to save the user change?", function(result) {
            if (result)
            {
                save_user();
            }
        });
    }

    $scope.onShowHelper = function() {
        showHelper(function(){});
    }

    var showHelper = function (session) {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modal-helper.html',
            controller: 'HelperCtrl',
            size: 'lg',
            scope: $scope,
            resolve: {
            }
        });

        modalInstance.result.then(function () {}, null);
    };

    var is_authenticated = function(callback) {
        $http.get('/auth/isauthenticated').then(function(resp) {
            var result = resp.data.status;
            if (result)
                callback(resp.data);
            else
                callback(null);
        }, function(err) { bootbox.alert(err, function() { return; }); });
    }

    var load_user = function(user_id, callback) {
        $http.post('/user/load', {
            userid:user_id
        }).then(function(resp) {
            if (resp.data.status == true) {
                callback(resp.data.user);
            } else {
                callback(null);
            }
        }, function(err) { bootbox.alert(err, function() { return; }); });
    }

    var save_user = function() {
        $http.post('/user/save', {
            user: $scope.user,
        }).then(function(resp) {
            if (!resp.data.status) {
                var reason = JSON.stringify(resp.data.exception);
                bootbox.alert('Save user setting failed!' + reason, function() {return; });
            } else {
                localStorageService.set('Modified', false);
            }
        }, function(err) { bootbox.alert(err, function() { return; }); });
    }

    is_authenticated(function(userInfo) {
        if (userInfo == undefined){
            localStorageService.set('User', null);
            $scope.user = null;
        } else {
            $scope.user = localStorageService.get('User');
        }
    });
}]);

app.controller('HelperCtrl', function ModalInstanceCtrl ($scope, $uibModalInstance) {
    $scope.close = function () {
        $uibModalInstance.dismiss(null);
    };
});
