import path from 'path';
import request from 'request-promise-native';
import firebase from 'firebase-admin';
import Rx from 'rxjs';

firebase.initializeApp({
  credential: firebase.credential.cert(path.resolve(__dirname, '../../cert/qwittig-314610931f3b.json')), // consider using applicationDefault()
  databaseURL: 'https://qwittig-6fb93.firebaseio.com/',
});

export const db = firebase.database();
export const auth = firebase.auth();
export const TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;
const FCM_SERVER_KEY = 'AIzaSyD0uZXuiDLf7NJvOb0CVsn3-64yktFKxm0';
const NOTIFICATION_ICON = 'ic_shopping_cart_white_24dp';

export function sendPush(tokens, data, notification) {
  return request({
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

export function sendDataPush(tokens, data) {
  return request({
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

export function getUserTokens(identityIds) {
  return Rx.Observable.from(identityIds)
    .mergeMap(identityId => db.ref('identities').child('active').child(identityId).once('value'))
    .map(snap => snap.val())
    .filter(identity => identity.user)
    .mergeMap(identity => db.ref('users').child(identity.user).once('value'))
    .map(snap => snap.val())
    .mergeMap(user => Rx.Observable.from(Object.keys(user.tokens)))
    .toArray()
    .toPromise();
}

export function validateIdToken(idToken) {
  return auth.verifyIdToken(idToken)
    .then(decodedToken => decodedToken.sub);
}
