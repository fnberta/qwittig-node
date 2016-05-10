/**
 * Created by fabio on 08.05.16.
 */

const Fraction = require('fraction.js');
import {includes, head, last, without, isEmpty} from 'lodash';
import {getGroupRoleName} from './utils';
import Purchase from './entities/Purchase';
import Compensation from './entities/Compensation';
import Identity from './entities/Identity';

/**
 * Returns a promise for the calculation and setting of the balances of the users involved.
 *
 * @param group the group for which the balances should be calculated
 * @param identities the users to calculate the balances for
 * @returns {Parse.Promise} when the calculation finished and balances are set
 */
export function calculateAndSetBalance(group, identities) {
    // create query for Purchases
    const purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo('group', group);
    purchaseQuery.include('items');

    // create query for compensations
    const compensationQuery = new Parse.Query(Compensation);
    compensationQuery.equalTo('group', group);
    compensationQuery.equalTo('paid', true);

    // wait for them all to complete
    // result order will match the order passed to when()
    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), compensationQuery.find({useMasterKey: true}))
        .then((purchases, compensations) => calculateBalance(purchases, identities, compensations));
}

function calculateBalance(purchases, identities, compensations) {
    let promise = Parse.Promise.as();

    for (let identity of identities) {
        promise = promise
            .then(() => {
                let balance = new Fraction(0);

                for (let compensation of compensations) {
                    balance = balance.add(calculateBalanceCompensations(compensation, identity));
                }

                for (let purchase of purchases) {
                    balance = balance.add(calculateBalancePurchases(purchase, identity));
                }

                return setBalance(balance, identity);
            });
    }

    return promise;
}

function calculateBalanceCompensations(compensation, identity) {
    let balance = new Fraction(0);

    const debtor = compensation.debtor;
    const creditor = compensation.creditor;
    const amount = compensation.amount;

    if (debtor.id == identity.id) {
        balance = balance.add(amount);
    } else if (creditor.id == identity.id) {
        balance = balance.sub(amount);
    }

    return balance;
}

function calculateBalancePurchases(purchase, identity) {
    let balance = new Fraction(0);
    const buyer = purchase.buyer;
    const items = purchase.items;

    for (let item of items) {
        const identitiesIds = item.getIdentitiesIds();
        if (isEmpty(identitiesIds)) {
            continue
        }

        const price = new Fraction(item.price);
        if (buyer.id == identity.id) {
            balance = includes(identitiesIds, identity.id)
                ? balance.add(price.sub(price.div(identitiesIds.length)))
                : balance.add(price);
        } else if (includes(identitiesIds, identity.id)) {
            balance = balance.sub(price.div(identitiesIds.length));
        }
    }

    return balance;
}

function setBalance(balance, identity) {
    // get numerator and denominator
    const balanceNum = balance.n * balance.s;
    const balanceDen = balance.d;
    identity.balance = [balanceNum, balanceDen];
    return identity.save(null, {useMasterKey: true});
}

export function calculateCompensations(group) {
    return Parse.Promise.when(deleteUnpaidCompensations(group), getIdentityBalances(group))
        .then((deleteResult, identityBalances) => {
            const newComps = getNewCompensations(identityBalances, group);
            return Parse.Object.saveAll(newComps);
        });
}

function deleteUnpaidCompensations(group) {
    const query = new Parse.Query(Compensation);
    query.equalTo('group', group);
    query.equalTo('paid', false);
    return query.find({useMasterKey: true})
        .then(comps => comps.length > 0
            ? Parse.Object.destroyAll(comps, {useMasterKey: true})
            : Parse.Promise.as());
}

function getIdentityBalances(group) {
    const query = new Parse.Query(Identity);
    query.equalTo('group', group);
    return query.find({useMasterKey: true})
        .then(identities => {
            const identityBalances = identities.map(identity => {
                return {identity: identity, balance: identity.balance};
            });

            return identityBalances.sort(sortBalances);
        });
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

    const groupRoleName = getGroupRoleName(group.id);
    const acl = new Parse.ACL();
    acl.setRoleReadAccess(groupRoleName, true);
    acl.setRoleWriteAccess(groupRoleName, true);

    while (topBalanceValue.compare(0) > 0) {
        let compensation;
        const bottomBalanceValueNeg = new Fraction(bottomBalanceValue).neg();
        if (topBalanceValue.compare(bottomBalanceValueNeg) >= 0) {
            // biggest minus value is smaller than biggest plus value
            topBalanceValue = topBalanceValue.add(bottomBalanceValue);
            topBalance.balance = topBalanceValue;
            compensation = createNewCompensation(group, bottomBalance.identity, topBalance.identity, bottomBalanceValueNeg, acl);
            identityBalances = topBalanceValue.equals(0)
                ? without(identityBalances, bottomBalance, topBalance)
                : without(identityBalances, bottomBalance);
        } else {
            // biggest minus value is bigger than biggest plus value, hence can fully compensate it
            bottomBalanceValue = bottomBalanceValue.add(topBalanceValue);
            bottomBalance.balance = bottomBalanceValue;
            compensation = createNewCompensation(group, bottomBalance.identity, topBalance.identity, topBalanceValue, acl);
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
            topBalanceValue = new Fraction(0);
            bottomBalanceValue = new Fraction(0);
        }
    }

    return compensationsNew;
}

function createNewCompensation(group, debtor, creditor, amount, acl) {
    const compensation = new Compensation();
    compensation.group = group;
    compensation.debtor = debtor;
    compensation.creditor = creditor;
    compensation.paid = false;
    const amountNum = amount.n * amount.s;
    const amountDen = amount.d;
    compensation.amount = [amountNum, amountDen];
    compensation.setACL(acl);

    return compensation;
}