'use strict';

const co = require('co');
const util = require('./util');

module.exports.getStations = function(db, req, res) {
  co(function* () {
    let query = [
      {
        $project: {
          _id: 0,
          type: {$literal: 'Feature'},
          geometry: '$location',
          properties: { _id: '$_id' }
        }
      }
    ];

    try {
      var stations = yield util.aggregate(db, 'stations', query);
    } catch (e) {
      res.status(500);
      return res.end();
    }

    res.send({
      stations: stations
    });
  }).catch((err) => {
    console.error(err.stack());
    res.status(500);
    return res.end();
  });
};

module.exports.getStation = function(db, req, res) {
  co(function* () {
    let stationId = parseInt(req.params.id, 10);

    if (isNaN(stationId)) {
      res.status(400);
      return res.end();
    }

    let query = {
      _id: stationId
    };

    try {
      var station = yield util.find(db, 'stations', query);
    } catch (e) {
      res.status(500);
      return res.end();
    }

    res.send({
      station: station[0]
    });
  }).catch((err) => {
    console.error(err.stack());
    res.status(500);
    return res.end();
  });
};

module.exports.getBike = function(db, req, res) {
  co(function* () {
    let bikeId = parseInt(req.query.bike, 10);
    let stationId = parseInt(req.query.station, 10);
    let timestamp = parseInt(req.query.timestamp, 10);

    if (isNaN(bikeId) || isNaN(stationId) || isNaN(timestamp)) {
      res.status(400);
      return res.end();
    }

    let query = [
      {
        $match: {
          _id: stationId
        }
      },
      {
        $graphLookup: {
          from: 'rides',
          startWith: '$_id',
          connectToField: 'startStation._id',
          connectFromField: 'endStation._id',
          as: 'bikePath',
          restrictSearchWithMatch: {
            'bike': bikeId,
            'time.0': {$gte: new Date(timestamp)}
          }
        }
      },
      {
        $unwind: '$bikePath'
      },
      {
        $sort: {
          'bikePath.time': 1
        }
      },
      {
        $project: {
          _id: 0,
          startLocation: '$bikePath.startStation',
          endLocation: '$bikePath.endStation'
        }
      }
    ];

    try {
      var path = yield util.aggregate(db, 'stations', query);
    } catch (err) {
      console.error(err.stack());
      res.status(500);
      return res.end();
    }

    res.send({
      path: path,
      query: query
    });
  }).catch((err) => {
    console.error(err.stack());
    res.status(500);
    return res.end();
  });
};

module.exports.getStationStatistics = function(db, req, res) {
  co(function* () {
    let stationId = parseInt(req.params.id, 10);

    if (isNaN(stationId)) {
      res.status(400);
      return res.end();
    }

    let query = [
        {
          $match: {
            'startStation._id': stationId
          }
        },
        {
          $facet: {
            BirthYear: [
              {
                $match: {
                  'user.birthYear': {$type: "int"}
                }
              },
              {
                $bucket: {
                  groupBy: {$subtract: [2016, '$user.birthYear']},
                  boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, Infinity]
                }
              }
            ],
            DayOfWeek: [
              {
                $group: {
                  _id: {$dayOfWeek: {$arrayElemAt: ['$time', 0]}},
                  value: {$sum: 1}
                },
              },
              {
                $sort: {_id: 1}
              },
              {
                $project: {
                  _id: {$arrayElemAt: [
                    {$literal: [null, 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']},
                    '$_id'
                  ]},
                  count: '$value'
                }
              }
            ],
            StartHour: [
              {
                $bucket: {
                  groupBy: {$hour: {$arrayElemAt: ['$time', 0]}},
                  boundaries: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, Infinity]
                }
              }
            ],
            Rides: [
              {
                $limit: 3
              },
              {
                $project: {
                  _id: 0,
                  departureTime: {$arrayElemAt: ['$time', 0]},
                  bike: '$bike'
                }
              }
            ]
          }
        }
    ];

    try {
      var statistics = yield util.aggregate(db, 'rides', query);
    } catch (err) {
      console.error(err.stack());
      res.status(500);
      return res.end();
    }

    for (let ride of statistics[0].Rides) {
      ride.departureTime = ride.departureTime.getTime();
    }

    res.send({
      statistics: statistics[0],
      query: query
    });
  }).catch((err) => {
    console.error(err.stack());
    res.status(500);
    return res.end();
  });
};

module.exports.getStationSummary = function(db, req, res) {
  co(function* () {
    let [swlat, swlng, nelat, nelng] = req.query.coordinates.map(parseFloat);

    if (isNaN(swlng) || isNaN(swlat) || isNaN(nelng) || isNaN(nelat)) {
      res.status(400);
      return res.send();
    }

    let query = [
      {
        $match: {
          'startStation.location': {
            $geoWithin: {
              $geometry: {
                type: 'Polygon',
                coordinates: [[
                  [swlng, swlat],
                  [swlng, nelat],
                  [nelng, nelat],
                  [nelng, swlat],
                  [swlng, swlat]
                ]]
              }
            }
          }
        }
      },
      {
        $facet: {
          'BirthYear': [
            {
              $match: {
                'user.birthYear': {$type: "int"}
              }
            },
            {
              $bucket: {
                groupBy: {$subtract: [2016, '$user.birthYear']},
                boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, Infinity]
              }
            }
          ],
          'DayOfWeek': [
            {
              $group: {
                _id: {$dayOfWeek: {$arrayElemAt: ['$time', 0]}},
                value: {$sum: 1}
              },
            },
            {
              $sort: {_id: 1}
            },
            {
              $project: {
                _id: {$arrayElemAt: [
                  {$literal: [null, 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']},
                  '$_id'
                ]},
                count: '$value'
              }
            }
          ],
          'StartHour': [
            {
              $bucket: {
                groupBy: {$hour: {$arrayElemAt: ['$time', 0]}},
                boundaries: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, Infinity]
              }
            }
          ]
        }
      }
    ];

    try {
      var statistics = yield util.aggregate(db, 'rides', query);
    } catch (err) {
      console.error(err.stack());
      res.status(500);
      return res.end();
    }

    res.send({
      statistics: statistics[0],
      query: query
    });
  }).catch((err) => {
    console.error(err.stack());
    res.status(500);
    return res.end();
  });
};

