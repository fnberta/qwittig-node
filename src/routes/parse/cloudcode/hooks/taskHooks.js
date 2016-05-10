/**
 * Created by fabio on 09.05.16.
 */

import TaskHistory from '../entities/TaskHistoryEvent';
import {isEmpty} from 'lodash';

/**
 * Called after a task object was saved. Checks whether the task already existed before. If yes, sends a silent push to
 * all users involved of the task that the task changed. If no, sends a push to all users in the group that a new task
 * was created.
 */
export function afterSave(request) {
    const task = request.object;
    if (task.existed()) {
        sendPushTaskEdited(task);
    } else {
        sendPushNewTask(task);
    }
}

function sendPushTaskEdited(task) {
    const identitiesIds = task.getIdentitiesIds();
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
    const identitiesIds = task.getIdentitiesIds();
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

export function beforeDelete(request, response) {
    const task = request.object;

    deleteHistoryEvents(task)
        .then(() => response.success())
        .catch(err => response.error('Failed to delete task and its history events with error: ' + err.message));
}

function deleteHistoryEvents(task) {
    const query = new Parse.Query(TaskHistory);
    query.equalTo('task', task);
    return query.find({useMasterKey: true})
        .then(events => !isEmpty(events)
            ? Parse.Object.destroyAll(events, {useMasterKey: true})
            : Parse.Promise.as());
}

/**
 * Called after a task object was deleted. Sends a push to the users of the users involved of the task that it was
 * deleted.
 */
export function afterDelete(request) {
    const task = request.object;
    const user = request.user;
    
    sendPushDeleted(task, user);
}

function sendPushDeleted(task, user) {
    const identitiesIds = task.getIdentitiesIds();
    const deleteIdentity = user != null ? user.get('currentIdentity') : task.initiator;
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

export function afterSaveHistory(request) {
    const event = request.object;
    
    sendPushNewEvent(event);
}

function sendPushNewEvent(event) {
    return Parse.Promise.when(event.task.fetch({useMasterKey: true}), event.identity.fetch({useMasterKey: true}))
        .then((task, identity) => {
            const identitiesIds = task.getIdentitiesIds();
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
