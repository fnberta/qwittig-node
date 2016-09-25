/**
 * Created by fabio on 25.07.16.
 */

import Queue from 'firebase-queue';
import { db, sendPush } from '../main';
import { formatMoney } from '../../utils';

export default function pushQueue() {
  const ref = db.ref('queue/push');
  const queue = new Queue(ref, (data, progress, resolve, reject) => {
    switch (data.type) {
      case 'COMPENSATION_REMIND_DEBTOR': {
        sendCompensationRemindPush(data.compensationId)
          .then(() => resolve())
          .catch((err) => reject(err));
        break;
      }
      case 'ASSIGNMENT_REMIND': {
        sendAssignmentRemindPush(data.assignmentId)
          .then(() => resolve())
          .catch((err) => reject(err));
        break;
      }
      case 'GROUP_JOINED': {
        sendGroupJoinedPush(data.groupId, data.identityId)
          .then(() => resolve())
          .catch((err) => reject(err));
        break;
      }
      default:
        reject(new Error('unknown type'));
    }
  });
}

async function sendCompensationRemindPush(compensationId) {
  const comp = (await db.ref('compensations').child('unpaid').child(compensationId).once('value')).val();
  const [debtor, creditor] = await Promise.all([
    db.ref('identities').child('active').child(comp.debtor).once('value')
      .then((snap) => snap.val()),
    db.ref('identities').child('active').child(comp.creditor).once('value')
      .then((snap) => snap.val()),
  ]);
  if (debtor.user) {
    const user = (await db.ref('users').child(debtor.user).once('value')).val();
    const notification = {
      click_action: 'OPEN_FINANCE',
      title_loc_key: 'push_compensation_remind_title',
      body_loc_key: 'push_compensation_remind_alert',
      body_loc_args: [creditor.nickname, formatMoney(comp.amount.num / comp.amount.den, creditor.groupCurrency)],
    };

    const data = {
      type: 'REMIND_COMPENSATION',
      nickname: creditor.nickname,
      amount: comp.amount.num / comp.amount.den,
      currency: creditor.groupCurrency,
    };

    if (user.tokens) {
      await sendPush(Object.keys(user.tokens), data, notification);
    }
  }
}

async function sendAssignmentRemindPush(assignmentId) {
  const assignment = (await db.ref('assignments').child(assignmentId).once('value')).val();
  const identityIds = Object.keys(assignment.identities);

  let identityIdRes;
  for (const identityId of identityIds) {
    if (assignment.identities[identityId] === 0) {
      identityIdRes = identityId;
      break;
    }
  }

  if (identityIdRes) {
    const identityRes = (await db.ref('identities').child('active').child(identityIdRes).once('value')).val();
    if (identityRes.user) {
      const user = (await db.ref('users').child(identityRes.user).once('value')).val();
      const notification = {
        click_action: 'OPEN_ASSIGNMENT_DETAILS',
        title_loc_key: 'push_assignment_remind_title',
        body_loc_key: 'push_assignment_remind_alert',
      };

      const data = {
        type: 'REMIND_ASSIGNMENT',
        assignmentId,
      };

      if (user.tokens) {
        await sendPush(Object.keys(user.tokens), data, notification);
      }
    }
  }
}

async function sendGroupJoinedPush(groupId, joiningIdentityId) {
  const group = (await db.ref('groups').child(groupId).once('value')).val();
  const identityIds = Object.keys(group.identities);
  const userTokens = [];
  for (const identityId of identityIds) {
    if (identityId !== joiningIdentityId) {
      const identity = (await db.ref('identities').child('active').child(identityId).once('value')).val();
      if (identity.user) {
        const user = (await db.ref('users').child(identity.user).once('value')).val();
        userTokens.push(...Object.keys(user.tokens));
      }
    }
  }

  const joiningIdentity = (await db.ref('identities').child('active').child(joiningIdentityId).once('value')).val();
  const data = {
    type: 'GROUP_JOINED',
    nickname: joiningIdentity.nickname,
    groupName: group.name,
  };
  const notification = {
    title_loc_key: 'push_user_joined_title',
    title_loc_args: [group.name],
    body_loc_key: 'push_user_joined_alert',
    body_loc_args: [joiningIdentity.nickname],
  };

  await sendPush(userTokens, data, notification);
}
