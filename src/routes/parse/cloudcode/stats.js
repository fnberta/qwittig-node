/**
 * Created by fabio on 09.05.16.
 */

import Purchase from './entities/Purchase';
import Identity from './entities/Identity';
import {size} from 'lodash';
import {getGroupPointerFromId} from './utils'

/**
 * Calculates the spending stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
export function calculateSpendingStats(groupId, year, month) {
    const group = getGroupPointerFromId(groupId);

    // create query for Purchases
    const purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo('group', group);
    const firstOfMonthInYear = getFirstOfMonthInYear(year, month);
    purchaseQuery.greaterThanOrEqualTo('date', firstOfMonthInYear);
    purchaseQuery.lessThanOrEqualTo('date', getLastOfMonthInYear(year, month));

    // create query for Identities
    const identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo('group', group);
    identityQuery.equalTo('active', true);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then((purchases, identities) => {
            const results = {};

            let numberOfUnits = 0;
            let purchasesAll;
            if (month != null) {
                numberOfUnits = getDaysInMonth(firstOfMonthInYear);
                purchasesAll = sortPurchasesByDay(purchases, numberOfUnits);
            } else {
                numberOfUnits = 12;
                purchasesAll = sortPurchasesByMonth(purchases);
            }

            results.numberOfUnits = numberOfUnits;
            results.members = calculateStatsForIdentities(purchasesAll, identities);
            results.group = calculateStatsForGroup(purchasesAll, group);

            return results;
        });
}

function getFirstOfMonthInYear(year, month) {
    return month != null ? new Date(year, month, 1) : new Date(year, 0, 1);
}

function getLastOfMonthInYear(year, month) {
    return month != null ? new Date(year, month, 31, 23, 59, 59) : new Date(year, 11, 31, 23, 59, 59);
}

function getDaysInMonth(anyDateInMonth) {
    const date = new Date(anyDateInMonth.getYear(), anyDateInMonth.getMonth() + 1, 0);
    return date.getDate();
}

function sortPurchasesByDay(purchases, daysInMonth) {
    const purchasesMonth = {};

    for (let i = 0; i < daysInMonth; i++) {
        purchasesMonth[i] = [];
    }

    for (let purchase of purchases) {
        const createdAt = purchase.date;
        const day = createdAt.getDate() - 1; // use 0 based numbering as with months
        purchasesMonth[day].push(purchase);
    }

    return purchasesMonth;
}

function sortPurchasesByMonth(purchases) {
    const purchasesYear = {};
    
    for (let i = 0; i < 12; i++) {
        purchasesYear[i] = [];
    }

    for (let purchase of purchases) {
        const createdAt = purchase.date;
        const month = createdAt.getMonth();
        purchasesYear[month].push(purchase);
    }

    return purchasesYear;
}

function calculateStatsForGroup(purchasesByType, groupToCalculate) {
    const group = {};
    group.groupId = groupToCalculate.id;
    group.units = [];

    for (let type in purchasesByType) {
        if (purchasesByType.hasOwnProperty(type)) {
            const unit = {};
            unit.identifier = type;

            let totalPrice = 0;
            for (let purchase of purchasesByType[type]) {
                totalPrice += purchase.totalPrice;
            }
            unit.total = totalPrice;

            const numberOfPurchases = size(purchasesByType[type]);
            unit.average = getAveragePrice(numberOfPurchases, totalPrice);

            group.units.push(unit);
        }
    }

    return group;
}

function calculateStatsForIdentities(purchasesByType, identities) {
    const members = [];

    for (let identity of identities) {
        const member = {};
        member.nickname = identity.nickname;
        member.units = [];

        for (let type in purchasesByType) {
            if (purchasesByType.hasOwnProperty(type)) {
                const unit = {};
                unit.identifier = type;

                let totalPrice = 0;
                for (let purchase of purchasesByType[type]) {
                    const buyer = purchase.buyer;
                    if (buyer.id == identity.id) {
                        totalPrice += purchase.totalPrice;
                    }
                }
                unit.total = totalPrice;

                const numberOfPurchases = size(purchasesByType[type]);
                unit.average = getAveragePrice(numberOfPurchases, totalPrice);

                member.units.push(unit);
            }
        }

        members.push(member);
    }

    return members;
}

function getAveragePrice(numberOfPurchases, totalPrice) {
    let averagePrice = 0;
    if (numberOfPurchases > 0) {
        averagePrice = totalPrice / numberOfPurchases;
    }
    return averagePrice;
}

/**
 * Calculates the store or currency stats and returns them as a JSON string.
 *
 * @param statsType the stats type, currency, or store
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
export function calculateStoreOrCurrencyStats(statsType, groupId, year, month) {
    const group = getGroupPointerFromId(groupId);

    // create query for Purchases
    const purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.limit(1000);
    purchaseQuery.equalTo('group', group);
    purchaseQuery.greaterThanOrEqualTo('date', getFirstOfMonthInYear(year, month));
    purchaseQuery.lessThanOrEqualTo('date', getLastOfMonthInYear(year, month));

    // create query for Identities
    const identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo('group', group);
    identityQuery.equalTo('active', true);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then((purchases, identities) => {
            const results = {};

            const purchasesByType = sortPurchasesByType(purchases, statsType);
            results.numberOfUnits = size(purchasesByType);
            results.group = calculateStatsForGroup(purchasesByType, group);
            results.members = calculateStatsForIdentities(purchasesByType, identities);

            return results;
        });
}

function sortPurchasesByType(purchases, statsType) {
    const purchasesTypes = {};

    for (let purchase of purchases) {
        const type = purchase.get(statsType);
        if (purchasesTypes[type] == null) {
            purchasesTypes[type] = [];
        }
        purchasesTypes[type].push(purchase);
    }

    return purchasesTypes;
}