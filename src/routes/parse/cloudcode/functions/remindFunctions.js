/**
 * Created by fabio on 09.05.16.
 */

import {getCompPointerFromId, getUserFromIdentity, getTaskPointerFromId} from '../utils'

export function remindComp(request, response) {
    const compensationId = request.params.compensationId;
    const currencyCode = request.params.currencyCode;

    const comp = getCompPointerFromId(compensationId);
    comp.fetch({useMasterKey: true})
        .then(comp => sendCompRemindPush(comp, currencyCode))
        .then(() => response.success('Push was sent successfully'))
        .catch(err => response.error('Push failed to send with error: ' + err.message));
}

function sendCompRemindPush(compensation, currencyCode) {
    return Parse.Promise.when(compensation.creditor.fetch({useMasterKey: true}), getUserFromIdentity(compensation.debtor))
        .then((creditor, user) => {
            const pushQuery = new Parse.Query(Parse.Installation);
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
                    compensationId: compensation.id
                }
            }, {useMasterKey: true});
        });
}

export function remindTask(request, response) {
    const reminder = request.user;
    const taskId = request.params.taskId;

    const task = getTaskPointerFromId(taskId);
    Parse.Promise.when(task.fetch({useMasterKey: true}), reminder.get('currentIdentity').fetch({useMasterKey: true}))
        .then((task, identity) => sendTaskRemindPush(task, identity))
        .then(() => response.success('Push was sent successfully'))
        .catch(err => response.error('Push failed to send with error: ' + err.message));
}

function sendTaskRemindPush(task, reminderIdentity) {
    const responsible = task.identities[0];
    getUserFromIdentity(responsible)
        .then(user => {
            const pushQuery = new Parse.Query(Parse.Installation);
            pushQuery.equalTo('user', user);
            return Parse.Push.send({
                where: pushQuery,
                data: {
                    type: "taskRemindUser",
                    "content-available": 1,
                    sound: "default",
                    user: reminderIdentity.nickname,
                    taskTitle: task.title,
                    groupId: task.group.id,
                    taskId: task.id
                }
            });
        });
}