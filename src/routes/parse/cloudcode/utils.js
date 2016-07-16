/**
 * Created by fabio on 08.05.16.
 */

import Group from './entities/Group';
import Identity from './entities/Identity';
import Compensation from './entities/Compensation';
import Task from './entities/Task';

export function getUserFromIdentity(identity) {
    const activeQuery = new Parse.Query(Parse.User);
    activeQuery.equalTo('identities', identity);

    const archivedQuery = new Parse.Query(Parse.User);
    archivedQuery.equalTo('archivedIdentities', identity);

    const query = Parse.Query.or(activeQuery, archivedQuery);
    return query.first({useMasterKey: true});
}

export function getGroupPointerFromId(groupId) {
    const group = new Group();
    group.id = groupId;
    return group;
}

export function getIdentityPointerFromId(identityId) {
    const identity = new Identity();
    identity.id = identityId;
    return identity;
}

export function getCompPointerFromId(compId) {
    const comp = new Compensation();
    comp.id = compId;
    return comp;
}

export function getTaskPointerFromId(taskId) {
    const task = new Task();
    task.id = taskId;
    return task;
}

export function getGroupRole(groupId) {
    const roleName = getGroupRoleName(groupId);
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo('name', roleName);
    return roleQuery.first({useMasterKey: true});
}

export function getGroupRoleName(groupId) {
    return 'groupOf_' + groupId;
}

export function deleteParseFile(fileName) {
    const url = 'http://localhost:3000/api/data/files/' + fileName;

    return Parse.Cloud.httpRequest({
        method: "DELETE",
        url: url,
        headers: {
            "X-Parse-Application-Id": "yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji",
            "X-Parse-Master-Key": "TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK"
        }
    });
}

export function formatMoney(number, currency) {
    const currencyFormatter = new Intl.NumberFormat('de-CH', {
        style: 'currency',
        currency: currency
    });
    
    return currencyFormatter.format(number);
}