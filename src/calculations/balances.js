import { isEmpty } from 'ramda';

const Fraction = require('fraction.js');

export default function calculateBalances(purchases, compensations, identityIds) {
  return identityIds.map((identityId) => {
    const balanceComps = compensations
      .reduce((acc, curr) => acc.add(calculateBalanceCompensations(curr, identityId)), new Fraction(0));
    const balancePurchases = purchases
      .reduce((acc, curr) => acc.add(calculateBalancePurchases(curr, identityId)), new Fraction(0));

    return {
      identityId,
      balance: balanceComps.add(balancePurchases),
    };
  });
}

function calculateBalanceCompensations(compensation, identityId) {
  const balance = new Fraction(0);
  const amount = new Fraction(compensation.amount.num, compensation.amount.den);
  if (compensation.debtor === identityId) {
    return balance.add(amount);
  } else if (compensation.creditor === identityId) {
    return balance.sub(amount);
  }

  return balance;
}

function calculateBalancePurchases(purchase, identityId) {
  return purchase.articles
    .filter(article => !isEmpty(article.identities))
    .reduce((acc, curr) => {
      const price = new Fraction(curr.price);
      if (purchase.buyer === identityId) {
        return curr.identities[identityId]
          ? acc.add(price.sub(price.div(Object.keys(curr.identities).length)))
          : acc.add(price);
      } else if (curr.identities[identityId]) {
        return acc.sub(price.div(Object.keys(curr.identities).length));
      }

      return acc;
    }, new Fraction(0));
}
