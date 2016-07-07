"use strict";

const MongoClient = require('mongodb').MongoClient;

const uri = 'mongodb://localhost:27017/citibike';

module.exports.connect = () => {
  return (callback) => {
    MongoClient.connect(uri, callback);
  };
};

module.exports.find = (db, collection, query, proj) => {
  return (callback) => {
    let cursor = db.collection(collection).find(query);

    if (proj) {
      cursor.project(proj);
    }

    cursor.toArray(callback);
  }
}

module.exports.aggregate = (db, collection, pipeline) => {
  return (callback) => {
    db.collection(collection).aggregate(pipeline).toArray(callback);
  }
}
