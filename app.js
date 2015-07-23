var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var multer  = require('multer');

var routes = require('./routes/ocr');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(multer({dest: './uploads'}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', routes);

// catch and handle parse.com errors
app.use(function(err, req, res, next) {
    if (err.parseCode == 209) {
        res.sendStatus(err.status);
    } else {
        next(err);
    }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
});

module.exports = app;
