#!/usr/bin/env node

import express from 'express';
import morgan from 'morgan';
import userData from './routes/userData';
import product from './routes/products';
import stats from './routes/stats';
import health from './routes/health';
import purchaseListener from './firebase/listeners/purchaseListener';
import compensationListener from './firebase/listeners/compensationListener';
import groupListener from './firebase/listeners/groupListener';
import identityListener from './firebase/listeners/identityListener';
import ocrRatingListener from './firebase/listeners/ocrRatingListener';
import pushQueue from './firebase/queues/pushQueue';
import ocrQueue from './firebase/queues/ocrQueue';

const PORT = process.env.PORT || '4000';

const app = express();
app.use(morgan('dev'));

// add routes
app.use('/', health);
app.use('/api/user', userData);
app.use('/api', product);
app.use('/api', stats);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// start http server
const server = app.listen(PORT);
server.on('listening', () => {
  const { port } = server.address();
  console.log(`Listening on ${port}`);
});

// start Firebase listeners and queues
purchaseListener();
compensationListener();
groupListener();
identityListener();
ocrRatingListener();
pushQueue();
ocrQueue();
