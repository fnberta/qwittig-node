/**
 * Created by fabio on 25.07.16.
 */

import express from 'express';
import bodyParser from 'body-parser';
import { includes, isEmpty } from 'lodash';
import { db, TIMESTAMP, sendPush, validateIdToken } from '../firebase/main';

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
    .catch((err) => next(err));
});

async function handleUserDataDeletion(idToken) {
  const userId = await validateIdToken(idToken);
  const groupNicknames = await deleteUserData(userId);
  await sendPushUserDeleted(groupNicknames);
}

async function deleteUserData(userId) {
  const user = (await db.ref('users').child(userId).once('value')).val();
  const identityIds = Object.keys(user.identities);
  const updates = {};
  const groupNicknames = {};

  // handle identities
  const identitySnaps = await Promise.all(identityIds.map(((identityId) =>
    db.ref('identities').child('active').child(identityId).once('value'))));
  for (const snap of identitySnaps) {
    const identity = snap.val();
    groupNicknames[identity.group] = identity.nickname;

    identity.createdAt = TIMESTAMP;
    identity.active = false;
    identity.user = null;
    updates[`identities/active/${snap.key}`] = null;
    updates[`identities/inactive/${snap.key}`] = identity;
    updates[`groups/${identity.group}/identities/${snap.key}`] = null;
  }

  // handle compensations
  const compsSnap = await db.ref('compensations').child('unpaid').once('value');
  compsSnap.forEach((child) => {
    const comp = child.val();
    if (includes(identityIds, comp.debtor) || includes(identityIds, comp.creditor)) {
      comp.paid = true;
      comp.createdAt = TIMESTAMP;
      updates[`compensations/unpaid/${child.key}`] = null;
      updates[`compensations/paid/${child.key}`] = comp;
    }
  });

  // delete user
  updates[`users/${userId}`] = null;

  // perform operations atomically
  await db.ref().update(updates);

  // return groupIds and nicknames to send push
  return groupNicknames;
}

async function sendPushUserDeleted(groupNicknames) {
  // TODO: once we allow different nicknames for each group, send push for every group with respective nickname
  const nickname = groupNicknames[Object.keys(groupNicknames)[0]];
  const groups = await Promise.all(Object.keys(groupNicknames).map((groupId) =>
    db.ref('groups').child(groupId).once('value')
      .then((snap) => snap.val())
  ));

  // filter deleted groups
  const groupsFiltered = groups.filter((group) => group !== null);
  if (isEmpty(groupsFiltered)) {
    // all groups are deleted, return immediately
    return;
  }

  const identityIds = groupsFiltered.map((group) => Object.keys(group.identities));
  const userTokens = [];
  for (const identityId of identityIds) {
    const identity = (await db.ref('identities').child('active').child(identityId).once('value')).val();
    if (identity.user) {
      const user = (await db.ref('users').child(identity.user).once('value')).val();
      userTokens.push(...Object.keys(user.tokens));
    }
  }

  const data = {
    type: 'USER_DELETED',
    nickname,
  };

  const notification = {
    title_loc_key: 'push_user_deleted_title',
    title_loc_args: [nickname],
    body_loc_key: 'push_user_deleted_alert',
  };

  await sendPush(userTokens, data, notification);
}
