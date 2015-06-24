var app = angular.module('app', ['ngRoute', 'ui.bootstrap','xeditable', 'ngBootbox','ngClipboard', 'smart-table', 'ngCookies']);

 app.config(['ngClipProvider', function(ngClipProvider) {
    ngClipProvider.setPath("//cdnjs.cloudflare.com/ajax/libs/zeroclipboard/2.1.6/ZeroClipboard.swf");
  }]);

 app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: '/views/home.html',
            controller: 'ctrlHome',
        })
        .when('/logreader',{
            templateUrl: '/views/logreader.html',
            controller: 'ctrlLogReader'
        })
        .when('/fixclient',{
            templateUrl: '/views/fixclient.html',
            controller: 'ctrlFixClient'
        })
        .when('login', {

        })
        .otherwise({
            templateUrl: '/views/home.html',
            controller: 'ctrlHome'
        });
}]);

app.controller('navCtrl', ['$scope', '$location', function ($scope, $location) {
    $scope.navClass = function (page) {
        var currentRoute = $location.path().substring(1) || 'home';
        return page === currentRoute ? 'active' : '';
    };
}]);

app.controller('ctrlHome', ['$scope', '$http', function ($scope, $http) {

}]);

app.controller('ctrlFixClient', ['$scope','$http', '$timeout','$ngBootbox','$cookies', function ($scope, $http, $timeout, $ngBootbox,$cookies) {
    var sessionTemplate = "views/session.html";

    $scope.settingTabs = [];
    $scope.loggedinUser = null;
    $scope.selectedSetting = null;

    $scope.$on('$locationChangeStart', function( event ) {
        var answer = confirm("Leaving will disconnect all FIX sessions. \r\nAre you sure you want to leave this page?")
        if (!answer) {
            event.preventDefault();
        }
    });

    var isLogin = function(callback)
    {
        $http.get('/islogin').then(function(resp) {
            var result = false;
            if (resp.data.status == "ok")
            {
                $scope.loggedinUser = {
                    userid: resp.data.id,
                    username: resp.data.displayname,
                    usersettings: []
                }
                result = true;
            }
            else
            {
                result = false;
            }
            callback(result);
          }, function(err) {
            callback(false);
          });
    }

    var loadingSettings = function(){
        $http.post('/loadsettings', {userid: $scope.loggedinUser.userid}).then(function(resp) {
            if (resp.data.status == "ok")
            {
                var data = JSON.parse(resp.data.settings);

                $.each(data.usersettings, function(index, value){
                    var setting = {
                        id: value.id,
                        name: value.name,
                        sessions: value.sessions,
                        isactive: value.isactive
                    };
                    $.each(setting.sessions, function(key, value){
                        value.url = sessionTemplate;
                    });
                    $scope.loggedinUser.usersettings.push(setting);
                    if (setting.isactive)
                    {
                        loadSessions(setting);
                        $scope.selectedSetting = setting;
                    }
                });
            }
          }, function(err) {
            console.error('ERR', err);
          });
    }

    var loadSessions = function(setting){
        $scope.settingTabs = [];
        var idx = 1;
        setting.sessions.forEach(function(session){
            var waitsec = idx * 500;
            $timeout(function(){
                addNewTab(session);
            }, waitsec);
            idx++;
        });
    }

    var saveSetting = function(setting){
        $http.post('/savesetting', {userid: $scope.loggedinUser.userid, setting: setting}).then(function(resp) {
        if (resp.data.status == "ok")
        {
            $ngBootbox.alert('Your user setting are saved!').then(function() {
                console.log('Saved');
            });
        }
        else
        {
            var reason = JSON.stringify(resp.data.exception);
            $ngBootbox.alert('Saving setting failed!' + reason).then(function() {
            });
        }
      }, function(err) {
        console.error('ERR', err);
      });
    }

    var deleteSetting = function(setting){
        $http.post('/deletesetting', {userid: $scope.loggedinUser.userid, setting: setting}).then(function(resp) {
        if (resp.data.status == "ok")
        {
            $scope.loggedinUser.usersettings.forEach(function(value, index){
                if (value.id == setting.id)
                {
                    $scope.loggedinUser.usersettings.splice(index, 1);
                }
            });

            $ngBootbox.alert('User setting ' + $scope.currentsetting + ' is deleted!').then(function() {
                $scope.settingTabs = [];
                $scope.selectedSetting = null;
            });
        }
        else
        {
            var reason = JSON.stringify(resp.data.exception);
            $ngBootbox.alert('Saving setting failed!' + reason).then(function() {
            });
        }
      }, function(err) {
        console.error('ERR', err);
      });
    }

    var addNewTab = function(session) {

        var newTab = {
            id: session.id,
            name: session.name,
            isactive: session.isactive,
            url: sessionTemplate
        }
        $scope.settingTabs.push(newTab);

        $timeout(function(){
            $scope.$broadcast("onNewSessionEvent", session);
        }, 200);
    };

    var newguid = function()
    {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }

    var generateNewSession = function(){
        return {
            id: newguid(),
            name: "Untitled Session",
            version: "4.4",
            sender: "",
            target: "",
            host: "",
            port: "",
            isconnected: false,
            isactive: true,
        }
    }

    $scope.$on('onSessionChangeEvent', function(event, msg){
        var targetTabs = $.grep($scope.settingTabs, function(e) {return e.id == msg.id});
        if (targetTabs.length == 1)
        {
            if (targetTabs[0].name != msg.name)
                targetTabs[0].name = msg.name;
        }
    })

    $scope.onClickTab = function (tab) {
        tab.isactive = true;
        $.each($scope.selectedSetting.sessions, function(index, value) {
            if (value.id == tab.id)
                value.isactive = true;
            else
                value.isactive = false;
        });

    }

    $scope.addSession = function () {
        if ($scope.loggedinUser.usersettings.length == 0)
        {
            $ngBootbox.alert('You do not have any setting yet, please click NEW button to create one.').then(function() {
                console.log('create new setting');
            });
        }
        else
        {
            if ($scope.selectedSetting.sessions.length > 8)
            {
                $ngBootbox.alert('You have reached the max sessions!').then(function() {
                    return;
                });
            }
            else
            {
                $.each($scope.selectedSetting.sessions, function(index, value) {
                    value.isactive = false;
                });
                var newsession = generateNewSession();
                $scope.selectedSetting.sessions.push(newsession);
                addNewTab(newsession);
            }
        }
    };

    $scope.removeSession = function (idx) {
        if ($scope.settingTabs.length > 1)
        {
            var targetTab = $scope.settingTabs[idx];
            $.each($scope.selectedSetting.sessions, function(index, value) {
                if (value.id == targetTab.id)
                {
                    $scope.selectedSetting.sessions.splice(index, 1);
                }
            });

            $scope.settingTabs.splice(idx, 1);
            if (idx-1 >= 0)
                $scope.settingTabs[idx-1].active = true;
        }
        else
        {
            $ngBootbox.alert('At least one session is required!').then(function() {
                return;
            });
        }
    };

    $scope.fbSignIn = function(){
        var w = 520;
        var h = 280;
        var left = (screen.width/2)-(w/2);
        var top = (screen.height/2)-(h/2);
        var win = window.open('/auth/facebook', '_blank', 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, width='+w+', height='+h+', top='+top+', left='+left);
        var timer = setInterval(function(){
            if (win.closed) {
                isLogin(function(result)
                    {
                        loadingSettings();
                    });
                clearInterval(timer);
            }}, 200);
    }

    $scope.onNewSetting = function(){

        $ngBootbox.prompt('Please name your new user setting').then(function(result) {
            $scope.settingTabs = [];
            var newSetting = {
                id: newguid(),
                name: result,
                sessions: [],
                isactive: true
            };
            $.each($scope.loggedinUser.usersettings, function(index, value) {
                value.isactive = false;
            });

            $scope.loggedinUser.usersettings.push(newSetting);
            $scope.selectedSetting = newSetting;

            var newsession = generateNewSession();
            $scope.selectedSetting.sessions.push(newsession);
            addNewTab(newsession);
        }, function() {
            console.log('Ignore!');
        });
    }

    $scope.onSaveSetting = function(setting){
        saveSetting(setting);
    };

    $scope.onDeleteSetting = function(setting){
        deleteSetting(setting);
    }

    $scope.onSelectSetting = function(setting){
        $scope.selectedSetting = setting;
        $.each($scope.loggedinUser.usersettings, function(key, data) {
                data.isactive = false;
        });
        setting.isactive = true;
        loadSessions(setting);
    }

    isLogin(function(result){
        if (result)
            loadingSettings();
    });
}]);

app.controller ("ctrlSession", ['$scope', '$http','$interval','$ngBootbox', function ($scope, $http, $interval, $ngBootbox) {
        $scope.session = null;
        $scope.inputmessage = null;

        $scope.$on('$destroy', function () { console.log('cancel timer'); $interval.cancel(timer); });

        $scope.$on('$destroy', function( event ) {
            disconnect();
        });

        $scope.$watch('session', function() {
            if ($scope.session != null)
            {
                if ($scope.session.isconnected)
                {
                    $scope.sessionPanel = {
                        btnText: "Disconnect",
                        btnStyle: "btn-warning",
                        isEditable: false,
                    }
                }
                else
                {
                    $scope.sessionPanel = {
                        btnText: "Connect",
                        btnStyle: "btn-success",
                        isEditable: true,
                    };
                }
                $scope.$emit("onSessionChangeEvent", $scope.session);
            }
        },true);

        $scope.$on("onNewSessionEvent", function (event, data) {
            if ($scope.session == null)
            {
                data.isconnected = false;
                $scope.session = data;
            }
        });

        var randomString = function(number){
            var text = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

            for( var i=0; i < number; i++ )
                text += possible.charAt(Math.floor(Math.random() * possible.length));

            return text;
        }

        var checkField = function(field, errmsg){
            if (field == null)
            {
                $ngBootbox.alert(errmsg).then(function() {
                    return;
                });
                return false;
            }

            if (field.length == 0)
            {
                $ngBootbox.alert(errmsg).then(function() {
                    return;
                });
                return false;
            }

            return true;
        }

        var getMessages = function() {
            if ($scope.session.isconnected)
            {
                $http.post('/fix/getmessages', {"sessionId": $scope.session.sessionid}).then(function(resp) {
                    var rowsResult = [];
                    $.each(resp.data.messages, function(key, data) {
                        var directionIcon = null;
                        var parsedMessage = null;
                        var rowcolor = null;
                        if (data.direction == "incoming")
                        {
                            directionIcon = "fa fa-arrow-right";
                            rowcolor = "success";
                        }
                        else
                        {
                            directionIcon = "fa fa-arrow-left"
                            rowcolor = "active";
                        }
                        parsedMessage = json2array(data.message).join(" ");
                        rowsResult.push({direction: data.direction, directionIcon: directionIcon, color: rowcolor, message: parsedMessage});
                    });
                    $scope.originalRowCollection = rowsResult;
                  }, function(err) {
                    console.error('ERR', err);
                  });
            }
        }

        var cleanMessages = function() {
            if ($scope.session.isconnected)
            {
                console.log($scope.sessionID);
                $http.post('/fix/resetmessages', {"sessionId": $scope.session.sessionid}).then(function(resp) {
                    if (resp.data.status == "ok")
                        console.log("Clean up messages");
                    }, function(err) {
                        console.error('ERR', err);
                    });
            }
        }

        var normalizeMessage = function(message){
            var messageArray = message.split(/,|;| |\u0001/);
            var validmsgArray = [];
            var ignoreTags = ["8", "49", "56", "34", "52"];
            var validTags = {};
            jQuery.each( messageArray, function( i, val ) {
                if (val.indexOf("=") > 0)
                {
                    var tagname = val.split('=')[0].trim();
                    var tagvalue = val.split('=')[1].trim();
                    if ($.inArray(tagname, ignoreTags) <= -1) {
                      validTags[tagname] = tagvalue;
                    }
                }
            });

            if (validTags.length == 0)
            {
                $ngBootbox.alert('Cannot normalize input message!').then(function() {
                    return;
                });
                return null;
            }
            return JSON.stringify(validTags);
        }

        var connect = function(){
            $http.post('/fix/logon', {"version": $scope.session.version,
                                      "senderid": $scope.session.sender,
                                      "targetid": $scope.session.target,
                                      "host": $scope.session.host,
                                      "port": $scope.session.port}).then(function(resp) {
                if (resp.data != null)
                {
                    if (resp.data.status == "ok")
                    {
                        $scope.session.sessionid = resp.data.sessionid;
                        $scope.session.isconnected = true;
                    }
                    else if (resp.data.status == "error")
                    {
                        $scope.session.isconnected = false;
                        if (resp.data.exception.code == "ECONNREFUSED")
                        {
                            $ngBootbox.alert('Connection refused!').then(function() {
                                return;
                            });
                        }
                        else
                        {
                            $ngBootbox.alert('Connection failed, '+ JSON.stringify(resp.data.exception)).then(function() {
                                return;
                            });
                        }
                    }
                }
              }, function(err) {
                console.error('ERR', err);
              });
        }

        var disconnect = function(){
            if ($scope.session.sessionid != null)
            {
                $interval.cancel(timer);
                $http.post('/fix/logout', {"sessionId": $scope.session.sessionid}).then(function(resp) {
                    $scope.session.isconnected = false;
                  }, function(err) {
                    $scope.session.isconnected = false;
                    console.error('ERR', err);
                  });
            }
        }

        $scope.onSessionConnection = function () {
            if (!$scope.session.isconnected)
            {
                if(!checkField($scope.session.name, "Name cannot be empty.")) return;
                if(!checkField($scope.session.version, "Version cannot be empty.")) return;
                if(!checkField($scope.session.sender, "Sender cannot be empty.")) return;
                if(!checkField($scope.session.target, "Target cannot be empty.")) return;
                if(!checkField($scope.session.host, "Host cannot be empty.")) return;
                if(!checkField($scope.session.port, "Port cannot be empty.")) return;

                connect();
            }
            else
            {
                disconnect();
            }
        };

        $scope.onSend = function () {
            var inputmessage = $scope.inputmessage;
            if ($scope.session.isconnected)
            {
                if (inputmessage == undefined)
                {
                    $ngBootbox.alert('Empty message cannot be sent out!').then(function() {
                        return;
                    });
                }
                else if (inputmessage.trim().length == 0)
                {
                    $ngBootbox.alert('Empty message cannot be sent out!').then(function() {
                        return;
                    });
                }
                else
                {
                    var message = normalizeMessage(inputmessage.trim());

                    $http.post('/fix/send', {"sessionId": $scope.session.sessionid,
                                             "message": message}).then(function(resp) {
                        $ngBootbox.alert('Message sent out.').then(function() {
                            return;
                        });
                      }, function(err) {
                        console.error('ERR', err);
                      });
                }
            }
            else
            {
                $ngBootbox.alert('Please connect to session first!').then(function() {
                    return;
                });
            }

        };

        $scope.onClean = function(){
            $scope.inputmessage = "";
        }

        $scope.onCopy = function(){
            $ngBootbox.alert('Message is copied to clipboard!').then(function() {
                return;
            });
        }

        $scope.onAdvanceInput = function(){
            return;
        }

        $scope.onCleanMessage = function(){
            cleanMessages();
            $scope.originalRowCollection = null;
        }

        $scope.onExportMessages = function(){
            var sampletext ="this is an example\nPretty boring aye?";
            var a = document.body.appendChild(
                document.createElement("a")
            );
            a.download = "export.txt";
            a.href = "data:text/plain;base64," + btoa(sampletext);
            a.innerHTML = "download example text";
        }

        var timer = $interval(getMessages, 2000);

}]);

app.controller('ctrlLogReader', ['$scope','$ngBootbox', function ($scope, $ngBootbox) {

    $scope.onClean = function(){
        $scope.originalLog = null;
    }

    $scope.onCopy = function(){
        $ngBootbox.alert('Messages are copied to clipboard!').then(function() {
            return;
        });
    }

    $scope.onParse = function(){

    }
}]);

