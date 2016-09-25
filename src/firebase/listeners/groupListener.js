/**
 * Created by fabio on 25.07.16.
 */

import { db } from '../main';

export default function groupListener() {
  const ref = db.ref('groups');
  ref.on('child_changed', (snapshot) => {
    onGroupChanged(snapshot);
  });
  ref.on('child_removed', (snapshot) => {
    onGroupRemoved(snapshot);
  });
}

async function onGroupChanged(snapshot) {
  const group = snapshot.val();
  if (!group.identities) {
    try {
      await db.ref('groups').child(snapshot.key).remove();
    } catch (e) {
      console.error('Failed to delete group on empty identities with error:', e);
    }
  }
}

async function onGroupRemoved(snapshot) {
  try {
    await deleteAllPurchases(snapshot.key);
    await deleteUnpaidCompensations(snapshot.key);
    await deletePaidCompensations(snapshot.key);
  } catch (e) {
    console.error("Failed to delete group's purchase and compensations with error:", e);
  }
}

async function deleteAllPurchases(groupId) {
  const ref = db.ref('purchases').orderByChild('group').equalTo(groupId);
  const purchasesSnap = await ref.once('value');
  if (purchasesSnap.hasChildren()) {
    const purchaseIds = purchasesSnap.val();
    await Promise.all(Object.keys(purchaseIds).map(purchaseId => db.ref('purchases').child(purchaseId).remove()));
  }
}

async function deleteUnpaidCompensations(groupId) {
  const unpaidRef = db.ref('compensations').child('unpaid').orderByChild('group').equalTo(groupId);
  const unpaidSnap = await unpaidRef.once('value');
  if (unpaidSnap.hasChildren()) {
    const unpaidCompIds = unpaidSnap.val();
    await Promise.all(Object.keys(unpaidCompIds).map(compId =>
      db.ref('compensations').child('unpaid').child(compId).remove()
    ));
  }
}

async function deletePaidCompensations(groupId) {
  const paidRef = db.ref('compensations').child('paid').orderByChild('group').equalTo(groupId);
  const paidSnap = await paidRef.once('value');
  if (paidSnap.hasChildren()) {
    const paidCompIds = paidSnap.val();
    await Promise.all(Object.keys(paidCompIds).map(compId =>
      db.ref('compensations').child('paid').child(compId).remove()));
  }
}
