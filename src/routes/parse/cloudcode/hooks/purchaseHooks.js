/**
 * Created by fabio on 08.05.16.
 */

import {includes} from 'lodash';
import {calculateAndSetBalance, calculateCompensations} from '../balance';
import {deleteParseFile, getUserFromIdentity} from '../utils'

export function beforeSave(request, response) {
    const purchase = request.object;
    if (purchase.isNew()) {
        response.success();
        return;
    }

    checkIdentities(purchase)
        .then(() => response.success())
        .catch(err => response.error('Failed to save purchase with error: ' + err.message));
}

function checkIdentities(purchase) {
    const promises = purchase.identities.map(identity => {
        return identity.fetch({useMasterKey: true})
            .then(identity => identity.active == false
                ? Parse.Promise.error({'message': "Purchase has inactive identities, can't change it!"})
                : Parse.Promise.as());
    });

    return Parse.Promise.when(promises);
}

/**
 * Called after a purchase object was saved. Re-calculates the users' balances and checks if the purchase already
 * existed before. If yes, sends a silent push to the users of the group that the purchase was edited. If the purchase
 * is new, sends a push to the users of the group that a new purchase was created.
 */
export function afterSave(request) {
    const purchase = request.object;
    const identities = purchase.identities;
    const identitiesIds = purchase.getIdentitiesIds();

    if (!includes(identitiesIds, purchase.buyer.id)) {
        identities.push(purchase.buyer);
        identitiesIds.push(purchase.buyer.id);
    }

    calculateAndSetBalance(purchase.group, identities)
        .then(() => calculateCompensations(purchase.group))
        .then(() => {
            if (!purchase.existed()) {
                return sendPushNewPurchase(purchase, identitiesIds)
            }

            const user = request.user;
            return getUserFromIdentity(purchase.buyer)
                .then(buyerUser => user.id == buyerUser.id
                    ? sendPushPurchaseEdited(purchase, identitiesIds)
                    : sendPushReadByChanged(purchase, user));
        });
}

function sendPushPurchaseEdited(purchase, identitiesIds) {
    return Parse.Promise.when(purchase.buyer.fetch({useMasterKey: true}), purchase.group.fetch({useMasterKey: true}))
        .then((buyer, group) => {
            return Parse.Push.send({
                channels: [group.id],
                data: {
                    type: "purchaseEdit",
                    "content-available": 1,
                    sound: "default",
                    alert: {
                        "loc-key": "locKey.purchaseEdit",
                        "loc-args": [buyer.nickname]
                    },
                    currencyCode: group.currency,
                    purchaseId: purchase.id,
                    groupId: group.id,
                    buyerId: buyer.id,
                    groupName: group.name,
                    identitiesIds: identitiesIds,
                    user: buyer.nickname,
                    store: purchase.store
                }
            }, {useMasterKey: true});
        });
}

function sendPushNewPurchase(purchase, identitiesIds) {
    let totalPrice = purchase.totalPrice;
    if (totalPrice == null) {
        totalPrice = 0;
    }

    return Parse.Promise.when(purchase.buyer.fetch({useMasterKey: true}), purchase.group.fetch({useMasterKey: true}))
        .then((buyer, group) => {
            return Parse.Push.send({
                channels: [group.id],
                data: {
                    type: "purchaseNew",
                    "content-available": 1,
                    sound: "default",
                    alert: {
                        "loc-key": "locKey.purchaseNew",
                        "loc-args": [buyer.nickname, totalPrice, purchase.store]
                    },
                    currencyCode: group.currency,
                    purchaseId: purchase.id,
                    groupId: group.id,
                    buyerId: buyer.id,
                    groupName: group.name,
                    identitiesIds: identitiesIds,
                    user: buyer.nickname,
                    store: purchase.store,
                    amount: totalPrice
                }
            }, {useMasterKey: true});
        });
}

function sendPushReadByChanged(purchase, user) {
    const pushQuery = new Parse.Query(Parse.Installation);
    pushQuery.equalTo('user', user);

    return Parse.Push.send({
        where: pushQuery,
        data: {
            type: "purchaseReadByChanged",
            "content-available": 1,
            purchaseId: purchase.id
        }
    }, {useMasterKey: true});
}

/**
 * Called before a purchase object is deleted. Checks if a ParseFile is associated with the purchase and deletes it.
 * Then deletes all the items of the purchase.
 */
export function beforeDelete(request, response) {
    const purchase = request.object;

    deleteFile(purchase.receipt)
        .then(() => Parse.Object.destroyAll(purchase.items, {useMasterKey: true}))
        .then(() => response.success('Successfully deleted items and ParseFile'))
        .catch(err => response.error('Failed to delete items and ParseFile with error: ' + err.message));
}

function deleteFile(receipt) {
    return receipt != null ? deleteParseFile(receipt.name()) : Parse.Promise.as();
}

/**
 * Called after a purchase object was saved. Adds the buyer to the users if he/ was not already included.
 * This happens when the buyer makes a purchase where non of the items affect him. Re-calculates the users'
 * balances and compensations and sends a push to the users of the group that the purchase was deleted.
 */
export function afterDelete(request) {
    const purchase = request.object;
    const identities = purchase.identities;
    const identitiesIds = purchase.getIdentitiesIds();

    if (!includes(identitiesIds, purchase.buyer.id)) {
        identities.push(purchase.buyer);
        identitiesIds.push(purchase.buyer.id);
    }

    calculateAndSetBalance(purchase.group, identities)
        .then(() => calculateCompensations(purchase.group))
        .then(() => sendPushPurchaseDeleted(purchase, identitiesIds));
}

function sendPushPurchaseDeleted(purchase, identitiesIds) {
    return Parse.Push.send({
        channels: [purchase.group.id],
        data: {
            type: "purchaseDelete",
            "content-available": 1,
            sound: "default",
            purchaseId: purchase.id,
            groupId: purchase.group.id,
            identitiesIds: identitiesIds
        }
    }, {useMasterKey: true});
}