/**
 * Created by fabio on 25.07.16.
 */

import { db, sendPush, getUserTokens } from '../main';

export default function identityListener() {
  db.ref('identities').child('active').on('child_removed', onActiveIdentityRemoved);
}

async function onActiveIdentityRemoved(snapshot) {
  const identity = snapshot.val();
  try {
    // user will be empty if identity was de-activated due to account deletion or if it was pending, don't send a push
    // in these cases
    if (identity.user) {
      await sendPushGroupLeft(identity);
    }
  } catch (e) {
    console.error('Failed to handle identity with error:', e);
  }
}

async function sendPushGroupLeft(inactiveIdentity) {
  const group = (await db.ref('groups').child(inactiveIdentity.group).once('value')).val();
  if (!group) {
    // group is already deleted, return immediately
    return;
  }

  const userTokens = await getUserTokens(Object.keys(group.identities));
  const data = {
    type: 'GROUP_LEFT',
    nickname: inactiveIdentity.nickname,
    groupName: group.name,
  };

  const notification = {
    title_loc_key: 'push_user_left_group_title',
    title_loc_args: [inactiveIdentity.nickname],
    body_loc_key: 'push_user_left_group_alert',
    body_loc_args: [inactiveIdentity.nickname, group.name],
  };

  await sendPush(userTokens, data, notification);
}
