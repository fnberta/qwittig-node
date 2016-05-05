const express = require('express');
const path = require('path');
const morgan = require('morgan');

const ocr = require('./routes/ocr');
const apple = require('./routes/apple');
const parse = require('./routes/parse/parse');

const app = express();

app.use(morgan('dev'));

app.use('/', apple);
app.use('/api', ocr);
app.use('/api/data', parse);


// catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

module.exports = app;
