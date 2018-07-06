import { db } from './main';
import calculateBalances from '../calculations/balances';

/**
 * Returns a promise for the calculation and setting of the balances of the users involved.
 *
 * @param groupId the id of the group for which the balances should be calculated
 * @param identityIds the ids of the identities to calculate the balances for
 * @returns {Promise} when the calculation finished and balances are set
 */
export default async function updateBalances(groupId, identityIds) {
  const purchasesRef = db.ref('purchases').orderByChild('group').equalTo(groupId);
  const compensationsRef = db.ref('compensations').child('paid').orderByChild('group').equalTo(groupId);

  const [purchasesSnap, compsSnap] = await Promise.all([purchasesRef.once('value'), compensationsRef.once('value')]);
  const balances = calculateBalances(Object.values(purchasesSnap.val()), Object.values(compsSnap.val()), identityIds);
  return Promise.all(balances.map(balance => setBalance(balance.balance, balance.identityId)))
}

function setBalance(balance, identityId) {
  const identityRef = db.ref('identities').child('active').child(identityId).child('balance');
  return identityRef.update({
    num: balance.n * balance.s,
    den: balance.d,
  });
}
