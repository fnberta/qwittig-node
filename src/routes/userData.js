import express from 'express';
import bodyParser from 'body-parser';
import Rx from 'rxjs';
import { assocPath, compose } from 'ramda';
import { db, getUserTokens, sendPush, TIMESTAMP, validateIdToken } from '../firebase/main';

const jsonParser = bodyParser.json();
const router = express.Router(); // eslint-disable-line babel/new-cap
export default router;

router.post('/delete', jsonParser, (req, res, next) => {
  const idToken = req.body.idToken;
  if (!idToken) {
    const error = new Error('Bad request');
    error.status = 400;
    next(error);
    return;
  }

  handleUserDataDeletion(idToken)
    .then(() => res.sendStatus(200))
    .catch(err => next(err));
});

async function handleUserDataDeletion(idToken) {
  const userId = await validateIdToken(idToken);
  const groupNicknames = await deleteUserData(userId);
  await sendPushUserDeleted(groupNicknames);
}

async function deleteUserData(userId) {
  const user = (await db.ref('users').child(userId).once('value')).val();
  const identityIds = Object.keys(user.identities);
  const identitySnaps = await Promise.all(identityIds.map((identityId =>
    db.ref('identities').child('active').child(identityId).once('value'))));
  const compsSnap = await db.ref('compensations').child('unpaid').once('value');

  const initial = {
    updates: {
      [`users/${userId}`]: null,
    },
    groupNicknames: {},
  };
  const result = getCompensationUpdates(compsSnap, identityIds, getIdentityUpdates(identitySnaps, initial));

  // perform operations atomically
  await db.ref().update(result.updates);

  // return groupIds and nicknames to send push
  return result.groupNicknames;
}

function getIdentityUpdates(identitySnaps, updates) {
  return identitySnaps
    .reduce((acc, curr) => {
      const identity = curr.val();
      const add = compose(
        assocPath(['updates', `groups/${identity.group}/identities/${curr.key}`], null),
        assocPath(['updates', `identities/inactive/${curr.key}`], {
          ...identity,
          createdAt: TIMESTAMP,
          isActive: false,
          user: null,
        }),
        assocPath(['updates', `identities/active/${curr.key}`], null),
        assocPath(['groupNicknames', identity.group], identity.nickname),
      );

      return add(acc);
    }, updates);
}

function getCompensationUpdates(compsSnap, identityIds, updates) {
  return Object.values(compsSnap.val())
    .filter(([_, comp]) => identityIds.includes(comp.debtor) || identityIds.includes(comp.creditor))
    .reduce((acc, [key, comp]) => {
      const add = compose(
        assocPath(['updates', `compensations/paid/${key}`], {
          ...comp,
          isPaid: true,
          createdAt: TIMESTAMP,
        }),
        assocPath(['updates', `compensations/unpaid/${key}`], null),
      );

      return add(acc);
    }, updates);
}

async function sendPushUserDeleted(groupNicknames) {
  // TODO: once we allow different nicknames for each group, send push for every group with respective nickname
  const nickname = groupNicknames[Object.keys(groupNicknames)[0]];
  return Rx.Observable.from(Object.keys(groupNicknames))
    .mergeMap(groupId => db.ref('groups').child(groupId).once('value'))
    .map(snap => snap.val())
    .filter(group => group)
    .mergeMap(group => Rx.Observable.from(Object.keys(group.identities)))
    .toArray()
    .mergeMap(identityIds => getUserTokens(identityIds))
    .mergeMap((userTokens) => {
      const data = {
        type: 'USER_DELETED',
        nickname,
      };

      const notification = {
        title_loc_key: 'push_user_deleted_title',
        title_loc_args: [nickname],
        body_loc_key: 'push_user_deleted_alert',
      };

      return sendPush(userTokens, data, notification);
    })
    .toPromise();
}
