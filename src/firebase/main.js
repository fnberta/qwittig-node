/**
 * Created by fabio on 25.07.16.
 */

import path from 'path';
import request from 'request-promise';
import firebase from 'firebase';

firebase.initializeApp({
  serviceAccount: path.resolve(__dirname, '../../cert/qwittig-314610931f3b.json'),
  databaseURL: 'https://qwittig-6fb93.firebaseio.com/',
});

export const db = firebase.database();
export const auth = firebase.auth();
export const TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;
const FCM_SERVER_KEY = 'AIzaSyD0uZXuiDLf7NJvOb0CVsn3-64yktFKxm0';
const NOTIFICATION_ICON = 'ic_shopping_cart_white_24dp';

export async function sendPush(tokens, data, notification) {
  await request({
    method: 'POST',
    url: 'https://fcm.googleapis.com/fcm/send',
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: {
      registration_ids: tokens,
      content_available: true,
      data,
      notification: {
        ...notification,
        sound: 'default',
        icon: NOTIFICATION_ICON,
      },
    },
    json: true,
  });
}

export async function sendDataPush(tokens, data){
  await request({
    method: 'POST',
    url: 'https://fcm.googleapis.com/fcm/send',
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: {
      registration_ids: tokens,
      content_available: true,
      data,
    },
    json: true,
  });
}

export async function validateIdToken(idToken) {
  const decodedToken = await auth.verifyIdToken(idToken);
  return decodedToken.sub;
}
