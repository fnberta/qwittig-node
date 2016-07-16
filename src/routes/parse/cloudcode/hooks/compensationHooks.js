/**
 * Created by fabio on 09.05.16.
 */

import {isEqual} from 'lodash';
import {calculateAndSetBalance, calculateCompensations} from '../balance'
import {getUserFromIdentity, formatMoney} from '../utils'

export function beforeSave(request, response) {
    const compensation = request.object;
    if (compensation.isNew()) {
        response.success();
        return;
    }

    checkIdentities(compensation)
        .then(() => response.success())
        .catch(err => response.error('Failed to save compensation with error: ' + err.message));
}

function checkIdentities(compensation) {
    return Parse.Promise.when(compensation.debtor.fetch({useMasterKey: true}), compensation.creditor.fetch({useMasterKey: true}))
        .then((debtor, creditor) => debtor.active == false || creditor.active == false
            ? Parse.Promise.error({'message': "Compensation has inactive identities, can't change it!"})
            : Parse.Promise.as());
}

/**
 * Called after a compensation object was saved.
 *
 * Checks if the compensation already existed before.
 * If yes: If the compensation 'paid', re-calculates the balances of the users and sends a push to the users of the
 * group.
 *
 * If no returns immediately. Will be queried by clients on reception of new purchase etc. push.
 */
export function afterSave(request) {
    const compensation = request.object;
    if (!compensation.existed() || !compensation.paid) {
        return;
    }

    const identities = [compensation.creditor, compensation.debtor];
    return calculateAndSetBalance(compensation.group, identities)
        .then(() => {
            const origComp = request.original;
            if (isEqual(compensation.amount, origComp.amount)) {
                return sendPush(compensation, false)
            }

            return calculateCompensations(compensation.group)
                .then(() => sendPush(compensation, true));
        });
}

function sendPush(compensation, didCalcNew) {
    return Parse.Promise.when(compensation.creditor.fetch({useMasterKey: true}),
        compensation.group.fetch({useMasterKey: true}), getUserFromIdentity(compensation.debtor))
        .then((creditor, group, debtorUser) => {
            const promises = [];

            const debtorQuery = new Parse.Query(Parse.Installation);
            debtorQuery.equalTo('channels', group.id);
            debtorQuery.equalTo('user', debtorUser);
            promises.push(Parse.Push.send({
                where: debtorQuery,
                data: {
                    type: "compensationExistingPaid",
                    "content-available": 1,
                    sound: "default",
                    alert: {
                        "loc-key": "locKey.compensationSetPaid",
                        "loc-args": [creditor.nickname, formatMoney(compensation.amount, compensation.group.currency)]
                    },
                    compensationId: compensation.id,
                    user: creditor.nickname,
                    debtorId: compensation.debtor.id,
                    creditorId: creditor.id,
                    groupId: group.id,
                    currencyCode: compensation.group.currency,
                    amount: compensation.amount,
                    didCalcNew: didCalcNew
                }
            }, {useMasterKey: true}));

            const groupQuery = new Parse.Query(Parse.Installation);
            groupQuery.equalTo('channels', group.id);
            groupQuery.notEqualTo('user', debtorUser);
            promises.push(Parse.Push.send({
                where: groupQuery,
                data: {
                    type: "compensationExistingPaid",
                    "content-available": 1,
                    compensationId: compensation.id,
                    user: creditor.nickname,
                    debtorId: compensation.debtor.id,
                    creditorId: creditor.id,
                    groupId: group.id,
                    currencyCode: compensation.group.currency,
                    amount: compensation.amount,
                    didCalcNew: didCalcNew
                }
            }, {useMasterKey: true}));
            
            return Parse.Promise.when(promises);
        })
}