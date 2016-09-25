/**
 * Created by fabio on 25.07.16.
 */

import { head, last, without, isEmpty } from 'lodash';
import { db, TIMESTAMP } from './main';

const Fraction = require('fraction.js');


export default async function calculateCompensations(groupId) {
  await deleteUnpaidCompensations(groupId);
  const identityIdBalances = await getIdentityIdBalances(groupId);
  const newComps = getNewCompensations(identityIdBalances, groupId);
  await saveNewCompensations(newComps);
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

async function getIdentityIdBalances(groupId) {
  const identityRef = db.ref('identities').child('active').orderByChild('group').equalTo(groupId);
  const identitiesSnap = await identityRef.once('value');
  const identityBalances = [];
  identitiesSnap.forEach((child) => {
    const identity = child.val();
    const balance = new Fraction(identity.balance.num, identity.balance.den);
    identityBalances.push({
      identityId: child.key,
      balance,
    });
  });

  return identityBalances.sort(sortBalances);
}

function sortBalances(a, b) {
  const aFraction = a.balance;
  const bFraction = b.balance;

  return bFraction.compare(aFraction);
}

function getNewCompensations(identityBalances, group) {
  const compensationsNew = [];

  let topBalance = head(identityBalances);
  let bottomBalance = last(identityBalances);
  let topBalanceValue = topBalance.balance;
  let bottomBalanceValue = bottomBalance.balance;

  while (topBalanceValue.compare(0) > 0) {
    let compensation;
    const bottomBalanceValueNeg = new Fraction(bottomBalanceValue).neg();
    if (topBalanceValue.compare(bottomBalanceValueNeg) >= 0) {
      // biggest minus value is smaller than biggest plus value
      topBalanceValue = topBalanceValue.add(bottomBalanceValue);
      topBalance.balance = topBalanceValue;
      compensation = createNewCompensation(group, bottomBalance.identityId, topBalance.identityId, bottomBalanceValueNeg);
      identityBalances = topBalanceValue.equals(0)
        ? without(identityBalances, bottomBalance, topBalance)
        : without(identityBalances, bottomBalance);
    } else {
      // biggest minus value is bigger than biggest plus value, hence can fully compensate it
      bottomBalanceValue = bottomBalanceValue.add(topBalanceValue);
      bottomBalance.balance = bottomBalanceValue;
      compensation = createNewCompensation(group, bottomBalance.identityId, topBalance.identityId, topBalanceValue);
      identityBalances = without(identityBalances, topBalance);
      identityBalances.sort(sortBalances);
    }
    compensationsNew.push(compensation);

    if (!isEmpty(identityBalances)) {
      topBalance = head(identityBalances);
      bottomBalance = last(identityBalances);
      topBalanceValue = topBalance.balance;
      bottomBalanceValue = bottomBalance.balance;
    } else {
      topBalanceValue = new Fraction(0, 1);
      bottomBalanceValue = new Fraction(0, 1);
    }
  }

  return compensationsNew;
}

function createNewCompensation(group, debtorId, creditorId, amount) {
  return {
    createdAt: TIMESTAMP,
    group,
    debtor: debtorId,
    creditor: creditorId,
    paid: false,
    amount: {
      num: amount.n * amount.s,
      den: amount.d,
    },
  };
}

function saveNewCompensations(compensations) {
  return Promise.all(compensations.map(comp => db.ref('compensations').child('unpaid').push().set(comp)));
}
