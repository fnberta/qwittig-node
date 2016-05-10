/**
 * Created by fabio on 08.05.16.
 */

import {getUserFromIdentity, getGroupRole, deleteParseFile} from '../utils';

export function beforeSave(request, response) {
    const identity = request.object;
    if (identity.isNew()) {
        response.success();
        return;
    }

    const promises = [Parse.Promise.as()];

    if (identity.dirty('avatar')) {
        promises.push(handleAvatar(request.original));
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

    Parse.Promise.when(promises)
        .then(() => response.success())
        .catch(err => response.error('failed to save identity with error ' + err.message));
}

function handleAvatar(oldIdentity) {
    const file = oldIdentity.avatar;
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
            const pushQuery = new Parse.Query(Parse.Installation);
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

export function beforeDelete(request, response) {
    const identity = request.object;

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
        .then(() => response.success('Successfully removed identity from user.'))
        .catch(err => response.error('Failed to remove identity from user with error: ' + err.message));
}
