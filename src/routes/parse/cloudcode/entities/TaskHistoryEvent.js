/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'TaskHistoryEvent';
export const TASK = 'task';
export const IDENTITY = 'identity';

export default class TaskHistoryEvent extends Parse.Object {
    constructor() {
        super(CLASS);
    }
    
    get task() {
        return this.get(TASK)
    }
    
    set task(task) {
        this.set(TASK, task)
    }

    get identity() {
        return this.get(IDENTITY)
    }

    set identity(identity) {
        this.set(IDENTITY, identity)
    }
}
