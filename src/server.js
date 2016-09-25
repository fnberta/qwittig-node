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

const port = normalizePort(process.env.PORT || '4000');
const server = app.listen(port);
server.on('listening', () => {
  const address = server.address();
  const bind = isString(port) ? `pipe ${address}` : `port ${address.port}`;
  console.log(`Listening on ${bind}`);
});

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
 * Start Firebase listeners and queues.
 */
purchaseListener();
compensationListener();
groupListener();
identityListener();
ocrRatingListener();
pushQueue();
ocrQueue();
