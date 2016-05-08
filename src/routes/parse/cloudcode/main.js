/**
 * Created by fabio on 02.03.16.
 */

const Fraction = require('fraction.js');
import {includes, isEmpty, isEqual, difference, head, last, without, size} from 'lodash';
import Identity from './entities/Identity';
import Group from './entities/Group';
import Purchase from './entities/Purchase';
import Item from './entities/Item';
import Compensation from './entities/Compensation';
import Task from './entities/Task';
import TaskHistoryEvent from './entities/TaskHistoryEvent';
import User from './entities/User';

Parse.Object.registerSubclass('Identity', Identity);
Parse.Object.registerSubclass('Group', Group);
Parse.Object.registerSubclass('Purchase', Purchase);
Parse.Object.registerSubclass('Item', Item);
Parse.Object.registerSubclass('Compensation', Compensation);
Parse.Object.registerSubclass('Task', Task);
Parse.Object.registerSubclass('TaskHistoryEvent', TaskHistoryEvent);

Parse.Cloud.afterSave(Parse.User, function (request) {
    var user = request.object;
    if (user.existed()) {
        checkArchivedIdentities(user, request.original);
    } else {
        setAcl(user)
    }

    function checkArchivedIdentities(user, oldUser) {
        var archivedIdentities = user.get('archivedIdentities');
        if (archivedIdentities.length == 0) {
            return;
        }

        var oldArchived = oldUser.get('archivedIdentities');
        if (oldArchived == null) {
            oldArchived = []
        }
        if (archivedIdentities.length > oldArchived.length) {
            var newArchivedIds = archivedIdentities.map(identity => identity.id);
            var oldArchivedIds = oldArchived.map(identity => identity.id);
            var newlyArchivedIds = difference(newArchivedIds, oldArchivedIds);
            for (let identityId of newlyArchivedIds) {
                var identity = getIdentityPointerFromId(identityId);
                identity.fetch({useMasterKey: true})
                    .then(identity => {
                        return sendPushUserLeftGroup(identity.group, identity.nickname)
                            .then(() => identity.group.destroy({useMasterKey: true}));
                        // group beforeDelete handler will make sure that group only gets deleted if it contains no
                        // active identities
                    });
            }
        }
    }

    function sendPushUserLeftGroup(group, nickname) {
        return group.fetch({useMasterKey: true})
            .then(group => {
                return Parse.Push.send({
                    channels: [group.id],
                    data: {
                        type: "userLeft",
                        "content-available": 1,
                        sound: "default",
                        alert: {
                            "loc-key": "locKey.userLeft",
                            "loc-args": [nickname, group.name]
                        },
                        groupId: group.id,
                        user: nickname,
                        groupName: group.name
                    }
                }, {useMasterKey: true});
            });
    }

    function setAcl(user) {
        // read/write only for the user himself
        var acl = new Parse.ACL(user);
        acl.setPublicReadAccess(false);
        user.setACL(acl);
        user.save(null, {useMasterKey: true});
    }
});

Parse.Cloud.beforeDelete(Parse.User, function (request, response) {
    var user = request.object;

    handleUser(user)
        .then(
            () => response.success('Successfully settled compensations and disabled identities'),
            error => response.error('Failed to settle compensations and disable identities with error: ' + error.message));

    function handleUser(user) {
        var identities = user.get('identities');
        if (identities == null || isEmpty(identities)) {
            return Parse.Promise.as();
        }

        return getCompensations(identities)
            .then(compensations => isEmpty(compensations) ? Parse.Promise.as() : settleCompensations(compensations))
            .then(() => deactivateIdentities(identities));
    }

    function getCompensations(identities) {
        var debtorQuery = new Parse.Query(Compensation);
        debtorQuery.containedIn('debtor', identities);

        var creditorQuery = new Parse.Query(Compensation);
        creditorQuery.containedIn('creditor', identities);

        var mainQuery = Parse.Query.or(debtorQuery, creditorQuery);
        mainQuery.equalTo('paid', false);
        return mainQuery.find({useMasterKey: true});
    }

    function settleCompensations(compensations) {
        for (let comp of compensations) {
            comp.paid = true;
        }

        return Parse.Object.saveAll(compensations, {useMasterKey: true});
    }

    function deactivateIdentities(identities) {
        for (let identity of identities) {
            identity.active = false;
        }

        return Parse.Object.saveAll(identities, {useMasterKey: true});
    }
});

Parse.Cloud.afterDelete(Parse.User, function (request) {
    var user = request.object;
    var identities = user.get('identities');
    for (let identity of identities) {
        identity.fetch({useMasterKey: true})
            .then(identity => {
                identity.active = false;
                return sendPushUserDeleted(identity.nickname, identity.group)
                    .then(() => identity.group.destroy({useMasterKey: true}));
                // group beforeDelete handler will make sure that group only gets deleted if it contains no
                // active identities
            });
    }

    function sendPushUserDeleted(nickname, group) {
        return Parse.Push.send({
            channels: [group.id],
            data: {
                type: "userDeleted",
                "content-available": 1,
                sound: "default",
                alert: {
                    "loc-key": "locKey.userDeleted",
                    "loc-args": [nickname]
                },
                groupId: group.id,
                user: nickname
            }
        }, {useMasterKey: true});
    }
});

