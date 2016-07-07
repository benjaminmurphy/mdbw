'use strict';

// CHANGE THIS BEFORE RUNNING THE APPLICATION.
const ACCESS_TOKEN = 'REPLACE ME';

const SERVER_PATH = 'http://localhost:8081';
const DEFAULT_COLOR = '#56b1bf';
const HIGHLIGHT_COLOR = '#d73a31';
const MAPBOX_STYLE = 'mapbox.light';
const DEFAULT_BOUNDS = new L.LatLngBounds(
  new L.LatLng(40.672566, -74.07806),
  new L.LatLng(40.796917, -73.79396)
);

const DEFAULT_ZOOM = 13;

const DEFAULT_ZOOM_BOUNDS = new L.LatLngBounds(
  new L.LatLng(40.69967416110621, -73.98206233978271),
  new L.LatLng(40.73077108080421, -73.91103744506836)
);

const DEFAULT_ZOOMED_ZOOM = 15;

const MAPBOX_OPTIONS = {
  touchZoom: false,
  boxZoom: false
};

const ROUTE_LINE_OPTIONS = {
  clickable: false,
  lineJoin: 'round',
  lineCap: 'round',
  color: 'blue',
  dashArray: '5, 10'
};

const SPINNER_OPTS = {
  lines: 11,
  length: 0,
  width: 21,
  radius: 34,
  scale: 0.75,
  corners: 1,
  opacity: 0,
  speed: 1,
  trail: 100,
  top: '40%',
  color: "#a9a9a9"
};

function convertHour(hour) {
  if (hour._id > 11) {
    if (hour._id === 12) {
      hour._id = '12PM';
    } else {
      hour._id = hour._id % 12 + 'PM';
    }
  } else {
    if (hour._id === 0) {
      hour._id = '12AM';
    } else {
      hour._id = hour._id + 'AM';
    }
  }
  return hour;
}

var app = angular.module('mdbw', ['ngRoute']);

app.config(['$locationProvider', '$routeProvider',
  function($locationProvider, $routeProvider) {
    // Configure app view routes.
    $routeProvider
      .when('/', {
        templateUrl: '/templates/map.html',
        controller: 'MapController',
        reloadOnSearch: false,
      })
      .when('/station/:id', {
        templateUrl: '/templates/station.html',
        controller: 'StationController',
        reloadOnSearch: false
      })
      .when('/bike/:id/:station/:time', {
        templateUrl: '/templates/bike.html',
        controller: 'BikeController',
        reloadOnSearch: false
      })
      .otherwise({redirectTo: '/'});

    // Don't use hash-based locations.
    $locationProvider.html5Mode(true);
  }
]);

app.controller('MapController', ['$scope', '$http', '$rootScope', '$q',
  function($scope, $http, $rootScope, $q) {

  angular.extend($scope, {
    data: {},
    requests: []
  });

  var deregister = $rootScope.$watch('bounds', function(bounds) {
    // Handle a 'null' or 'undefined' bounds.
    if (!bounds) return;

    angular.extend($scope, {
      data: {}
    });

    var coordinates = [
      bounds.getSouthWest().lat,
      bounds.getSouthWest().lng,
      bounds.getNorthEast().lat,
      bounds.getNorthEast().lng
    ];

    var requestCanceller = $q.defer();
    $scope.requests.push(requestCanceller);
    $http({
      url: SERVER_PATH + '/stations/statistics',
      method: 'GET',
      params: { coordinates: coordinates },
      timeout: requestCanceller.promise
    }).then(function(response) {
      var statistics = response.data.statistics;

      if (statistics.StartHour) {
        statistics.StartHour = statistics.StartHour
          .map(convertHour);
      }

      angular.extend($scope.data, statistics);
      $rootScope.currentAggregationPipeline = response.data.query;
    });
  });

  $scope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
    for (var request of $scope.requests) {
      request.resolve();
    }
    $scope.requests = [];

    if (newUrl.split('?')[0] === oldUrl.split('?')[0]) return;
    deregister();
  });

}]);

