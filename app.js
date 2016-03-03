var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var multer = require('multer');
var upload = multer({dest: path.join(__dirname, 'uploads')});

var ocr = require('./routes/ocr');
var apple = require('./routes/apple');
var parse = require('./routes/parse/parse');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', apple);
app.use('/api', ocr);
app.use('/api/data', parse);

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
    console.trace(err);
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        console.trace(err.message);
        res.status(err.status || 500);
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
});

module.exports = app;
