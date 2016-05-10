/**
 * Created by fabio on 08.05.16.
 */

import Identity from './../entities/Identity';
import Compensation from './../entities/Compensation';
import {isEmpty, difference} from 'lodash';

export function afterSave(request) {
    const user = request.object;
    if (user.existed()) {
        checkArchivedIdentities(user, request.original);
    } else {
        setAcl(user)
    }
}

function checkArchivedIdentities(user, oldUser) {
    const archivedIdentities = user.get('archivedIdentities');
    if (archivedIdentities.length == 0) {
        return;
    }

    let oldArchived = oldUser.get('archivedIdentities');
    if (oldArchived == null) {
        oldArchived = []
    }
    if (archivedIdentities.length > oldArchived.length) {
        const newArchivedIds = archivedIdentities.map(identity => identity.id);
        const oldArchivedIds = oldArchived.map(identity => identity.id);
        const newlyArchivedIds = difference(newArchivedIds, oldArchivedIds);
        for (let identityId of newlyArchivedIds) {
            const identity = getIdentityPointerFromId(identityId);
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
    const acl = new Parse.ACL(user);
    acl.setPublicReadAccess(false);
    user.setACL(acl);
    user.save(null, {useMasterKey: true});
}

function getIdentityPointerFromId(identityId) {
    const identity = new Identity();
    identity.id = identityId;
    return identity;
}

export function beforeDelete(request, response) {
    const user = request.object;

    const identities = user.get('identities');
    if (identities == null || isEmpty(identities)) {
        response.success();
        return;
    }

    getCompensations(identities)
        .then(compensations => isEmpty(compensations) ? Parse.Promise.as() : settleCompensations(compensations))
        .then(() => deactivateIdentities(identities))
        .then(() => response.success('Successfully settled compensations and disabled identities'))
        .catch(err => response.error('Failed to settle compensations and disable identities with error: ' + err.message));
}

function getCompensations(identities) {
    const debtorQuery = new Parse.Query(Compensation);
    debtorQuery.containedIn('debtor', identities);

    const creditorQuery = new Parse.Query(Compensation);
    creditorQuery.containedIn('creditor', identities);

    const mainQuery = Parse.Query.or(debtorQuery, creditorQuery);
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

export function afterDelete(request) {
    const user = request.object;
    const identities = user.get('identities');
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