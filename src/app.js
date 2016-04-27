var express = require('express');
var path = require('path');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var ocr = require('./routes/ocr');
var apple = require('./routes/apple/apple');
var parse = require('./routes/parse/parse');

var app = express();

app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use('/', apple);
app.use('/api', ocr);
app.use('/api/data', parse);


// error handlers

// catch and handle parse.com errors
app.use(function (err, req, res, next) {
    if (err.parseCode == 209) {
        res.sendStatus(err.status);
    } else {
        next(err);
    }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

app.use(function (err, req, res, next) {
    // print stacktrace if in dev mode
    if (app.get('env') === 'development') {
        console.trace(err);
    }
    
    res.status(err.status || 500);
});

module.exports = app;