Parse.Cloud.beforeSave('Identity', function (request, response) {
    var identity = request.object;
    if (identity.isNew()) {
        response.success();
        return;
    }

    checkFields(identity)
        .then(
            () => response.success(),
            error => response.error('failed to save identity with error ' + error.message));

    function checkFields(identity) {
        var promises = [Parse.Promise.as()];

        if (identity.dirty('avatar')) {
            promises.push(handleAvatar());
        }

        if (identity.dirty('active')) {
            if (!identity.active && !identity.pending) {
                promises.push(handleIdentityInactive(identity));
            }
        }

        if (identity.dirty('pending')) {
            if (!identity.pending) {
                promises.push(sendPushUserJoinedGroup(identity));
            }
        }

        return Parse.Promise.when(promises);
    }

    function handleAvatar() {
        var oldIdentity = request.original;
        var file = oldIdentity.avatar;
        return file != null ? deleteParseFile(file.name()) : Parse.Promise.as();
    }

    function handleIdentityInactive(identity) {
        return getUserFromIdentity(identity)
            .then(user => removeUserFromGroupRole(user, identity.group.id));
    }

    function removeUserFromGroupRole(user, groupId) {
        return getGroupRole(groupId)
            .then(groupRole => {
                if (groupRole != null) {
                    groupRole.getUsers().remove(user);
                    return groupRole.save(null, {useMasterKey: true});
                }

                return Parse.Promise.as();
            });
    }

    function sendPushUserJoinedGroup(identity) {
        return Parse.Promise.when(getUserFromIdentity(identity), identity.group.fetch({useMasterKey: true}))
            .then((user, group) => {
                var pushQuery = new Parse.Query(Parse.Installation);
                pushQuery.equalTo('channels', group.id);
                pushQuery.notEqualTo('user', user);

                return Parse.Push.send({
                    where: pushQuery,
                    data: {
                        type: "userJoined",
                        "content-available": 1,
                        sound: "default",
                        alert: {
                            "loc-key": "locKey.userJoined",
                            "loc-args": [identity.nickname, group.name]
                        },
                        groupId: group.id,
                        user: identity.nickname,
                        groupName: group.name
                    }
                }, {useMasterKey: true});
            });
    }
});

Parse.Cloud.beforeDelete('Identity', function (request, response) {
    var identity = request.object;

    getUserFromIdentity(identity)
        .then(user => {
            if (user != null) {
                if (user.get('currentIdentity').id == identity.id) {
                    user.unset('currentIdentity');
                }
                user.remove('identities', identity);
                user.remove('archivedIdentities', identity);
                return user.save(null, {useMasterKey: true});
            }

            return Parse.Promise.as();
        })
        .then(
            () => response.success('Successfully removed identity from user.'),
            error => response.error('Failed to remove identity from user with error: ' + error.message));
});

/**
 * Called before a group object is saved.
 *
 * If the group is saved for the first time, returns immediately with success. If not, performs multiple checks:
 *
 * If the field 'name' changed, sends a silent push to all users in the group that the name of the group changed.
 * If the field 'usersInvited' changed and an email address was removed, removes the user no longer invited from the
 * group role and sends a silent push to all users of the group that the object changed.
 *
 */
Parse.Cloud.beforeSave('Group', function (request, response) {
    var group = request.object;
    if (group.isNew()) {
        response.success();
        return;
    }

    checkFields()
        .then(
            () => response.success(),
            error => response.error(error.message));

    function checkFields() {
        return group.dirty('name') ? sendPushGroupNameChanged(group) : Parse.Promise.as();
    }

    function sendPushGroupNameChanged(group) {
        return Parse.Push.send({
            channels: [group.id],
            data: {
                type: "groupNameChanged",
                "content-available": 1,
                groupId: group.id
            }
        }, {useMasterKey: true});
    }
});

/**
 * Called before a group object is deleted.
 *
 * Deletes the group's role and all purchases of the group.
 */
Parse.Cloud.beforeDelete('Group', function (request, response) {
    var group = request.object;

    handleGroup(group)
        .then(
            () => response.success('Successfully deleted group'),
            error => response.error('Failed to delete group with error: ' + error.message));

    function handleGroup(group) {
        return getIdentitiesForGroup(group)
            .then(identities => isGroupActive(identities)
                ? Parse.Promise.error({'message': "This group has active identities, can't delete!"})
                : Parse.Object.destroyAll(identities, {useMasterKey: true}))
            .then(() => Parse.Promise.when(deleteGroupRole(group), deleteAllPurchases(group), deleteAllCompensations(group)));
    }

    function getIdentitiesForGroup(group) {
        var query = new Parse.Query(Identity);
        query.equalTo('group', group);
        return query.find({useMasterKey: true});
    }

    function isGroupActive(identities) {
        return identities.some(identity => identity.active && !identity.pending);
    }

    function deleteGroupRole(group) {
        return getGroupRole(group.id)
            .then(groupRole => groupRole != null
                ? groupRole.destroy({useMasterKey: true})
                : Parse.Promise.as());
    }

    function deleteAllPurchases(group) {
        var query = new Parse.Query(Purchase);
        query.equalTo('group', group);
        return query.find({useMasterKey: true})
            .then(purchases => purchases.length > 0
                ? Parse.Object.destroyAll(purchases, {useMasterKey: true})
                : Parse.Promise.as());
    }

    function deleteAllCompensations(group) {
        var query = new Parse.Query(Compensation);
        query.equalTo('group', group);
        return query.find({useMasterKey: true})
            .then(compensations => compensations.length > 0
                ? Parse.Object.destroyAll(compensations, {useMasterKey: true})
                : Parse.Promise.as());
    }
});

