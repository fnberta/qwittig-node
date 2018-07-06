import { db } from './main';
import calculateCompensations from '../calculations/compensations';

export default async function updateCompensations(groupId) {
  await deleteUnpaidCompensations(groupId);
  const identitiesById = await getIdentitiesByIds(groupId);
  const newComps = calculateCompensations(identitiesById, groupId);
  return saveNewCompensations(newComps);
}

async function deleteUnpaidCompensations(groupId) {
  const compensationsRef = db.ref('compensations').child('unpaid').orderByChild('group').equalTo(groupId);
  const compsSnap = await compensationsRef.once('value');
  if (compsSnap.hasChildren()) {
    const compIds = compsSnap.val();
    await Promise.all(Object.keys(compIds).map(compId =>
      db.ref('compensations').child('unpaid').child(compId).remove()));
  }
}

function getIdentitiesByIds(groupId) {
  const identityRef = db.ref('identities').child('active').orderByChild('group').equalTo(groupId);
  return identityRef.once('value').then(snap => snap.val());
}

function saveNewCompensations(compensations) {
  return Promise.all(compensations.map(comp => db.ref('compensations').child('unpaid').push().set(comp)));
}
