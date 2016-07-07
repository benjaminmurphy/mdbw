"use strict";

const express = require('express');
const routes = require('./routes.js');
const MongoClient = require('mongodb').MongoClient;

const uri = 'mongodb://localhost:27017/citibike';

let app = express();

let allowCrossDomain = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
};

app.use(allowCrossDomain);

MongoClient.connect(uri, (err, db) => {
  if (err) {
    console.error('Unable to connect to database. Is it running on port 27017?');
    process.exit(1);
  }

  app.get('/stations', routes.getStations.bind(null, db));
  app.get('/stations/statistics', routes.getStationSummary.bind(null, db));
  app.get('/stations/statistics/:id', routes.getStationStatistics.bind(null, db));
  app.get('/stations/:id', routes.getStation.bind(null, db));
  app.get('/bikes', routes.getBike.bind(null, db));

  app.listen(8081, () => console.log("Server listening..."));
});

