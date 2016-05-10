/**
 * Created by fabio on 08.05.16.
 */

import Identity from '../entities/Identity';
import Purchase from '../entities/Purchase';
import Compensation from '../entities/Compensation';
import {getGroupRole} from '../utils';

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
export function beforeSave(request, response) {
    const group = request.object;
    if (group.isNew()) {
        response.success();
        return;
    }

    group.dirty('name') ? sendPushGroupNameChanged(group) : Parse.Promise.as()
        .then(() => response.success())
        .catch(err => response.error(err.message));
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

/**
 * Called before a group object is deleted.
 *
 * Deletes the group's role and all purchases of the group.
 */
export function beforeDelete(request, response) {
    const group = request.object;

    getIdentitiesForGroup(group)
        .then(identities => isGroupActive(identities)
            ? Parse.Promise.error({'message': "This group has active identities, can't delete!"})
            : Parse.Object.destroyAll(identities, {useMasterKey: true}))
        .then(() => Parse.Promise.when(deleteGroupRole(group), deleteAllPurchases(group), deleteAllCompensations(group)))
        .then(() => response.success('Successfully deleted group'))
        .catch(err => response.error('Failed to delete group with error: ' + err.message));
}

function getIdentitiesForGroup(group) {
    const query = new Parse.Query(Identity);
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
    const query = new Parse.Query(Purchase);
    query.equalTo('group', group);
    return query.find({useMasterKey: true})
        .then(purchases => purchases.length > 0
            ? Parse.Object.destroyAll(purchases, {useMasterKey: true})
            : Parse.Promise.as());
}

function deleteAllCompensations(group) {
    const query = new Parse.Query(Compensation);
    query.equalTo('group', group);
    return query.find({useMasterKey: true})
        .then(compensations => compensations.length > 0
            ? Parse.Object.destroyAll(compensations, {useMasterKey: true})
            : Parse.Promise.as());
}