Parse.Cloud.beforeSave('Purchase', function (request, response) {
    var purchase = request.object;
    if (purchase.isNew()) {
        response.success();
        return;
    }

    checkIdentities(purchase)
        .then(
            () => response.success(),
            error => response.error('Failed to save purchase with error: ' + error.message));

    function checkIdentities(purchase) {
        // var promises = purchase.identities.map(identity => {
        //     return identity.fetch({useMasterKey: true})
        //         .then(identity => identity.active == false
        //             ? Parse.Promise.error({'message': "Purchase has inactive identities, can't change it!"})
        //             : Parse.Promise.as());
        // });
        //
        // return Parse.Promise.when(promises);

        var identities = purchase.identities;
        var promise = Parse.Promise.as();
        for (let identity of identities) {
            promise = promise
                .then(() => {
                    return identity.fetch({useMasterKey: true})
                        .then(identity => identity.active == false
                            ? Parse.Promise.error({'message': "Purchase has inactive identities, can't change it!"})
                            : Parse.Promise.as());
                });
        }

        return promise;
    }
});

/**
 * Called after a purchase object was saved. Re-calculates the users' balances and checks if the purchase already
 * existed before. If yes, sends a silent push to the users of the group that the purchase was edited. If the purchase
 * is new, sends a push to the users of the group that a new purchase was created.
 */
Parse.Cloud.afterSave('Purchase', function (request) {
    var purchase = request.object;
    var identities = purchase.identities;
    var identitiesIds = purchase.getIdentitiesIds();

    if (!includes(identitiesIds, purchase.buyer.id)) {
        identities.push(purchase.buyer);
        identitiesIds.push(purchase.buyer.id);
    }

    calculateAndSetBalance(purchase.group, identities)
        .then(() => calculateCompensations(purchase.group))
        .then(() => purchase.existed()
            ? sendPushPurchaseEdited(purchase, identitiesIds)
            : sendPushNewPurchase(purchase, identitiesIds));

    function sendPushPurchaseEdited(purchase, identitiesIds) {
        return Parse.Promise.when(purchase.buyer.fetch({useMasterKey: true}), purchase.group.fetch({useMasterKey: true}))
            .then((buyer, group) => {
                // TODO: send visible notification
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
                        purchaseId: purchase.id,
                        identitiesIds: identitiesIds
                    }
                }, {useMasterKey: true});
            });
    }

    function sendPushNewPurchase(purchase, identitiesIds) {
        var totalPrice = purchase.totalPrice;
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
});

/**
 * Called before a purchase object is deleted. Checks if a ParseFile is associated with the purchase and deletes it.
 * Then deletes all the items of the purchase.
 */
Parse.Cloud.beforeDelete('Purchase', function (request, response) {
    var purchase = request.object;

    deleteFile(purchase.receipt)
        .then(() => Parse.Object.destroyAll(purchase.items, {useMasterKey: true}))
        .then(
            () => response.success('Successfully deleted items and ParseFile'),
            error => response.error('Failed to delete items and ParseFile with error: ' + error.message));

    function deleteFile(receipt) {
        return receipt != null ? deleteParseFile(receipt.name()) : Parse.Promise.as();
    }
});

/**
 * Called after a purchase object was saved. Adds the buyer to the users if he/ was not already included.
 * This happens when the buyer makes a purchase where non of the items affect him. Re-calculates the users'
 * balances and compensations and sends a push to the users of the group that the purchase was deleted.
 */
Parse.Cloud.afterDelete('Purchase', function (request) {
    var purchase = request.object;
    var identities = purchase.identities;
    var identitiesIds = purchase.getIdentitiesIds();

    if (!includes(identitiesIds, purchase.buyer.id)) {
        identities.push(purchase.buyer);
        identitiesIds.push(purchase.buyer.id);
    }

    calculateAndSetBalance(purchase.group, identities)
        .then(() => calculateCompensations(purchase.group))
        .then(() => sendPushPurchaseDeleted(purchase, identitiesIds));

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
});

Parse.Cloud.beforeSave('Compensation', function (request, response) {
    var compensation = request.object;
    if (compensation.isNew()) {
        response.success();
        return;
    }

    checkIdentities(compensation)
        .then(
            () => response.success(),
            error => response.error('Failed to save compensation with error: ' + error.message));

    function checkIdentities(compensation) {
        return Parse.Promise.when(compensation.debtor.fetch({useMasterKey: true}), compensation.creditor.fetch({useMasterKey: true}))
            .then((debtor, creditor) => debtor.active == false || creditor.active == false
                ? Parse.Promise.error({'message': "Compensation has inactive identities, can't change it!"})
                : Parse.Promise.as());
    }
});

/**
 * Called after a compensation object was saved.
 *
 * Checks if the compensation already existed before.
 * If yes: If the compensation 'paid', re-calculates the balances of the users and sends a push to the users of the
 * group.
 *
 * If no returns immediately. Will be queried by clients on reception of new purchase etc. push.
 */
