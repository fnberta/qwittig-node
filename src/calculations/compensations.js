import {
  adjust,
  assoc,
  compose,
  converge,
  dec,
  head,
  identity,
  init,
  isEmpty,
  last,
  length,
  sort,
  tail,
  without,
} from 'ramda';
import { TIMESTAMP } from '../firebase/main';

const Fraction = require('fraction.js');

export default function calculateCompensations(identitiesById, groupId) {
  const identityBalances = getIdentityIdBalances(identitiesById);
  return getNewCompensations(identityBalances, groupId);
}

function getIdentityIdBalances(identitiesById) {
  return Object.entries(identitiesById)
    .map(([key, identity]) => ({
      identityId: key,
      balance: new Fraction(identity.balance.num, identity.balance.den),
    }))
    .sort(sortBalances);
}

function sortBalances(a, b) {
  return b.balance.compare(a.balance);
}

function getNewCompensations(identityBalances, groupId, compensations = []) {
  if (isEmpty(identityBalances)) {
    return compensations;
  }

  const top = head(identityBalances);
  const bottom = last(identityBalances);
  const { amount, adj } = getAmountAdj(top, bottom);
  const compensation = makeCompensation(groupId, bottom.identityId, top.identityId, amount);
  return getNewCompensations(adj(identityBalances), groupId, compensations.concat(compensation));
}

function getAmountAdj(top, bottom) {
  const bottomBalanceNeg = new Fraction(bottom.balance).neg();
  if (top.balance.compare(bottomBalanceNeg) > 0) {
    return {
      amount: bottomBalanceNeg,
      adj: compose(
        init,
        adjust(assoc('balance', top.balance.add(bottom.balance)), 0),
      ),
    };
  }

  if (top.balance.compare(bottomBalanceNeg) < 0) {
    return {
      amount: top.balance,
      adj: compose(
        sort(sortBalances),
        tail,
        converge(
          adjust(assoc('balance', bottom.balance.add(top.balance))),
          [compose(dec, length), identity],
        ),
      ),
    };
  }

  return {
    amount: top.balance,
    adj: without([top, bottom]),
  };
}

function makeCompensation(groupId, debtorId, creditorId, amount) {
  return {
    createdAt: TIMESTAMP,
    group: groupId,
    debtor: debtorId,
    creditor: creditorId,
    paid: false,
    amount: {
      num: amount.n * amount.s,
      den: amount.d,
    },
  };
}