app.controller('StationController',
  ['$scope', '$http', '$rootScope', '$routeParams',
  function($scope, $http, $rootScope, $routeParams) {
    // Parse the station's id from the route.
    var stationId = parseInt($routeParams.id, 10);
    if (isNaN(stationId)) $rootScope.redirectHome();

    angular.extend($scope, {
      data: {},
      highlightedNodes: [stationId],
      station: {
        _id: stationId
      }
    });

    // Retrieve the station that's currently selected.
    $http.get(SERVER_PATH + `/stations/${stationId}`)
      .then(function(response) {
        angular.extend($scope.station, response.data.station);
        var stationCoordinates = new L.LatLng(
          $scope.station.location.coordinates[1],
          $scope.station.location.coordinates[0]
        );

        $rootScope.map.setView(stationCoordinates, DEFAULT_ZOOMED_ZOOM, {animate: true});
      });

    // Retrieve statistics about the station that's currently selected.
    $http.get(SERVER_PATH + `/stations/statistics/${stationId}`)
      .then(function(response) {
        let statistics = response.data.statistics;

        if (statistics.StartHour) {
          statistics.StartHour = statistics.StartHour
            .filter(function(hour) {
              return hour._id > 5;
            })
            .map(convertHour);
        }

        $scope.data = statistics;
        $rootScope.currentAggregationPipeline = response.data.query;
      });

    // Recolor the nodes whenever 'highlightedNodes' changes.
    $scope.$watch('highlightedNodes', function() {
      var featureLayerNodes = $rootScope.features.getGeoJSON();

      // Check if the feature layer has been populated with GeoJSON.
      if (!featureLayerNodes) return;

      featureLayerNodes.map(function(node) {
        if ($scope.highlightedNodes.indexOf(node.properties._id) > -1) {
          node.properties['marker-color'] = HIGHLIGHT_COLOR;
        } else {
          node.properties['marker-color'] = DEFAULT_COLOR;
        }
      });

      $rootScope.features.setGeoJSON(featureLayerNodes);
    });

    // If the page is loaded with this controller active, the nodes will
    // not have been loaded onto the map, and we will be unable to highlight
    // them. Instead, $rootScope will broadcast 'featuresLoaded' when the nodes
    // have finished loading, at which point we can recolor the nodes.
    $scope.$on('featuresLoaded', function() {
      angular.extend($scope, {
        highlightedNodes: [stationId]
      });
    });

    // When we change controller, ensure that no nodes are highlighted.
    $scope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
      if (newUrl.split('?')[0] === oldUrl.split('?')[0]) return;

      angular.extend($scope, {
        highlightedNodes: []
      });
    });
  }
]);

app.controller('BikeController',
  ['$scope', '$routeParams', '$rootScope', '$http', '$location',
  function($scope, $routeParams, $rootScope, $http, $location) {
    // Parse the bike identifier from the url.
    var bikeId = parseInt($routeParams.id, 10);
    var stationId = parseInt($routeParams.station, 10);
    var timestamp = parseInt($routeParams.time, 10);

    if (isNaN(bikeId) || isNaN(stationId) || isNaN(timestamp)) {
      $rootScope.redirectHome();
    }

    angular.extend($scope, {
      bikePath: [],
      bikeMapFeatures: [],
      redirectStation: function() {
        $location.path(`/station/${stationId}`);
      },
      bike: {
        _id: bikeId
      },
      clearMapFeatures: function() {
        for (var feature of $scope.bikeMapFeatures) {
          $rootScope.map.removeLayer(feature);
        }

        angular.extend($scope, {
          bikeRouteLine: []
        });
      }
    });

    // Hide markers.
    $rootScope.features.setFilter(function() { return false; });

    // Load the bike's path data.
    $http({
      url: SERVER_PATH + '/bikes',
      method: 'GET',
      params: {
        station: stationId,
        timestamp: timestamp,
        bike: bikeId
      }
    }).then(function(response) {

      var path = response.data.path;

      if (!path || !path.length) return;

      var currentRoute = [
        path[0].startLocation,
        path[0].endLocation
      ];

      var currentLocation = path[0].endLocation;
      for (var segment = 1; segment < path.length; segment++) {
        var origin = path[segment].startLocation;
        var destination = path[segment].endLocation;

        // Our next ride does not start from the station we currently are at.
        if (origin._id !== currentLocation._id) break;

        currentRoute.push(destination);
        currentLocation = destination;
      }

      var polygon = currentRoute.map(function(station, index) {
          var point = new L.LatLng(
            station.location.coordinates[1],
            station.location.coordinates[0]
          );

          var marker = L.marker(point, {
            clickable: false,
            title: `Stop ${index}: ${station.name}`,
            riseOnHover: true
          });

          $scope.bikeMapFeatures.push(marker);
          marker.addTo($rootScope.map);

          return point;
      });

      var routeLine = L.polyline(polygon, ROUTE_LINE_OPTIONS);
      $scope.bikeMapFeatures.push(routeLine);

      // Resize the map, and then fit the bounds.
      $rootScope.map.fitBounds(routeLine.getBounds());
      routeLine.addTo($rootScope.map);

      $rootScope.currentAggregationPipeline = response.data.query;
    });

    $scope.$on('$locationChangeStart', function(event, newUrl, oldUrl) {
      if (newUrl.split('?')[0] === oldUrl.split('?')[0]) return;
      $rootScope.features.setFilter(function() { return true; });
      $scope.clearMapFeatures();
    });
}]);

