#!/usr/bin/env node

import { isString } from 'lodash';
import app from './app.js';
import purchaseListener from './firebase/listeners/purchaseListener';
import compensationListener from './firebase/listeners/compensationListener';
import groupListener from './firebase/listeners/groupListener';
import identityListener from './firebase/listeners/identityListener';
import ocrRatingListener from './firebase/listeners/ocrRatingListener';
import pushQueue from './firebase/queues/pushQueue';
import ocrQueue from './firebase/queues/ocrQueue';

const http = require('http');
const debug = require('debug')('Node:server');

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || '4000');
app.set('port', port);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  const parsedPort = parseInt(val, 10);

  if (isNaN(parsedPort)) {
    // named pipe
    return val;
  }

  if (parsedPort >= 0) {
    // port number
    return parsedPort;
  }

  return false;
}

/**
 * Create HTTP server.
 */
const server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */
server.listen(port);
server.on('error', (err) => {
  if (err.syscall !== 'listen') {
    throw err;
  }

  const bind = isString(port) ? `pipe ${port}` : `Port ${port}`;
  // handle specific listen errors with friendly messages
  switch (err.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw err;
  }
});
server.on('listening', () => {
  const address = server.address();
  const bind = isString(port) ? `pipe ${address}` : `port ${address.port}`;
  debug(`Listening on ${bind}`);
});

/**
 * Start Firebase listeners and queues.
 */
purchaseListener();
compensationListener();
groupListener();
identityListener();
ocrRatingListener();
pushQueue();
ocrQueue();
