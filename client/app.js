"use strict";

const express = require('express');
const path = require('path');

let app = express();

app.use('/static', express.static('static'));
app.use('/templates', express.static('templates'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/bike/:id/:station/:time', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/station/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(8080, () => console.log('Client listening at 127.0.0.1:8080...'));