app.directive('ngMapbox',
  ['$rootScope', '$location',
  function($rootScope, $location) {
    return {
      restrict: 'A',
      replace: true,
      scope: true,
      template: '<div class="mapbox"></div>',
      link: function(scope, element, attrs) {
        L.mapbox.accessToken = ACCESS_TOKEN;

        $rootScope.map = L.mapbox.map(element[0], MAPBOX_STYLE, MAPBOX_OPTIONS);
        $rootScope.features = L.mapbox.featureLayer().addTo($rootScope.map);
        $rootScope.map.fitBounds(DEFAULT_BOUNDS);
        $rootScope.map.setZoom(DEFAULT_ZOOM);

        // Determine if there's a location specified in the url.
        var params = $location.search();

        // If a view was specified in the url, extract it.
        if (params.bounds) {
          var bounds = params.bounds.split(',').map(parseFloat);
          if (bounds.length == 4 && !bounds.some(isNaN)) {
            $rootScope.map.fitBounds(
              new L.LatLngBounds(
                new L.LatLng(bounds[1], bounds[0]),
                new L.LatLng(bounds[3], bounds[2])
              )
            );
          }
        }

        if (params.zoom) {
          var zoom = parseInt(params.zoom, 10);
          if (!isNaN(zoom)) {
            $rootScope.map.setZoom(zoom);
          }
        }

        angular.extend(scope, {
          updateBounds: function() {
            var bounds = $rootScope.map.getBounds();
            var zoom = $rootScope.map.getZoom();

            // Safely update $rootScope, ensuring we don't trigger an error.
            if (['$apply', '$digest'].indexOf($rootScope.$$phase) > -1) {
              angular.extend($rootScope, {
                bounds: bounds
              });
            } else {
              $rootScope.$apply(function() {
                angular.extend($rootScope, {
                  bounds: bounds
                });
              });
            }
          },
          updateSearchParameters: function() {
            var bounds = $rootScope.map.getBounds();

            $location.search('zoom', $rootScope.map.getZoom());
            $location.search('bounds',
                $rootScope.map.getBounds().toBBoxString());
          }
        });

        scope.updateBounds();
        scope.updateSearchParameters();

        $rootScope.map.on('moveend', function() {
          scope.updateBounds();
          scope.updateSearchParameters();
        });

        $rootScope.map.on('zoom', function() {
          scope.updateBounds();
          scope.updateSearchParameters();
        });

        $rootScope.$on('$routeChangeSuccess', function() {
          scope.updateSearchParameters();
        });
      }
    };
  }
]);

