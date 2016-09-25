/**
 * Created by fabio on 08.05.16.
 */

import { isEmpty } from 'lodash';
import { db } from './main';

const Fraction = require('fraction.js');

/**
 * Returns a promise for the calculation and setting of the balances of the users involved.
 *
 * @param groupId the id of the group for which the balances should be calculated
 * @param identityIds the ids of the identities to calculate the balances for
 * @returns {Promise} when the calculation finished and balances are set
 */
export default async function calculateAndSetBalances(groupId, identityIds) {
  const purchasesRef = db.ref('purchases').orderByChild('group').equalTo(groupId);
  const compensationsRef = db.ref('compensations').child('paid').orderByChild('group').equalTo(groupId);

  const [purchasesSnap, compsSnap] = await Promise.all([purchasesRef.once('value'), compensationsRef.once('value')]);
  await calculateBalances(purchasesSnap, compsSnap, identityIds);
}

function calculateBalances(purchasesSnap, compsSnap, identityIds) {
  return Promise.all(identityIds.map((identityId) => {
    let balance = new Fraction(0);

    compsSnap.forEach((child) => {
      const comp = child.val();
      balance = balance.add(calculateBalanceCompensations(comp, identityId));
    });

    purchasesSnap.forEach((child) => {
      const purchase = child.val();
      balance = balance.add(calculateBalancePurchases(purchase, identityId));
    });

    return setBalance(balance, identityId);
  }));
}

function calculateBalanceCompensations(compensation, identityId) {
  let balance = new Fraction(0);

  const amount = new Fraction(compensation.amount.num, compensation.amount.den);
  if (compensation.debtor === identityId) {
    balance = balance.add(amount);
  } else if (compensation.creditor === identityId) {
    balance = balance.sub(amount);
  }

  return balance;
}

function calculateBalancePurchases(purchase, identityId) {
  let balance = new Fraction(0, 1);

  for (const article of purchase.articles) {
    if (!isEmpty(article.identities)) {
      const price = new Fraction(article.price);
      if (purchase.buyer === identityId) {
        balance = article.identities[identityId]
          ? balance.add(price.sub(price.div(Object.keys(article.identities).length)))
          : balance.add(price);
      } else if (article.identities[identityId]) {
        balance = balance.sub(price.div(Object.keys(article.identities).length));
      }
    }
  }

  return balance;
}

function setBalance(balance, identityId) {
  const identityRef = db.ref('identities').child('active').child(identityId).child('balance');
  return identityRef.update({
    num: balance.n * balance.s,
    den: balance.d,
  });
}
