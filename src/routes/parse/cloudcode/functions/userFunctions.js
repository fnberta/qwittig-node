/**
 * Created by fabio on 09.05.16.
 */

import {includes} from 'lodash';
import {getGroupPointerFromId, getIdentityPointerFromId, getGroupRole, getGroupRoleName} from '../utils';
import {calculateAndSetBalance, calculateCompensations} from '../balance'
import Identity from '../entities/Identity';
import Group from '../entities/Group';

export function calculateBalancesForGroup(request, response) {
    const user = request.user;
    const currentIdentity = user.get('currentIdentity');

    currentIdentity.fetch({useMasterKey: true})
        .then(identity => {
            const query = new Parse.Query(Identity);
            query.equalTo('group', identity.group);
            query.equalTo('active', true);
            return Parse.Promise.all([identity, query.find({useMasterKey: true})])
        })
        .then(([identity, identities]) => calculateAndSetBalance(identity.group, identities))
        .then(() => response.success('Balances were calculated successfully.'))
        .catch(err => response.error('Failed to calculate balances with error: ' + err.message));
}

export function calculateCompensationsForGroup(request, response) {
    const groupId = request.params.groupId;
    const group = getGroupPointerFromId(groupId);

    group.fetch({useMasterKey: true})
        .then(group => calculateCompensations(group))
        .then(() => response.success('Compensations were successfully calculated'))
        .catch(err => response.error('Failed to calculate compensations with error ' + err.message));
}

export function addIdentityToUser(request, response) {
    const user = request.user;
    const identityId = request.params.identityId;

    const identities = user.get('identities');
    const promises = identities.map(identity => identity.fetch({useMasterKey: true}));
    const newIdentity = getIdentityPointerFromId(identityId);
    promises.push(newIdentity.fetch({useMasterKey: true}));
    Parse.Promise.when(promises)
        .then(identities => {
            const newIdentity = identities.pop();
            const groupIds = identities.map(identity => identity.group.id);

            if (includes(groupIds, newIdentity.group.id)) {
                return Parse.Promise.error({'message': 'You are already in this group!'});
            }

            if (!newIdentity.pending) {
                return Parse.Promise.error({'message': 'Identity is not pending!'});
            }

            return Parse.Promise.all([user, newIdentity, addUserToGroupRole(user, newIdentity.group.id)]);
        })
        .then(([user, newIdentity, role]) => addIdentity(user, newIdentity, role))
        .then(() => response.success('Successfully added identity to user.'))
        .catch(err => response.error('Failed to add identity to user with error: ' + err.message));
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
            const acl = identity.getACL();
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

export function addGroup(request, response) {
    const user = request.user;
    const name = request.params.groupName;
    const currency = request.params.currencyCode;

    return createGroup(name, currency)
        .then(group => Parse.Promise.all([group, createGroupRole(group, user)]))
        .then(([group, groupRole]) => setGroupAcl(group))
        .then(group => Parse.Promise.all([group, getCurrentIdentity(user)]))
        .then(([group, currentIdentity]) => currentIdentity != null
            ? createIdentity(user, group, currentIdentity.nickname, currentIdentity.avatar)
            : createIdentity(user, group))
        .then(identity => setIdentity(user, identity))
        .then(() => response.success('Successfully create new group and identity.'))
        .catch(err => response.error('Failed to add new group and identity with error: ' + err.message));
}

function createGroup(name, currency) {
    const group = new Group();
    group.name = name;
    group.currency = currency;
    return group.save(null, {useMasterKey: true});
}

function createGroupRole(group, user) {
    const roleName = getGroupRoleName(group.id);
    const role = new Parse.Role(roleName, new Parse.ACL());
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
    const acl = new Parse.ACL();
    const roleName = getGroupRoleName(group.id);
    acl.setRoleWriteAccess(roleName, true);
    acl.setRoleReadAccess(roleName, true);
    group.setACL(acl);

    return group.save(null, {useMasterKey: true});
}

function getCurrentIdentity(user) {
    const identity = user.get('currentIdentity');
    return identity != null ? identity.fetch({useMasterKey: true}) : Parse.Promise.as();
}

function createIdentity(user, group, nickname, avatar) {
    const identity = new Identity();

    // set values
    identity.group = group;
    identity.active = true;
    identity.pending = false;
    identity.nickname = nickname != null ? nickname : '';
    if (avatar != null) {
        identity.avatar = avatar;
    }

    // set ACL
    const acl = new Parse.ACL(user);
    acl.setRoleReadAccess(getGroupRoleName(group.id), true);
    identity.setACL(acl);

    return identity.save(null, {useMasterKey: true});
}

function setIdentity(user, identity) {
    user.addUnique('identities', identity);
    user.set('currentIdentity', identity);
    return user.save(null, {useMasterKey: true});
}

export function loginWithGoogle(request, response) {
    const idToken = request.params.idToken;
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
        .then(user => response.success(user.getSessionToken()))
        .catch(err => response.error('idToken could not be verified with error ' + err.message));
}

function verifyIdToken(idToken) {
    const url = 'https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + idToken;
    return Parse.Cloud.httpRequest({
        method: 'POST',
        url: url
    });
}

function upsertGoogleUser(googleId, email) {
    const password = getRandomPassword();
    const query = new Parse.Query(Parse.User);
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
}

function getRandomPassword() {
    return Math.random().toString(36).slice(2);
}

function createNewUser(email, password, googleId) {
    const user = new Parse.User();
    user.set('username', email);
    user.set('password', password);
    user.set('googleId', googleId);

    return user.signUp();
}

export function setPassword(request, response) {
    const username = request.params.username;
    const password = request.params.password;

    const query = new Parse.Query(Parse.User);
    query.equalTo('username', username);
    query.first({useMasterKey: true})
        .then(user => {
            user.set('password', password);
            return user.save(null, {useMasterKey: true});
        })
        .then(() => response.success('password was set'))
        .catch(err => response.error('setting of password failed with error ' + err.message));
}

export function cleanUpIdentities(request, response) {
    const query = new Parse.Query(Parse.User);
    query.include('identities');
    query.find({useMasterKey: true})
        .then(users => {
            const promises = [];
            for (let user of users) {
                const identities = user.get('identities');
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
        .then(() => response.success('Identities were cleaned up'))
        .catch(err => response.error('Cleaning identities failed with error ' + err.message));
}