const express = require('express');
const path = require('path');
const morgan = require('morgan');

import {router as ocr} from './routes/ocr';
import {router as apple} from './routes/apple';
import {router as product} from './routes/products';
import {parseApi} from './routes/parse/parse';

const app = express();

app.use(morgan('dev'));

app.use('/', apple);
app.use('/api', ocr);
app.use('/api', product);
app.use('/api/data', parseApi);


// catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

module.exports = app;
