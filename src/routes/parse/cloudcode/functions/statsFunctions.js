/**
 * Created by fabio on 09.05.16.
 */

import {calculateSpendingStats, calculateStoreOrCurrencyStats} from '../stats'

export function statsSpending(request, response) {
    const groupId = request.params.groupId;
    const year = request.params.year;
    const month = request.params.month;

    calculateSpendingStats(groupId, year, month)
        .then(result => response.success(JSON.stringify(result)))
        .catch(err => response.error('Failed with error: ' + err.message));
}

export function statsStores(request, response) {
    const groupId = request.params.groupId;
    const year = request.params.year;
    const month = request.params.month;
    const statsType = 'store';

    calculateStoreOrCurrencyStats(statsType, groupId, year, month)
        .then(result => response.success(JSON.stringify(result)))
        .catch(err => response.error('Failed with error: ' + err.message));
}

export function statsCurrencies(request, response) {
    const groupId = request.params.groupId;
    const year = request.params.year;
    const month = request.params.month;
    const statsType = 'currency';

    calculateStoreOrCurrencyStats(statsType, groupId, year, month)
        .then(result => response.success(JSON.stringify(result)))
        .catch(err => response.error('Failed with error: ' + err.message));
}