app.directive('ngBarChart', ['$rootScope',
  function($rootScope) {
    return {
      restrict: 'A',
      replace: true,
      scope: {
        attr: '=',
        hover: '@',
        above: '@',
        pad: '@'
      },
      template: '<div class="bar-chart"></div>',
      link: function(scope, element, attrs) {
        var width = element[0].offsetWidth;
        var height = element[0].offsetHeight;
        var spinner = null;

        scope.graph = d3.select(element[0])
          .append('svg');

        function reloadChart(data) {
          if (!$rootScope.statisticsPanelShown) return;

          scope.graph.attr('width', width).attr('height', height);

          scope.graph.selectAll('*').remove();

          if (!Array.isArray(data)) {
            if (!spinner) {
              spinner = new Spinner(SPINNER_OPTS).spin(element[0]);
            }
            return;
          }

          if (spinner) {
            spinner.stop();
            spinner = null;
          }

          var maximum = Math.max.apply(null, data.map(function(datum) {
            return datum.count
          }));

          var barWidth = (scope.pad ? width - 30 : width) / data.length;

          var yScale = d3.scale.linear()
            .domain([0, maximum])
            .range([0, (scope.above ? height - 20 : height)]);

          var g = scope.graph.selectAll('g')
            .data(data)
            .enter()
            .append('g');

          g.append('rect')
            .attr('id', function(d) { return d._id; })
            .attr('x', function(d, i) {
              return i * barWidth + (scope.pad ? 15 : 0);
            })
            .attr('fill', 'lightsteelblue')
            .attr('width', barWidth - 1)
            .attr('height', 0)
            .attr('y', height)
            .transition()
            .duration(function(d, i) { return 2000 * (i + 1) / data.length; })
            .attr('y', function(d) { return height - yScale(d.count); })
            .attr('height', function(d) { return yScale(d.count); });

          g.append('text')
            .attr('x', function(d, i) {
              return (i + 0.5) * barWidth + (scope.pad ? 15 : 0);
            })
            .attr('y', function(d) {
              if (scope.above) {
                return 18;
              } else if (yScale(d.count) < 25) {
                return height - yScale(d.count) - 5;
              }
              return height - yScale(d.count) + 20;
            })
            .attr('show-hover', scope.hover ? 'true' : 'false')
            .attr('text-anchor', 'middle')
            .text(function(d) { return d._id; });
        };

        scope.$watch('attr', reloadChart);
        $rootScope.$watch('statisticsPanelShown', function(value) {
          if (!value) return;

          reloadChart(scope.attr);
        });
      }
    };
  }
]);

app.run(['$rootScope', '$http', '$location',
  function($rootScope, $http, $location) {
    angular.extend($rootScope, {
      statisticsPanelShown: true,
      queryPanelShown: false,
      currentAggregationPipeline: null,
      toggleStatisticsPanel: function() {
        if ($rootScope.statisticsPanelShown) {
          angular.extend($rootScope, {
            statisticsPanelShown: false
          });
        } else {
          angular.extend($rootScope, {
            statisticsPanelShown: true,
            queryPanelShown: false
          });
        }
      },
      toggleQueryPanel: function() {
        if ($rootScope.queryPanelShown) {
          angular.extend($rootScope, {
            queryPanelShown: false
          });
        } else {
          angular.extend($rootScope, {
            statisticsPanelShown: false,
            queryPanelShown: true
          });
        }
      },
      redirectHome: function() {
        $rootScope.map.setZoom(DEFAULT_ZOOM);
        $rootScope.map.fitBounds(DEFAULT_BOUNDS);
        $location.path('/');
      },
      checkKeyEvent: function($event) {
        if ($event.which === 113) { // 'q'
          $rootScope.map.setZoom(DEFAULT_ZOOMED_ZOOM);
          $rootScope.map.fitBounds(DEFAULT_ZOOM_BOUNDS);
        } else if ($event.which === 112) { // 'p'
          $rootScope.map.setZoom(DEFAULT_ZOOM);
          $rootScope.map.fitBounds(DEFAULT_BOUNDS);
        }
      }
    });

    $rootScope.$watch('currentAggregationPipeline', function(pipeline) {
      $('#jsonViewer').JSONView(pipeline);
      $('#jsonViewer').JSONView('collapse', 3);
    });

    $http.get(SERVER_PATH + '/stations')
      .then(function(response) {
        var stations = response.data.stations.map(function(station) {
          station.properties['marker-color'] = DEFAULT_COLOR;
          return station;
        });

        $rootScope.features.on('layeradd', function(event) {
          var marker = event.layer;

          marker.on('click', function(event) {
            $rootScope.$apply(function() {
              $location.path(`/station/${marker.feature.properties._id}`);
            });
          });
        });

        $rootScope.features.setGeoJSON(stations);

        $rootScope.$broadcast('featuresLoaded');
      });
  }
]);