Parse.Cloud.afterSave('Compensation', function (request) {
    var compensation = request.object;
    if (!compensation.existed() || !compensation.paid) {
        return;
    }

    var identities = [compensation.creditor, compensation.debtor];
    return calculateAndSetBalance(compensation.group, identities)
        .then(() => {
            var origComp = request.original;
            if (isEqual(compensation.amount, origComp.amount)) {
                return sendPush(compensation, false)
            }

            return calculateCompensations(compensation.group)
                .then(() => sendPush(compensation, true));
        });


    function sendPush(compensation, didCalcNew) {
        return Parse.Promise.when(compensation.creditor.fetch({useMasterKey: true}), compensation.group.fetch({useMasterKey: true}))
            .then((creditor, group) => {
                return Parse.Push.send({
                    channels: [group.id],
                    data: {
                        type: "compensationExistingPaid",
                        "content-available": 1,
                        sound: "default",
                        alert: {
                            "loc-key": "locKey.compensationSetPaid",
                            "loc-args": [creditor.nickname, compensation.amount]
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
                }, {useMasterKey: true});
            })
    }
});

/**
 * Called after a task object was saved. Checks whether the task already existed before. If yes, sends a silent push to
 * all users involved of the task that the task changed. If no, sends a push to all users in the group that a new task
 * was created.
 */
Parse.Cloud.afterSave('Task', function (request) {
    var task = request.object;
    if (task.existed()) {
        sendPushTaskEdited(task);
    } else {
        sendPushNewTask(task);
    }

    function sendPushTaskEdited(task) {
        var identitiesIds = task.getIdentitiesIds();
        return Parse.Push.send({
            channels: [task.group.id],
            data: {
                type: "taskEdit",
                "content-available": 1,
                taskId: task.id,
                identitiesIds: identitiesIds
            }
        }, {useMasterKey: true});
    }

    function sendPushNewTask(task) {
        var identitiesIds = task.getIdentitiesIds();
        return task.initiator.fetch({useMasterKey: true})
            .then(initiator => {
                return Parse.Push.send({
                    channels: [task.group.id],
                    data: {
                        type: "taskNew",
                        "content-available": 1,
                        taskId: task.id,
                        groupId: task.group.id,
                        initiatorId: initiator.id,
                        user: initiator.nickname,
                        taskTitle: task.title,
                        identitiesIds: identitiesIds
                    }
                }, {useMasterKey: true});
            });
    }
});

Parse.Cloud.beforeDelete('Task', function (request, response) {
    var task = request.object;

    deleteHistoryEvents(task)
        .then(
            () => response.success(),
            error => response.error('Failed to delete task and its history events with error: ' + error.message));

    function deleteHistoryEvents(task) {
        var query = new Parse.Query(TaskHistory);
        query.equalTo('task', task);
        return query.find({useMasterKey: true})
            .then(events => !isEmpty(events)
                ? Parse.Object.destroyAll(events, {useMasterKey: true})
                : Parse.Promise.as());
    }
});

Parse.Cloud.afterSave('TaskHistoryEvent', function (request) {
    var event = request.object;
    sendPushNewEvent(event);

    function sendPushNewEvent(event) {
        return Parse.Promise.when(event.task.fetch({useMasterKey: true}), event.identity.fetch({useMasterKey: true}))
            .then((task, identity) => {
                var identitiesIds = task.getIdentitiesIds();
                return Parse.Push.send({
                    channels: [task.group.id],
                    data: {
                        type: "taskNewEvent",
                        "content-available": 1,
                        eventId: event.id,
                        taskId: task.id,
                        taskTitle: task.title,
                        user: identity.nickname,
                        groupId: task.group.id,
                        finisherId: identity.id,
                        identitiesIds: identitiesIds
                    }
                }, {useMasterKey: true});
            });
    }
});

/**
 * Called after a task object was deleted. Sends a push to the users of the users involved of the task that it was
 * deleted.
 */
Parse.Cloud.afterDelete('Task', function (request) {
    var task = request.object;
    var user = request.user;
    sendPushDeleted(task, user);

    function sendPushDeleted(task, user) {
        var identitiesIds = task.getIdentitiesIds();
        var deleteIdentity = user != null ? user.get('currentIdentity') : task.initiator;
        deleteIdentity.fetch({useMasterKey: true})
            .then(identity => {
                return Parse.Push.send({
                    channels: [task.group.id],
                    data: {
                        type: "taskDelete",
                        "content-available": 1,
                        taskId: task.id,
                        taskTitle: task.title,
                        deleteId: identity.id,
                        user: identity.nickname,
                        groupId: task.group.id,
                        identitiesIds: identitiesIds,
                        timeFrame: task.timeFrame
                    }
                }, {useMasterKey: true});
            });
    }
});

/**
 * Sends a push to the user of a compensation who owes money that he should settle the debt.
 *
 * @param compensation the object id of the compensation for which to send a reminder
 * @param currencyCode the currency code to format the amount
 */
Parse.Cloud.define('pushCompensationRemind', function (request, response) {
    var compensationId = request.params.compensationId;
    var currencyCode = request.params.currencyCode;

    var comp = getCompPointerFromId(compensationId);
    comp.fetch({useMasterKey: true})
        .then(comp => sendRemindPush(comp, currencyCode))
        .then(
            () => response.success('Push was sent successfully'),
            error => response.error('Push failed to send with error: ' + error.message));

    function sendRemindPush(compensation, currencyCode) {
        return Parse.Promise.when(compensation.creditor.fetch({useMasterKey: true}), getUserFromIdentity(compensation.debtor))
            .then((creditor, user) => {
                var pushQuery = new Parse.Query(Parse.Installation);
                pushQuery.equalTo('user', user);
                return Parse.Push.send({
                    where: pushQuery,
                    data: {
                        type: "compensationRemindUser",
                        "content-available": 1,
                        sound: "default",
                        alert: {
                            "loc-key": "locKey.remindUser",
                            "loc-args": [creditor.nickname, compensation.amount]
                        },
                        category: "remindUserToPay",
                        user: creditor.nickname,
                        amount: compensation.amount,
                        currencyCode: currencyCode,
                        groupId: compensation.group.id,
                        compensationId: compensationId
                    }
                }, {useMasterKey: true});
            });
    }
});

/**
 * Sends a push to the user currently responsible for a task that he/she should finish it.
 *
 * @param task the object id of the task for which to send a reminder
 */
Parse.Cloud.define('pushTaskRemind', function (request, response) {
    var reminder = request.user;
    var taskId = request.params.taskId;

    var task = new Task();
    task.id = taskId;
    Parse.Promise.when(task.fetch({useMasterKey: true}), reminder.get('currentIdentity').fetch({useMasterKey: true}))
        .then((task, identity) => sendRemindPush(task, identity))
        .then(
            () => response.success('Push was sent successfully'),
            error => response.error('Push failed to send with error: ' + error.message));

    function sendRemindPush(task, reminderIdentity) {
        var responsible = task.identities[0];
        getUserFromIdentity(responsible)
            .then(user => {
                var pushQuery = new Parse.Query(Parse.Installation);
                pushQuery.equalTo('user', user);
                return Parse.Push.send({
                    where: pushQuery,
                    data: {
                        type: "taskRemindUser",
                        "content-available": 1,
                        user: reminderIdentity.nickname,
                        taskTitle: task.title,
                        groupId: task.group.id,
                        taskId: task.id
                    }
                });
            });
    }
});

/**
 * Deletes a ParseFile.
 *
 * @param fileName the file name of the ParseFile to delete
 */
Parse.Cloud.define('deleteParseFile', function (request, response) {
    var fileName = request.params.fileName;

    deleteParseFile(fileName)
        .then(
            () => response.success('File was deleted successfully.'),
            error => response.error('Failed to delete file with error: ' + error.message));
});


/**
 * Gets all the users that have the calling user's current group in their identities an re-calculates their balances.
 */
Parse.Cloud.define('calculateBalances', function (request, response) {
    var user = request.user;
    var currentIdentity = user.get('currentIdentity');

    currentIdentity.fetch({useMasterKey: true})
        .then(identity => {
            var query = new Parse.Query(Identity);
            query.equalTo('group', identity.group);
            query.equalTo('active', true);
            return query.find({useMasterKey: true})
                .then(identities => calculateAndSetBalance(identity.group, identities));
        })
        .then(
            () => response.success('Balances were calculated successfully.'),
            error => response.error('Failed to calculate balances with error: ' + error.message));
});

Parse.Cloud.define('calculateCompensations', function (request, response) {
    var groupId = request.params.groupId;
    var groupToBalance = getGroupPointerFromId(groupId);

    calculateCompensations(groupToBalance)
        .then(
            () => response.success('comps were calculated'),
            error => response.error('failed to calc comps with error ' + error.message));
});

Parse.Cloud.define('addIdentityToUser', function (request, response) {
    var user = request.user;
    var identityId = request.params.identityId;

    addIdentityToUser(user, identityId)
        .then(
            () => response.success('Successfully added identity to user.'),
            error => response.error('Failed to add identity to user with error: ' + error.message));

    function addIdentityToUser(user, identityId) {
        var identities = user.get('identities');
        var promises = identities.map(identity => identity.fetch({useMasterKey: true}));
        var newIdentity = getIdentityPointerFromId(identityId);
        promises.push(newIdentity.fetch({useMasterKey: true}));
        return Parse.Promise.when(promises)
            .then(identities => {
                var newIdentity = identities.pop();
                var groupIds = identities.map(identity => identity.group.id);

                if (includes(groupIds, newIdentity.group.id)) {
                    return Parse.Promise.error({'message': 'You are already in this group!'});
                }

                if (!newIdentity.pending) {
                    return Parse.Promise.error({'message': 'Identity is not pending!'});
                }

                return addUserToGroupRole(user, newIdentity.group.id)
                    .then(role => addIdentity(user, newIdentity, role));
            });
    }

    function addUserToGroupRole(user, groupId) {
        return getGroupRole(groupId)
            .then(role => {
                role.getUsers().add(user);
                return role.save(null, {useMasterKey: true});
            });
    }

    function addIdentity(user, identity, role) {
        return user.get('currentIdentity').fetch({useMasterKey: true})
            .then(currentIdentity => {
                if (currentIdentity.nickname != null) {
                    identity.nickname = currentIdentity.nickname;
                }
                if (currentIdentity.avatar != null) {
                    identity.avatar = currentIdentity.avatar;
                }
                identity.pending = false;
                var acl = identity.getACL();
                acl.setReadAccess(user, true);
                acl.setWriteAccess(user, true);
                acl.setRoleWriteAccess(role, false);
                identity.setACL(acl);
                return identity.save(null, {useMasterKey: true});
            })
            .then(identity => {
                user.addUnique('identities', identity);
                user.set('currentIdentity', identity);
                return user.save(null, {useMasterKey: true});
            });
    }
});

Parse.Cloud.define('addGroup', function (request, response) {
    var user = request.user;
    var name = request.params.groupName;
    var currency = request.params.currencyCode;

    addGroup(user, name, currency)
        .then(
            () => response.success('Successfully create new group and identity.'),
            error => response.error('Failed to add new group and identity with error: ' + error.message));
});

Parse.Cloud.define('loginWithGoogle', function (request, response) {
    var idToken = request.params.idToken;
    const clientIds = ['982871908066-1scsmdngvfsj68t7kq5o42t35oubujme.apps.googleusercontent.com',
        '982871908066-0g1m4dj80me2thbb3ov8v0h63a6g4kkp.apps.googleusercontent.com'];

    verifyIdToken(idToken)
        .then(httpResponse => {
            if (httpResponse.status != 200) {
                return Parse.Promise.error({message: 'Login failed, token could not be verified.'});
            }

            const token = httpResponse.data;
            if (!includes(clientIds, token.aud)) {
                return Parse.Promise.error({message: 'aud does not match'});
            }

            const googleId = token.sub;
            const email = token.email;
            return upsertGoogleUser(googleId, email);
        })
        .then(
            user => response.success(user.getSessionToken()),
            error => response.error('idToken could not be verified with error ' + error.message));

    function verifyIdToken(idToken) {
        var url = 'https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + idToken;
        return Parse.Cloud.httpRequest({
            method: 'POST',
            url: url
        });
    }

    function upsertGoogleUser(googleId, email) {
        var password = getRandomPassword();
        var query = new Parse.Query(Parse.User);
        query.equalTo('googleId', googleId);
        return query.first({useMasterKey: true})
            .then(user => {
                if (user == null) {
                    return createNewUser(email, password, googleId);
                }

                user.set('password', password);
                return user.save(null, {useMasterKey: true});
            })
            .then(user => Parse.User.logIn(user.get('username'), password));

        function getRandomPassword() {
            return Math.random().toString(36).slice(2);
        }

        function createNewUser(email, password, googleId) {
            var user = new Parse.User();
            user.set('username', email);
            user.set('password', password);
            user.set('googleId', googleId);

            return user.signUp();
        }
    }
});

Parse.Cloud.define('setPassword', function (request, response) {
    var username = request.params.username;
    var password = request.params.password;

    var query = new Parse.Query(Parse.User);
    query.equalTo('username', username);
    query.first({useMasterKey: true})
        .then(user => {
            user.set('password', password);
            return user.save(null, {useMasterKey: true});
        })
        .then(
            () => response.success('password was set'),
            error => response.error('setting of password failed with error ' + error.message));
});

Parse.Cloud.define('cleanUpIdentities', function (request, response) {
    var query = new Parse.Query(Parse.User);
    query.include('identities');
    query.find({useMasterKey: true})
        .then(users => {
            var promises = [];
            for (let user of users) {
                var identities = user.get('identities');
                for (let identity of identities) {
                    if (!identity.active) {
                        user.remove('identities', identity);
                        user.addUnique('archivedIdentities', identity);
                        promises.push(user.save(null, {useMasterKey: true}));
                    }
                }
            }

            return Parse.Promise.when(promises);
        })
        .then(
            () => response.success('Identities were cleaned up'),
            error => response.error('Cleaning identities failed with error ' + error.message));
});

/**
 * Calculates the spending stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define('statsSpending', function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;

    calculateSpendingStats(group, year, month)
        .then(
            result => response.success(JSON.stringify(result)),
            error => response.error('Failed with error: ' + error.message));
});

/**
 * Calculates the store stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define('statsStores', function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;
    var statsType = 'store';

    calculateStoreOrCurrencyStats(statsType, group, year, month)
        .then(
            result => response.success(JSON.stringify(result)),
            error => response.error('Failed with error: ' + error.message));
});

/**
 * Calculates the currency stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define('statsCurrencies', function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;
    var statsType = 'currency';

    calculateStoreOrCurrencyStats(statsType, group, year, month)
        .then(
            result => response.success(JSON.stringify(result)),
            error => response.error('Failed with error: ' + error.message));
});

function getGroupRole(groupId) {
    var roleName = getGroupRoleName(groupId);
    var roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('name', roleName);
    return roleQuery.first({useMasterKey: true});
}

function getGroupRoleName(groupId) {
    return 'groupOf_' + groupId;
}

function deleteParseFile(fileName) {
    var url = 'http://localhost:3000/api/data/files/' + fileName;

    return Parse.Cloud.httpRequest({
        method: "DELETE",
        url: url,
        headers: {
            "X-Parse-Application-Id": "yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji",
            "X-Parse-Master-Key": "TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK"
        }
    });
}

function getGroupPointerFromId(groupId) {
    var group = new Group();
    group.id = groupId;
    return group;
}

function getIdentityPointerFromId(identityId) {
    var identity = new Identity();
    identity.id = identityId;
    return identity;
}

function getCompPointerFromId(compId) {
    var comp = new Compensation();
    comp.id = compId;
    return comp;
}

function getUserFromIdentity(identity) {
    var activeQuery = new Parse.Query(Parse.User);
    activeQuery.equalTo('identities', identity);

    var archivedQuery = new Parse.Query(Parse.User);
    archivedQuery.equalTo('archivedIdentities', identity);

    var query = Parse.Query.or(activeQuery, archivedQuery);
    return query.first({useMasterKey: true});
}

function addGroup(user, name, currency) {
    return createGroup(name, currency)
        .then(group => {
            return createGroupRole(group, user)
                .then(() => setGroupAcl(group));
        })
        .then(group => {
            return getCurrentIdentity(user)
                .then(currentIdentity => currentIdentity != null
                    ? createIdentity(user, group, currentIdentity.nickname, currentIdentity.avatar)
                    : createIdentity(user, group));
        })
        .then(identity => setIdentity(user, identity));

    function createGroup(name, currency) {
        var group = new Group();
        group.name = name;
        group.currency = currency;
        return group.save(null, {useMasterKey: true});
    }

    function createGroupRole(group, user) {
        var roleName = getGroupRoleName(group.id);
        var role = new Parse.Role(roleName, new Parse.ACL());
        return role.save(null, {useMasterKey: true})
            .then(role => {
                // add user who created the group to the new Role
                if (user != null) {
                    role.getUsers().add(user);
                    return role.save(null, {useMasterKey: true});
                }

                return Parse.Promise.as();
            });
    }

    function setGroupAcl(group) {
        var acl = new Parse.ACL();
        var roleName = getGroupRoleName(group.id);
        acl.setRoleWriteAccess(roleName, true);
        acl.setRoleReadAccess(roleName, true);
        group.setACL(acl);

        return group.save(null, {useMasterKey: true});
    }

    function getCurrentIdentity(user) {
        var identity = user.get('currentIdentity');
        return identity != null ? identity.fetch({useMasterKey: true}) : Parse.Promise.as();
    }

    function createIdentity(user, group, nickname, avatar) {
        var identity = new Identity();

        // set values
        identity.group = group;
        identity.active = true;
        identity.pending = false;
        identity.nickname = nickname != null ? nickname : '';
        if (avatar != null) {
            identity.avatar = avatar;
        }

        // set ACL
        var acl = new Parse.ACL(user);
        acl.setRoleReadAccess(getGroupRoleName(group.id), true);
        identity.setACL(acl);

        return identity.save(null, {useMasterKey: true});
    }

    function setIdentity(user, identity) {
        user.addUnique('identities', identity);
        user.set('currentIdentity', identity);
        return user.save(null, {useMasterKey: true});
    }
}

/**
 * Returns a promise for the calculation and setting of the balances of the users involved.
 *
 * @param group the group for which the balances should be calculated
 * @param identities the users to calculate the balances for
 * @returns {Parse.Promise} when the calculation finished and balances are set
 */
function calculateAndSetBalance(group, identities) {
    // create query for Purchases
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo('group', group);
    purchaseQuery.include('items');

    // create query for compensations
    var compensationQuery = new Parse.Query(Compensation);
    compensationQuery.equalTo('group', group);
    compensationQuery.equalTo('paid', true);

    // wait for them all to complete
    // result order will match the order passed to when()
    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), compensationQuery.find({useMasterKey: true}))
        .then((purchases, compensations) => calculateBalance(purchases, identities, compensations));

    function calculateBalance(purchases, identities, compensations) {
        var promise = Parse.Promise.as();

        for (let identity of identities) {
            promise = promise
                .then(() => {
                    var balance = new Fraction(0);

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

        function calculateBalanceCompensations(compensation, identity) {
            var balance = new Fraction(0);

            var debtor = compensation.debtor;
            var creditor = compensation.creditor;
            var amount = compensation.amount;

            if (debtor.id == identity.id) {
                balance = balance.add(amount);
            } else if (creditor.id == identity.id) {
                balance = balance.sub(amount);
            }

            return balance;
        }

        function calculateBalancePurchases(purchase, identity) {
            var balance = new Fraction(0);
            var buyer = purchase.buyer;
            var items = purchase.items;

            for (let item of items) {
                var price = new Fraction(item.price);
                var identitiesIds = item.getIdentitiesIds();

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
            var balanceNum = balance.n * balance.s;
            var balanceDen = balance.d;
            identity.balance = [balanceNum, balanceDen];
            return identity.save(null, {useMasterKey: true});
        }
    }
}

function calculateCompensations(group) {
    return Parse.Promise.when(deleteUnpaidCompensations(), getIdentityBalances())
        .then((deleteResult, identityBalances) => {
            var newComps = getNewCompensations(identityBalances);
            return Parse.Object.saveAll(newComps);
        });

    function deleteUnpaidCompensations() {
        var query = new Parse.Query(Compensation);
        query.equalTo('group', group);
        query.equalTo('paid', false);
        return query.find({useMasterKey: true})
            .then(comps => comps.length > 0
                ? Parse.Object.destroyAll(comps, {useMasterKey: true})
                : Parse.Promise.as());
    }

    function getIdentityBalances() {
        var query = new Parse.Query(Identity);
        query.equalTo('group', group);
        return query.find({useMasterKey: true})
            .then(identities => {
                var identityBalances = identities.map(identity => {
                    return {identity: identity, balance: identity.balance};
                });

                return identityBalances.sort(sortBalances);
            });
    }

    function sortBalances(a, b) {
        var aFraction = a.balance;
        var bFraction = b.balance;

        return bFraction.compare(aFraction);
    }

    function getNewCompensations(identityBalances) {
        var compensationsNew = [];

        var topBalance = head(identityBalances);
        var bottomBalance = last(identityBalances);
        var topBalanceValue = topBalance.balance;
        var bottomBalanceValue = bottomBalance.balance;

        var groupRoleName = getGroupRoleName(group.id);
        var acl = new Parse.ACL();
        acl.setRoleReadAccess(groupRoleName, true);
        acl.setRoleWriteAccess(groupRoleName, true);

        while (topBalanceValue.compare(0) > 0) {
            calculateCompensation();
        }

        return compensationsNew;

        function calculateCompensation() {
            var compensation;
            var bottomBalanceValueNeg = new Fraction(bottomBalanceValue).neg();

            if (topBalanceValue.compare(bottomBalanceValueNeg) >= 0) {
                // biggest minus value is smaller than biggest plus value
                topBalanceValue = topBalanceValue.add(bottomBalanceValue);
                topBalance.balance = topBalanceValue;
                compensation = createNewCompensation(bottomBalance.identity, topBalance.identity, bottomBalanceValueNeg);
                identityBalances = topBalanceValue.equals(0)
                    ? without(identityBalances, bottomBalance, topBalance)
                    : without(identityBalances, bottomBalance);
            } else {
                // biggest minus value is bigger than biggest plus value, hence can fully compensate it
                bottomBalanceValue = bottomBalanceValue.add(topBalanceValue);
                bottomBalance.balance = bottomBalanceValue;
                compensation = createNewCompensation(bottomBalance.identity, topBalance.identity, topBalanceValue);
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

        function createNewCompensation(debtor, creditor, amount) {
            var compensation = new Compensation();
            compensation.group = group;
            compensation.debtor = debtor;
            compensation.creditor = creditor;
            compensation.paid = false;
            var amountNum = amount.n * amount.s;
            var amountDen = amount.d;
            compensation.amount = [amountNum, amountDen];
            compensation.setACL(acl);

            return compensation;
        }
    }
}

function calculateSpendingStats(group, year, month) {
    // create query for Purchases
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo('group', group);
    var firstOfMonthInYear = getFirstOfMonthInYear(year, month);
    purchaseQuery.greaterThanOrEqualTo('date', firstOfMonthInYear);
    purchaseQuery.lessThanOrEqualTo('date', getLastOfMonthInYear(year, month));

    // create query for Identities
    var identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo('group', group);
    identityQuery.equalTo('active', true);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then((purchases, identities) => {
            var results = {};

            var numberOfUnits = 0;
            var purchasesAll;
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

    function sortPurchasesByMonth(purchases) {
        var purchasesYear = {};
        for (var i = 0; i < 12; i++) {
            purchasesYear[i] = [];
        }

        for (let purchase of purchases) {
            var createdAt = purchase.date;
            var month = createdAt.getMonth();
            purchasesYear[month].push(purchase);
        }

        return purchasesYear;
    }

    function sortPurchasesByDay(purchases, daysInMonth) {
        var purchasesMonth = {};

        for (var i = 0; i < daysInMonth; i++) {
            purchasesMonth[i] = [];
        }

        for (let purchase of purchases) {
            var createdAt = purchase.date;
            var day = createdAt.getDate() - 1; // use 0 based numbering as with months
            purchasesMonth[day].push(purchase);
        }

        return purchasesMonth;
    }

    function getDaysInMonth(anyDateInMonth) {
        var date = new Date(anyDateInMonth.getYear(), anyDateInMonth.getMonth() + 1, 0);
        return date.getDate();
    }
}


function getFirstOfMonthInYear(year, month) {
    return month != null ? new Date(year, month, 1) : new Date(year, 0, 1);
}

function getLastOfMonthInYear(year, month) {
    return month != null ? new Date(year, month, 31, 23, 59, 59) : new Date(year, 11, 31, 23, 59, 59);
}

function calculateStatsForGroup(purchasesByType, groupToCalculate) {
    var group = {};
    group.groupId = groupToCalculate.id;
    group.units = [];

    for (var type in purchasesByType) {
        if (purchasesByType.hasOwnProperty(type)) {
            var unit = {};
            unit.identifier = type;

            var totalPrice = 0;
            for (let purchase of purchasesByType[type]) {
                totalPrice += purchase.totalPrice;
            }
            unit.total = totalPrice;

            var numberOfPurchases = size(purchasesByType[type]);
            unit.average = getAveragePrice(numberOfPurchases, totalPrice);

            group.units.push(unit);
        }
    }

    return group;
}

function calculateStatsForIdentities(purchasesByType, identities) {
    var members = [];

    for (let identity of identities) {
        var member = {};
        member.nickname = identity.nickname;
        member.units = [];

        for (var type in purchasesByType) {
            if (purchasesByType.hasOwnProperty(type)) {
                var unit = {};
                unit.identifier = type;

                var totalPrice = 0;
                for (let purchase of purchasesByType[type]) {
                    var buyer = purchase.buyer;
                    if (buyer.id == identity.id) {
                        totalPrice += purchase.totalPrice;
                    }
                }
                unit.total = totalPrice;

                var numberOfPurchases = size(purchasesByType[type]);
                unit.average = getAveragePrice(numberOfPurchases, totalPrice);

                member.units.push(unit);
            }
        }

        members.push(member);
    }

    return members;
}

function getAveragePrice(numberOfPurchases, totalPrice) {
    var averagePrice = 0;
    if (numberOfPurchases > 0) {
        averagePrice = totalPrice / numberOfPurchases;
    }
    return averagePrice;
}


function calculateStoreOrCurrencyStats(statsType, group, year, month) {
    // create query for Purchases
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.limit(1000);
    purchaseQuery.equalTo('group', group);
    purchaseQuery.greaterThanOrEqualTo('date', getFirstOfMonthInYear(year, month));
    purchaseQuery.lessThanOrEqualTo('date', getLastOfMonthInYear(year, month));

    // create query for Identities
    var identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo('group', group);
    identityQuery.equalTo('active', true);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then((purchases, identities) => {
            var results = {};

            var purchasesByType = sortPurchasesByType(purchases, statsType);
            results.numberOfUnits = size(purchasesByType);
            results.group = calculateStatsForGroup(purchasesByType, group);
            results.members = calculateStatsForIdentities(purchasesByType, identities);

            return results;
        });

    function sortPurchasesByType(purchases, statsType) {
        var purchasesTypes = {};

        for (let purchase of purchases) {
            var type = purchase.get(statsType);
            if (purchasesTypes[type] == null) {
                purchasesTypes[type] = [];
            }
            purchasesTypes[type].push(purchase);
        }

        return purchasesTypes;
    }
}
