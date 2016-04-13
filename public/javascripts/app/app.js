var app = angular.module('app', ['ngRoute', 'ngAnimate', 'ui.bootstrap', 'xeditable', 'ngClipboard', 'smart-table', 'LocalStorageModule','ng.jsoneditor','ngSanitize']);

app.config(['ngClipProvider', function(ngClipProvider) {
    ngClipProvider.setPath("//cdnjs.cloudflare.com/ajax/libs/zeroclipboard/2.1.6/ZeroClipboard.swf");
}]);

app.config(function (localStorageServiceProvider) {
  localStorageServiceProvider
    .setPrefix('fixcenter')
    .setStorageType('sessionStorage')
    .setNotify(true, true)
});

app.config(['$routeProvider', function($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: '/views/home.html',
            controller: 'ctrlHome',
        })
        .when('/fixserver', {
            templateUrl: '/views/inprogress.html',
        })
        .when('/fixclient', {
            templateUrl: '/views/fixclient.html',
            controller: 'ctrlFixClient'
        })
        .when('/messageviewer', {
            templateUrl: 'views/messageviewer.html',
            controller: 'ctrlMessageViewer'
        })
        .otherwise({
            templateUrl: '/views/home.html',
            controller: 'ctrlHome'
        });
}]);

app.factory('socket', function() {
    var service = {};
    service.socket = {};

    service.connect = function(port) {
        var host = window.document.location.host.replace(/:.*/, '');
        this.socket = io.connect('http://'+host+':'+port);
    };

    service.subscribe = function(callback) {
        this.socket.on('connect',function() {
            console.log('Client has connected!');
        });

        this.socket.on('message',function(data) {
            var msg = {
                        direction: data.direction,
                        direction_title: data.direction == "0" ? "Incoming" : "Outgoing",
                        direction_bgcolor: data.direction == "0" ? 'warning' : 'info',
                        direction_icon: data.direction == "0" ? "fa fa-cloud-download" : "fa fa-cloud-upload",
                        message_display: json2array(data.message).join(" "),
                        message: data.message,
                        message_time: (new Date(data.message_time)).toLocaleString(),
                        session_id: data.session_id,
                        selected: false
                      }
            callback(msg);
        });

        this.socket.on('disconnect',function() {
            console.log('The client has disconnected!');
        });
    };

    service.disconnect = function() {
        if(this.socket != undefined && this.socket != null) {
            console.log('The client has disconnected!');
            this.socket.emit('disconnect');
        }
    };
    return service;
});


app.directive('ngContextMenu', function ($parse) {
    var renderContextMenu = function ($scope, event, options) {
        if (!$) { var $ = angular.element; }
        $(event.currentTarget).addClass('context');
        var $contextMenu = $('<div>');
        $contextMenu.addClass('dropdown clearfix');
        var $ul = $('<ul>');
        $ul.addClass('dropdown-menu');
        $ul.attr({ 'role': 'menu' });
        $ul.css({
            display: 'block',
            position: 'absolute',
            left: event.pageX + 'px',
            top: event.pageY + 'px'
        });
        angular.forEach(options, function (item, i) {
            var $li = $('<li>');
            if (item === null) {
                $li.addClass('divider');
            } else {
                $a = $('<a>');
                $a.attr({ tabindex: '-1', href: 'javascript:void(0);' });
                $a.text(item[0]);
                $li.append($a);
                $li.on('click', function () {
                    $scope.$apply(function() {
                        item[1].call($scope, $scope);
                    });
                });
            }
            $ul.append($li);
        });
        $contextMenu.append($ul);
        $contextMenu.css({
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 9999
        });
        $(document).find('body').append($contextMenu);
        $contextMenu.on("click", function (e) {
            $(event.currentTarget).removeClass('context');
            $contextMenu.remove();
        }).on('contextmenu', function (event) {
            $(event.currentTarget).removeClass('context');
            event.preventDefault();
            $contextMenu.remove();
        });
    };
    return function ($scope, element, attrs) {
        element.on('contextmenu', function (event) {
            $scope.$apply(function () {
                event.preventDefault();
                var options = $scope.$eval(attrs.ngContextMenu);
                if (options instanceof Array) {
                    renderContextMenu($scope, event, options);
                } else {
                    throw '"' + attrs.ngContextMenu + '" not an array';
                }
            });
        });
    };
});

app.directive('ngSessionPanel', function () {
    return {
        restrict: 'AE',
        scope: { data : '=' },
        templateUrl: 'views/session.html',
        controller: 'ctrlSession'
    }
});











