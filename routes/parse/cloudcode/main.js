/**
 * Created by fabio on 02.03.16.
 */

var _ = require('underscore');
var Fraction = require('fraction.js');

Parse.Cloud.afterSave(Parse.User, function (request) {
    var user = request.object;
    if (user.existed()) {
        checkArchivedIdentities(user, request.original);
    } else {
        setAcl(user)
    }

    function checkArchivedIdentities(user, oldUser) {
        var archivedIdentities = user.get("archivedIdentities");
        if (archivedIdentities.length == 0) {
            return;
        }

        var oldArchived = oldUser.get("archivedIdentities");
        if (oldArchived == null) {
            oldArchived = []
        }
        if (archivedIdentities.length > oldArchived.length) {
            var newArchivedIds = getIdsFromObjects(archivedIdentities);
            var oldArchivedIds = getIdsFromObjects(oldArchived);
            var newlyArchivedIds = _.difference(newArchivedIds, oldArchivedIds);
            _.each(newlyArchivedIds, function (identityId) {
                var Identity = Parse.Object.extend("Identity");
                var identity = new Identity();
                identity.id = identityId;
                identity.fetch({useMasterKey: true})
                    .then(function (identity) {
                        var group = identity.get("group");
                        var nickname = identity.get("nickname");
                        return sendPushUserLeftGroup(group, nickname)
                            .then(function () {
                                // group beforeDelete handler will make sure that group only gets deleted if it contains no
                                // active identities
                                return group.destroy({useMasterKey: true})
                            });
                    });
            });
        }
    }

    function sendPushUserLeftGroup(group, nickname) {
        return group.fetch({useMasterKey: true})
            .then(function (group) {
                var groupName = group.get("name");
                return Parse.Push.send({
                    channels: [group.id],
                    data: {
                        type: "userLeft",
                        "content-available": 1,
                        groupId: group.id,
                        user: nickname,
                        groupName: groupName
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
        .then(function () {
            response.success("Successfully settled compensations and disabled identities")
        }, function (error) {
            response.error("Failed to settle compensations and disable identities with error: " + error.message);
        });

    function handleUser(user) {
        var identities = user.get("identities");
        if (identities == null || _.isEmpty(identities)) {
            return Parse.Promise.as();
        }

        return getCompensations(identities)
            .then(function (compensations) {
                if (_.isEmpty(compensations)) {
                    return Parse.Promise.as();
                }

                return settleCompensations(compensations);
            })
            .then(function () {
                return deactivateIdentities(identities)
            });
    }

    function getCompensations(identities) {
        var Compensation = Parse.Object.extend("Compensation");
        var debtorQuery = new Parse.Query(Compensation);
        debtorQuery.containedIn("debtor", identities);

        var creditorQuery = new Parse.Query(Compensation);
        creditorQuery.containedIn("creditor", identities);

        var mainQuery = Parse.Query.or(debtorQuery, creditorQuery);
        mainQuery.equalTo("paid", false);
        return mainQuery.find({useMasterKey: true});
    }

    function settleCompensations(compensations) {
        _.each(compensations, function (comp) {
            comp.set("paid", true);
        });

        return Parse.Object.saveAll(compensations, {useMasterKey: true});
    }

    function deactivateIdentities(identities) {
        _.each(identities, function (identity) {
            identity.set("active", false);
        });

        return Parse.Object.saveAll(identities, {useMasterKey: true});
    }
});

Parse.Cloud.afterDelete(Parse.User, function (request) {
    var user = request.object;
    var identities = user.get("identities");
    _.each(identities, function (identity) {
        identity.fetch({useMasterKey: true})
            .then(function (identity) {
                identity.set("active", false);
                var group = identity.get("group");
                var nickname = identity.get("nickname");
                return sendPushUserDeleted(nickname, group)
                    .then(function () {
                        // group beforeDelete handler will make sure that group only gets deleted if it contains no
                        // active identities
                        return group.destroy({useMasterKey: true})
                    });
            });
    });

    function sendPushUserDeleted(nickname, group) {
        return Parse.Push.send({
            channels: [group.id],
            data: {
                type: "userDeleted",
                "content-available": 1,
                groupId: group.id,
                user: nickname
            }
        }, {useMasterKey: true});
    }
});

Parse.Cloud.beforeSave("Identity", function (request, response) {
    var identity = request.object;
    if (identity.isNew()) {
        response.success();
        return;
    }

    checkFields(identity)
        .then(function () {
            response.success();
        }, function (error) {
            response.error("failed to save identity with error " + error.message);
        });

    function checkFields(identity) {
        var promises = [Parse.Promise.as()];

        if (identity.dirty("avatar")) {
            promises.push(handleAvatar());
        }

        if (identity.dirty("active")) {
            if (!identity.get("active") && !identity.get("pending")) {
                promises.push(handleIdentityInactive(identity));
            }
        }

        if (identity.dirty("pending")) {
            if (!identity.get("pending")) {
                promises.push(sendPushUserJoinedGroup(identity));
            }
        }

        return Parse.Promise.when(promises);
    }

    function handleAvatar() {
        var oldIdentity = request.original;
        var file = oldIdentity.get("avatar");
        if (file != null) {
            return deleteParseFile(file.name())
        }

        return Parse.Promise.as();
    }

    function handleIdentityInactive(identity) {
        return getUserFromIdentity(identity)
            .then(function (user) {
                var group = identity.get("group");
                return removeUserFromGroupRole(user, group.id);
            });
    }

    function removeUserFromGroupRole(user, groupId) {
        return getGroupRole(groupId)
            .then(function (groupRole) {
                if (groupRole != null) {
                    groupRole.getUsers().remove(user);
                    return groupRole.save(null, {useMasterKey: true});
                }

                return Parse.Promise.as();
            });
    }

    function sendPushUserJoinedGroup(user, identity) {
        var group = identity.get("group");
        var nickname = identity.get("nickname");
        return group.fetch({useMasterKey: true})
            .then(function (groupFetched) {
                var groupName = groupFetched.get("name");
                var pushQuery = new Parse.Query(Parse.Installation);
                pushQuery.equalTo("channels", group.id);
                pushQuery.notEqualTo("user", user);

                return Parse.Push.send({
                    where: pushQuery,
                    data: {
                        type: "userJoined",
                        "content-available": 1,
                        groupId: group.id,
                        user: nickname,
                        groupName: groupName
                    }
                }, {useMasterKey: true});
            });
    }
});

Parse.Cloud.beforeDelete("Identity", function (request, response) {
    var identity = request.object;

    getUserFromIdentity(identity)
        .then(function (user) {
            if (user != null) {
                user.remove("identities", identity);
                user.remove("archivedIdentities", identity);
                return user.save(null, {useMasterKey: true});
            }

            return Parse.Promise.as();
        })
        .then(function () {
            response.success("Successfully removed identity from user.")
        }, function (error) {
            response.error("Failed to remove identity from user with error: " + error.message);
        });
});

/**
 * Called before a group object is saved.
 *
 * If the group is saved for the first time, returns immediately with success. If not, performs multiple checks:
 *
 * If the field "name" changed, sends a silent push to all users in the group that the name of the group changed.
 * If the field "usersInvited" changed and an email address was removed, removes the user no longer invited from the
 * group role and sends a silent push to all users of the group that the object changed.
 *
 */
Parse.Cloud.beforeSave("Group", function (request, response) {
    var group = request.object;
    if (group.isNew()) {
        response.success();
        return;
    }

    checkFields()
        .then(function () {
            response.success()
        }, function (error) {
            response.error(error.message);
        });

    function checkFields() {
        if (group.dirty("name")) {
            return sendPushGroupNameChanged(group);
        }

        return Parse.Promise.as();
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
Parse.Cloud.beforeDelete("Group", function (request, response) {
    var group = request.object;

    handleGroup(group)
        .then(function () {
            response.success("Successfully deleted group")
        }, function (error) {
            response.error("Failed to delete group with error: " + error.message);
        });

    function handleGroup(group) {
        return getIdentitiesForGroup(group)
            .then(function (identities) {
                if (isGroupActive(identities)) {
                    return Parse.Promise.error({"message": "This group has active identities, can't delete!"});
                }

                return Parse.Object.destroyAll(identities, {useMasterKey: true});
            })
            .then(function () {
                return Parse.Promise.when(deleteGroupRole(group), deleteAllPurchases(group), deleteAllCompensations(group));
            });
    }

    function getIdentitiesForGroup(group) {
        var Identity = Parse.Object.extend("Identity");
        var query = new Parse.Query(Identity);
        query.equalTo("group", group);
        return query.find({useMasterKey: true});
    }

    function isGroupActive(identities) {
        return _.some(identities, function (identity) {
            return identity.get("active") && !identity.get("pending");
        });
    }

    function deleteGroupRole(group) {
        return getGroupRole(group.id)
            .then(function (groupRole) {
                if (groupRole != null) {
                    return groupRole.destroy({useMasterKey: true});
                } else {
                    return Parse.Promise.as();
                }
            });
    }

    function deleteAllPurchases(group) {
        var Purchase = Parse.Object.extend("Purchase");
        var query = new Parse.Query(Purchase);
        query.equalTo("group", group);
        return query.find({useMasterKey: true})
            .then(function (purchases) {
                if (purchases.length > 0) {
                    return Parse.Object.destroyAll(purchases, {useMasterKey: true})
                }

                return Parse.Promise.as();
            });
    }

    function deleteAllCompensations(group) {
        var Compensation = Parse.Object.extend("Compensation");
        var query = new Parse.Query(Compensation);
        query.equalTo("group", group);
        return query.find({useMasterKey: true})
            .then(function (compensations) {
                if (compensations.length > 0) {
                    return Parse.Object.destroyAll(compensations, {useMasterKey: true})
                }

                return Parse.Promise.as();
            });
    }
});

/**
 * Called after a purchase object was saved. Re-calculates the users' balances and checks if the purchase already
 * existed before. If yes, sends a silent push to the users of the group that the purchase was edited. If the purchase
 * is new, sends a push to the users of the group that a new purchase was created.
 */
Parse.Cloud.afterSave("Purchase", function (request) {
    var purchase = request.object;
    var group = purchase.get("group");
    var identities = purchase.get("identities");
    var identitiesIds = getIdsFromObjects(identities);
    var buyer = purchase.get("buyer");

    if (!_.contains(identitiesIds, buyer.id)) {
        identities.push(buyer);
        identitiesIds.push(buyer.id);
    }

    calculateAndSetBalance(group, identities)
        .then(function () {
            return calculateCompensations(group);
        })
        .then(function () {
            return purchase.existed() ? sendPushPurchaseEdited(purchase, group) : sendPushNewPurchase(purchase, buyer, group);
        });

    function sendPushPurchaseEdited(purchase, group) {
        return Parse.Push.send({
            channels: [group.id],
            data: {
                type: "purchaseEdit",
                "content-available": 1,
                purchaseId: purchase.id,
                identitiesIds: identitiesIds
            }
        }, {useMasterKey: true});
    }

    function sendPushNewPurchase(purchase, buyer, group) {
        var store = purchase.get("store");
        var totalPrice = purchase.get("totalPrice");
        if (totalPrice == null) {
            totalPrice = 0;
        }

        return Parse.Promise.when(buyer.fetch({useMasterKey: true}), group.fetch({useMasterKey: true}))
            .then(function (buyer, group) {
                var buyerNickname = buyer.get("nickname");
                var groupName = group.get("name");
                var currencyCode = group.get("currency");

                return Parse.Push.send({
                    channels: [group.id],
                    data: {
                        type: "purchaseNew",
                        "content-available": 1,
                        currencyCode: currencyCode,
                        purchaseId: purchase.id,
                        groupId: group.id,
                        buyerId: buyer.id,
                        groupName: groupName,
                        identitiesIds: identitiesIds,
                        user: buyerNickname,
                        store: store,
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
Parse.Cloud.beforeDelete("Purchase", function (request, response) {
    var purchase = request.object;
    var items = purchase.get("items");
    var receipt = purchase.get("receipt");

    deleteFile(receipt)
        .then(function () {
            return Parse.Object.destroyAll(items, {useMasterKey: true});
        })
        .then(function () {
            response.success("Successfully deleted items and ParseFile")
        }, function (error) {
            response.error("Failed to delete items and ParseFile with error: " + error.message);
        });

    function deleteFile(receipt) {
        if (receipt != null) {
            return deleteParseFile(receipt.name());
        }

        return Parse.Promise.as();
    }
});

/**
 * Called after a purchase object was saved. Adds the buyer to the users if he/ was not already included.
 * This happens when the buyer makes a purchase where non of the items affect him. Re-calculates the users'
 * balances and compensations and sends a push to the users of the group that the purchase was deleted.
 */
Parse.Cloud.afterDelete("Purchase", function (request) {
    var purchase = request.object;
    var group = purchase.get("group");
    var identities = purchase.get("identities");
    var identitiesIds = getIdsFromObjects(identities);
    var buyer = purchase.get("buyer");

    if (!_.contains(identitiesIds, buyer.id)) {
        identities.push(buyer);
        identitiesIds.push(buyer.id);
    }

    calculateAndSetBalance(group, identities)
        .then(function () {
            return calculateCompensations(group);
        })
        .then(function () {
            return sendPushPurchaseDeleted();
        });

    function sendPushPurchaseDeleted() {
        return Parse.Push.send({
            channels: [group.id],
            data: {
                type: "purchaseDelete",
                "content-available": 1,
                purchaseId: purchase.id,
                groupId: group.id,
                identitiesIds: identitiesIds
            }
        }, {useMasterKey: true});
    }
});

/**
 * Called after a compensation object was saved.
 *
 * Checks if the compensation already existed before.
 * If yes: If the compensation "paid", re-calculates the balances of the users and sends a push to the users of the
 * group.
 *
 * If no returns immediately. Will be queried by clients on reception of new purchase etc. push.
 */
Parse.Cloud.afterSave("Compensation", function (request) {
    var compensation = request.object;
    if (!compensation.existed() || !compensation.get("paid")) {
        return;
    }

    var group = compensation.get("group");
    var debtor = compensation.get("debtor");
    var creditor = compensation.get("creditor");
    var identities = [creditor, debtor];
    var amount = compensation.get("amount");
    var amountDouble = amount[0] / amount[1];

    return calculateAndSetBalance(group, identities)
        .then(function () {
            if (_.isEqual(amount, request.original.get("amount"))) {
                return sendPush(compensation.id, debtor.id, creditor, group, amountDouble, false)
            }

            return calculateCompensations(group)
                .then(function () {
                    return sendPush(compensation.id, debtor.id, creditor, group, amountDouble, true);
                });
        });


    function sendPush(compensationId, debtorId, creditor, group, amount, didCalcNew) {
        return Parse.Promise.when(creditor.fetch({useMasterKey: true}), group.fetch({useMasterKey: true}))
            .then(function (creditor, group) {
                var nicknameCreditor = creditor.get("nickname");
                var currencyCode = group.get("currency");
                return Parse.Push.send({
                    channels: [group.id],
                    data: {
                        type: "compensationExistingPaid",
                        "content-available": 1,
                        compensationId: compensationId,
                        user: nicknameCreditor,
                        debtorId: debtorId,
                        groupId: group.id,
                        currencyCode: currencyCode,
                        amount: amount,
                        didCalcNew: didCalcNew
                    }
                }, {useMasterKey: true});
            })
    }
});

/**
 * Sends a push to the user of a compensation who owes money that he should settle the debt.
 *
 * @param compensation the object id of the compensation for which to send a reminder
 * @param currencyCode the currency code to format the amount
 */
Parse.Cloud.define("pushCompensationRemind", function (request, response) {
    var compensationId = request.params.compensationId;
    var currencyCode = request.params.currencyCode;

    var Compensation = Parse.Object.extend("Compensation");
    var query = new Parse.Query(Compensation);
    query.get(compensationId, {useMasterKey: true})
        .then(function (compensation) {
            var creditor = compensation.get("creditor");
            var debtor = compensation.get("debtor");
            return Parse.Promise.when(creditor.fetch({useMasterKey: true}), getUserFromIdentity(debtor))
                .then(function (creditor, user) {
                    var amount = compensation.get("amount");
                    var amountDouble = amount[0] / amount[1];
                    var group = compensation.get("group");
                    var creditorNickname = creditor.get("nickname");

                    var pushQuery = new Parse.Query(Parse.Installation);
                    pushQuery.equalTo("user", user);
                    return Parse.Push.send({
                        where: pushQuery,
                        data: {
                            type: "compensationRemindUser",
                            "content-available": 1,
                            category: "remindUserToPay",
                            user: creditorNickname,
                            amount: amountDouble,
                            currencyCode: currencyCode,
                            groupId: group.id,
                            compensationId: compensationId
                        }
                    }, {useMasterKey: true});
                });
        })
        .then(function () {
            response.success("Push was sent successfully")
        }, function (error) {
            response.error("Push failed to send with error: " + error.message);
        });
});

/**
 * Deletes a ParseFile.
 *
 * @param fileName the file name of the ParseFile to delete
 */
Parse.Cloud.define("deleteParseFile", function (request, response) {
    var fileName = request.params.fileName;

    deleteParseFile(fileName)
        .then(function () {
            response.success("File was deleted successfully.")
        }, function (error) {
            response.error("Failed to delete file with error: " + error.message);
        });
});


/**
 * Gets all the users that have the calling user's current group in their identities an re-calculates their balances.
 */
Parse.Cloud.define("calculateBalances", function (request, response) {
    var user = request.user;
    var currentIdentity = user.get("currentIdentity");

    currentIdentity.fetch({useMasterKey: true})
        .then(function (identity) {
            var group = identity.get("group");

            var Identity = Parse.Object.extend("Identity");
            var query = new Parse.Query(Identity);
            query.equalTo("group", group);
            query.equalTo("active", true);
            return query.find({useMasterKey: true})
                .then(function (identities) {
                    return calculateAndSetBalance(group, identities);
                })
        })
        .then(function () {
            response.success("Balances were calculated successfully.")
        }, function (error) {
            response.error("Failed to calculate balances with error: " + error.message);
        });
});

Parse.Cloud.define("calculateCompensations", function (request, response) {
    var groupId = request.params.groupId;
    var groupToBalance = getGroupPointerFromId(groupId);

    calculateCompensations(groupToBalance)
        .then(function () {
            response.success("comps were calculated");
        }, function (error) {
            response.error("failed to calc comps with error " + error.message);
        });
});

Parse.Cloud.define("checkIdentity", function (request, response) {
    var user = request.user;
    var identityId = request.params.identityId;

    checkIdentity(user, identityId)
        .then(function () {
            response.success("Successfully added identity to user.")
        }, function (error) {
            response.error("Failed to add identity to user with error: " + error.message);
        });

    function checkIdentity(user, identityId) {
        var identitiesIds = getIdsFromObjects(user.get("identities"));
        if (_.contains(identitiesIds, identityId)) {
            return Parse.Promise.error({"message": "You are already in this group!"});
        }

        var identity = getIdentityPointerFromId(identityId);
        return identity.fetch({useMasterKey: true})
            .then(function (identity) {
                if (!identity.get("pending")) {
                    return Parse.Promise.error({"message": "Identity is not pending!"});
                }

                var group = identity.get("group");
                return addUserToGroupRole(user, group.id)
                    .then(function () {
                        return addIdentity(user, identity)
                    });
            })
    }

    function addUserToGroupRole(user, groupId) {
        return getGroupRole(groupId)
            .then(function (role) {
                role.getUsers().add(user);
                return role.save(null, {useMasterKey: true});
            })
    }

    function addIdentity(user, identity) {
        return user.get("currentIdentity").fetch({useMasterKey: true})
            .then(function (currentIdentity) {
                var nickname = currentIdentity.get("nickname");
                var avatar = currentIdentity.get("avatar");

                if (nickname != null) {
                    identity.set("nickname", nickname);
                }
                if (avatar != null) {
                    identity.set("avatar", avatar);
                }
                identity.set("pending", false);
                var acl = identity.getACL();
                acl.setReadAccess(user, true);
                acl.setWriteAccess(user, true);
                identity.setACL(acl);
                return identity.save(null, {useMasterKey: true});
            })
            .then(function (identity) {
                user.addUnique("identities", identity);
                user.set("currentIdentity", identity);
                return user.save(null, {useMasterKey: true});
            });
    }
});

Parse.Cloud.define("addGroup", function (request, response) {
    var user = request.user;
    var name = request.params.groupName;
    var currency = request.params.currencyCode;

    addGroup(user, name, currency)
        .then(function () {
            response.success("Successfully create new group and identity.")
        }, function (error) {
            response.error("Failed to add new group and identity with error: " + error.message);
        });
});

Parse.Cloud.define("loginWithGoogle", function (request, response) {
    var idToken = request.params.idToken;

    verifyIdToken(idToken)
        .then(function (httpResponse) {
            if (httpResponse.status != 200) {
                return Parse.Promise.error({message: "Login failed, token could not be verified."});
            }

            var token = httpResponse.data;
            if (token.aud != "982871908066-1scsmdngvfsj68t7kq5o42t35oubujme.apps.googleusercontent.com") {
                return Parse.Promise.error({message: "aud does not match"});
            }

            var googleId = token.sub;
            var email = token.email;
            return upsertGoogleUser(googleId, email);
        })
        .then(function (user) {
            response.success(user.getSessionToken());
        }, function (error) {
            response.error("idToken could not be verified with error " + error.message);
        });

    function verifyIdToken(idToken) {
        var url = "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=" + idToken;
        return Parse.Cloud.httpRequest({
            method: 'POST',
            url: url
        });
    }

    function upsertGoogleUser(googleId, email) {
        var password = getRandomPassword();
        var query = new Parse.Query(Parse.User);
        query.equalTo("googleId", googleId);
        return query.first({useMasterKey: true})
            .then(function (user) {
                if (user == null) {
                    return createNewUser(email, password, googleId);
                }

                user.set("password", password);
                return user.save(null, {useMasterKey: true});
            })
            .then(function (user) {
                return Parse.User.logIn(user.get("username"), password);
            });

        function getRandomPassword() {
            return Math.random().toString(36).slice(2);
        }

        function createNewUser(email, password, googleId) {
            var user = new Parse.User();
            user.set("username", email);
            user.set("password", password);
            user.set("googleId", googleId);

            return user.signUp();
        }
    }
});

Parse.Cloud.define("setPassword", function (request, response) {
    var username = request.params.username;
    var password = request.params.password;

    var query = new Parse.Query(Parse.User);
    query.equalTo("username", username);
    query.first({useMasterKey: true})
        .then(function (user) {
            user.set("password", password);
            return user.save(null, {useMasterKey: true});
        })
        .then(function () {
            response.success("password was set");
        }, function (error) {
            response.error("setting of password failed with error " + error.message);
        });
});

Parse.Cloud.define("cleanUpIdentities", function (request, response) {
    var query = new Parse.Query(Parse.User);
    query.include("identities");
    query.find({useMasterKey: true})
        .then(function (users) {
            var promises = [];
            _.each(users, function (user) {
                var identities = user.get("identities");
                _.each(identities, function (identity) {
                    if (!identity.get("active")) {
                        user.remove("identities", identity);
                        user.addUnique("archivedIdentities", identity);
                        promises.push(user.save(null, {useMasterKey: true}));
                    }
                })
            });

            return Parse.Promise.when(promises);
        })
        .then(function () {
            response.success("Identities were cleaned up");
        }, function (error) {
            response.error("Cleaning identities failed with error " + error.message);
        });
});

/**
 * Calculates the spending stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define("statsSpending", function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;

    calculateSpendingStats(group, year, month)
        .then(function (result) {
            response.success(JSON.stringify(result))
        }, function (error) {
            response.error("Failed with error: " + error.message);
        });
});

/**
 * Calculates the store stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define("statsStores", function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;
    var statsType = "store";

    calculateStoreOrCurrencyStats(statsType, group, year, month)
        .then(function (result) {
            response.success(JSON.stringify(result))
        }, function (error) {
            response.error("Failed with error: " + error.message);
        });
});

/**
 * Calculates the currency stats and returns them as a JSON string.
 *
 * @param groupId the object id of the group for which to calculate the stats
 * @param year the year for which to calculate the stats
 * @param month the month for which to calculate the stats
 */
Parse.Cloud.define("statsCurrencies", function (request, response) {
    var groupId = request.params.groupId;
    var group = getGroupPointerFromId(groupId);
    var year = request.params.year;
    var month = request.params.month;
    var statsType = "currency";

    calculateStoreOrCurrencyStats(statsType, group, year, month)
        .then(function (result) {
            response.success(JSON.stringify(result))
        }, function (error) {
            response.error("Failed with error: " + error.message);
        });
});

function getIdsFromObjects(objectArray) {
    var idArray = [];

    _.each(objectArray, function (object) {
        idArray.push(object.id);
    });

    return idArray;
}

function getGroupRole(groupId) {
    var roleName = getGroupRoleName(groupId);
    var roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo("name", roleName);
    return roleQuery.first({useMasterKey: true});
}

function getGroupRoleName(groupId) {
    return "groupOf_" + groupId;
}

function deleteParseFile(fileName) {
    var url = "http://localhost:3000/api/data/files/" + fileName;

    return Parse.Cloud.httpRequest({
        method: 'DELETE',
        url: url,
        headers: {
            'X-Parse-Application-Id': 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji',
            'X-Parse-Master-Key': 'TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK'
        }
    });
}

function getGroupPointerFromId(groupId) {
    var Group = Parse.Object.extend("Group");
    var group = new Group();
    group.id = groupId;
    return group;
}

function getIdentityPointerFromId(identityId) {
    var Identity = Parse.Object.extend("Identity");
    var identity = new Identity();
    identity.id = identityId;
    return identity;
}

function getUserFromIdentity(identity) {
    var activeQuery = new Parse.Query(Parse.User);
    activeQuery.equalTo("identities", identity);

    var archivedQuery = new Parse.Query(Parse.User);
    archivedQuery.equalTo("archivedIdentities", identity);

    var query = Parse.Query.or(activeQuery, archivedQuery);
    return query.first({useMasterKey: true});
}

function addGroup(user, name, currency) {
    return createGroup(name, currency)
        .then(function (group) {
            return createGroupRole(group, user)
                .then(function () {
                    return setGroupAcl(group)
                })
        })
        .then(function (group) {
            return getCurrentIdentity(user)
                .then(function (currentIdentity) {
                    if (currentIdentity != null) {
                        var nickname = currentIdentity.get("nickname");
                        var avatar = currentIdentity.get("avatar");
                        return createIdentity(user, group, nickname, avatar);
                    }

                    return createIdentity(user, group);
                })
        })
        .then(function (identity) {
            return setIdentity(user, identity);
        });

    function createGroup(name, currency) {
        var Group = Parse.Object.extend("Group");
        var group = new Group();
        group.set("name", name);
        group.set("currency", currency);
        return group.save(null, {useMasterKey: true});
    }

    function createGroupRole(group, user) {
        var roleName = getGroupRoleName(group.id);
        var role = new Parse.Role(roleName, new Parse.ACL());
        return role.save(null, {useMasterKey: true})
            .then(function (role) {
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
        var identity = user.get("currentIdentity");
        if (identity != null) {
            return identity.fetch({useMasterKey: true});
        }

        return Parse.Promise.as();
    }

    function createIdentity(user, group, nickname, avatar) {
        var Identity = Parse.Object.extend("Identity");
        var identity = new Identity();

        // set values
        identity.set("group", group);
        identity.set("active", true);
        identity.set("pending", false);
        if (nickname != null) {
            identity.set("nickname", nickname);
        } else {
            identity.set("nickname", "");
        }
        if (avatar != null) {
            identity.set("avatar", avatar);
        }

        // set ACL
        var acl = new Parse.ACL(user);
        acl.setRoleReadAccess(getGroupRoleName(group.id), true);
        identity.setACL(acl);

        return identity.save(null, {useMasterKey: true});
    }

    function setIdentity(user, identity) {
        user.addUnique("identities", identity);
        user.set("currentIdentity", identity);
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
    var Purchase = Parse.Object.extend("Purchase");
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo("group", group);
    purchaseQuery.include("items");

    // create query for compensations
    var Compensation = Parse.Object.extend("Compensation");
    var compensationQuery = new Parse.Query(Compensation);
    compensationQuery.equalTo("group", group);
    compensationQuery.equalTo("paid", true);

    // wait for them all to complete
    // result order will match the order passed to when()
    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), compensationQuery.find({useMasterKey: true}))
        .then(function (purchases, compensations) {
            return calculateBalance(purchases, identities, compensations);
        });

    function calculateBalance(purchases, identities, compensations) {
        var promise = Parse.Promise.as();

        _.each(identities, function (identity) {
            promise = promise
                .then(function () {
                    var balance = new Fraction(0);

                    _.each(compensations, function (compensation) {
                        balance = balance.add(calculateBalanceCompensations(compensation, identity));
                    });

                    _.each(purchases, function (purchase) {
                        balance = balance.add(calculateBalancePurchases(purchase, identity));
                    });

                    return setBalance(balance, identity);
                });
        });

        return promise;

        function calculateBalanceCompensations(compensation, identity) {
            var balance = new Fraction(0);

            var debtor = compensation.get("debtor");
            var creditor = compensation.get("creditor");
            var amountArray = compensation.get("amount");
            var amount = new Fraction(amountArray[0], amountArray[1]);

            if (debtor.id == identity.id) {
                balance = balance.add(amount);
            } else if (creditor.id == identity.id) {
                balance = balance.sub(amount);
            }

            return balance;
        }

        function calculateBalancePurchases(purchase, identity) {
            var balance = new Fraction(0);
            var buyer = purchase.get("buyer");
            var items = purchase.get("items");

            _.each(items, function (item) {
                var price = new Fraction(item.get("price"));
                var identities = item.get("identities");
                var identitiesId = getIdsFromObjects(identities);
                var identitiesSize = identities.length;

                if (buyer.id == identity.id) {
                    if (_.contains(identitiesId, identity.id)) {
                        balance = balance.add(price.sub(price.div(identitiesSize)));
                    } else {
                        balance = balance.add(price);
                    }
                } else if (_.contains(identitiesId, identity.id)) {
                    balance = balance.sub(price.div(identitiesSize));
                }
            });

            return balance;
        }

        function setBalance(balance, identity) {
            // get numerator and denominator
            var balanceNum = balance.n * balance.s;
            var balanceDen = balance.d;
            var balanceArray = [balanceNum, balanceDen];

            identity.set("balance", balanceArray);
            return identity.save(null, {useMasterKey: true});
        }
    }
}

function calculateCompensations(group) {
    return Parse.Promise.when(deleteUnpaidCompensations(), getIdentityBalances())
        .then(function (deleteResult, identityBalances) {
            var newComps = getNewCompensations(identityBalances);
            return Parse.Object.saveAll(newComps);
        });

    function deleteUnpaidCompensations() {
        var Compensation = Parse.Object.extend("Compensation");
        var query = new Parse.Query(Compensation);
        query.equalTo("group", group);
        query.equalTo("paid", false);
        return query.find({useMasterKey: true})
            .then(function (comps) {
                if (comps.length > 0) {
                    return Parse.Object.destroyAll(comps, {useMasterKey: true})
                } else {
                    return Parse.Promise.as();
                }
            });
    }

    function getIdentityBalances() {
        var Identity = Parse.Object.extend("Identity");
        var query = new Parse.Query(Identity);
        query.equalTo("group", group);
        return query.find({useMasterKey: true})
            .then(function (identities) {
                var identityBalances = [];

                _.each(identities, function (identity) {
                    var balance = getBalanceFraction(identity);
                    var balanceObject = {identity: identity, balance: balance};
                    identityBalances.push(balanceObject);
                });

                return identityBalances.sort(sortBalances);
            });
    }

    function getBalanceFraction(identity) {
        var balance = identity.get("balance");
        if (_.isEmpty(balance)) {
            return new Fraction(0, 1);
        }
        return new Fraction(balance[0], balance[1]);
    }

    function sortBalances(a, b) {
        var aFraction = a.balance;
        var bFraction = b.balance;

        return bFraction.compare(aFraction);
    }

    function getNewCompensations(identityBalances) {
        var compensationsNew = [];

        var topBalance = _.first(identityBalances);
        var bottomBalance = _.last(identityBalances);
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
                if (topBalanceValue.equals(0)) {
                    identityBalances = _.without(identityBalances, bottomBalance, topBalance);
                } else {
                    identityBalances = _.without(identityBalances, bottomBalance);
                }
            } else {
                // biggest minus value is bigger than biggest plus value, hence can fully compensate it
                bottomBalanceValue = bottomBalanceValue.add(topBalanceValue);
                bottomBalance.balance = bottomBalanceValue;
                compensation = createNewCompensation(bottomBalance.identity, topBalance.identity, topBalanceValue);
                identityBalances = _.without(identityBalances, topBalance);
                identityBalances.sort(sortBalances);
            }
            compensationsNew.push(compensation);

            if (!_.isEmpty(identityBalances)) {
                topBalance = _.first(identityBalances);
                bottomBalance = _.last(identityBalances);
                topBalanceValue = topBalance.balance;
                bottomBalanceValue = bottomBalance.balance;
            } else {
                topBalanceValue = new Fraction(0);
                bottomBalanceValue = new Fraction(0);
            }
        }

        function createNewCompensation(debtor, creditor, amount) {
            var Compensation = Parse.Object.extend("Compensation");
            var compensation = new Compensation();

            compensation.set("group", group);
            compensation.set("debtor", debtor);
            compensation.set("creditor", creditor);
            compensation.set("paid", false);

            var amountNum = amount.n * amount.s;
            var amountDen = amount.d;
            var amountArray = [amountNum, amountDen];
            compensation.set("amount", amountArray);
            compensation.setACL(acl);

            return compensation;
        }
    }
}

function calculateSpendingStats(group, year, month) {
    // create query for Purchases
    var Purchase = Parse.Object.extend("Purchase");
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.equalTo("group", group);
    var firstOfMonthInYear = getFirstOfMonthInYear(year, month);
    purchaseQuery.greaterThanOrEqualTo("date", firstOfMonthInYear);
    purchaseQuery.lessThanOrEqualTo("date", getLastOfMonthInYear(year, month));

    // create query for Identities
    var Identity = Parse.Object.extend("Identity");
    var identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo("group", group);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then(function (purchases, identities) {
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

        _.each(purchases, function (purchase) {
            var createdAt = purchase.get("date");
            var month = createdAt.getMonth();
            purchasesYear[month].push(purchase);
        });

        return purchasesYear;
    }

    function sortPurchasesByDay(purchases, daysInMonth) {
        var purchasesMonth = {};

        for (var i = 0; i < daysInMonth; i++) {
            purchasesMonth[i] = [];
        }

        _.each(purchases, function (purchase) {
            var createdAt = purchase.get("date");
            var day = createdAt.getDate() - 1; // use 0 based numbering as with months
            purchasesMonth[day].push(purchase);
        });

        return purchasesMonth;
    }

    function getDaysInMonth(anyDateInMonth) {
        var date = new Date(anyDateInMonth.getYear(), anyDateInMonth.getMonth() + 1, 0);
        return date.getDate();
    }
}


function getFirstOfMonthInYear(year, month) {
    if (month != null) {
        return new Date(year, month, 1);
    } else {
        return new Date(year, 0, 1);
    }
}

function getLastOfMonthInYear(year, month) {
    if (month != null) {
        return new Date(year, month, 31, 23, 59, 59);
    } else {
        return new Date(year, 11, 31, 23, 59, 59);
    }
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
            _.each(purchasesByType[type], function (purchase) {
                totalPrice += purchase.get("totalPrice");
            });
            unit.total = totalPrice;

            var numberOfPurchases = _.size(purchasesByType[type]);
            unit.average = getAveragePrice(numberOfPurchases, totalPrice);

            group.units.push(unit);
        }
    }

    return group;
}

function calculateStatsForIdentities(purchasesByType, identities) {
    var members = [];

    _.each(identities, function (identity) {
        var member = {};
        member.memberId = identity.id;
        member.units = [];

        for (var type in purchasesByType) {
            if (purchasesByType.hasOwnProperty(type)) {
                var unit = {};
                unit.identifier = type;

                var totalPrice = 0;
                _.each(purchasesByType[type], function (purchase) {
                    var buyer = purchase.get("buyer");
                    if (buyer.id == identity.id) {
                        totalPrice += purchase.get("totalPrice");
                    }
                });
                unit.total = totalPrice;

                var numberOfPurchases = _.size(purchasesByType[type]);
                unit.average = getAveragePrice(numberOfPurchases, totalPrice);

                member.units.push(unit);
            }
        }

        members.push(member);
    });

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
    var Purchase = Parse.Object.extend("Purchase");
    var purchaseQuery = new Parse.Query(Purchase);
    purchaseQuery.limit(1000);
    purchaseQuery.equalTo("group", group);
    purchaseQuery.greaterThanOrEqualTo("date", getFirstOfMonthInYear(year, month));
    purchaseQuery.lessThanOrEqualTo("date", getLastOfMonthInYear(year, month));

    // create query for Identities
    var Identity = Parse.Object.extend("Identity");
    var identityQuery = new Parse.Query(Identity);
    identityQuery.equalTo("group", group);

    return Parse.Promise.when(purchaseQuery.find({useMasterKey: true}), identityQuery.find({useMasterKey: true}))
        .then(function (purchases, identities) {
            var results = {};

            var purchasesByType = sortPurchasesByType(purchases, statsType);
            results.numberOfUnits = _.size(purchasesByType);
            results.group = calculateStatsForGroup(purchasesByType, group);
            results.members = calculateStatsForIdentities(purchasesByType, identities);

            return results;
        });

    function sortPurchasesByType(purchases, statsType) {
        var purchasesTypes = {};

        _.each(purchases, function (purchase) {
            var type = purchase.get(statsType);
            if (purchasesTypes[type] == null) {
                purchasesTypes[type] = [];
            }
            purchasesTypes[type].push(purchase);
        });

        return purchasesTypes;
    }
}
