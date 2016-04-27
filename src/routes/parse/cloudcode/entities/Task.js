/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'Task';
export const TITLE = 'title';
export const GROUP = 'group';
export const TIME_FRAME = 'timeFrame';
export const INITIATOR = 'initiator';
export const IDENTITIES = 'identities';

export default class Task extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get title() {
        return this.get(TITLE)
    }

    set title(title) {
        this.set(TITLE, title)
    }

    get group() {
        return this.get(GROUP)
    }

    set group(group) {
        this.set(GROUP, group)
    }

    get initiator() {
        return this.get(INITIATOR)
    }

    set initiator(initiator) {
        this.set(INITIATOR, initiator)
    }

    get timeFrame() {
        return this.get(TIME_FRAME)
    }

    set timeFrame(timeFrame) {
        this.set(TIME_FRAME, timeFrame)
    }

    get identities() {
        return this.get(IDENTITIES)
    }

    set identities(identities) {
        this.set(IDENTITIES, identities)
    }

    getIdentitiesIds() {
        return this.identities.map(identity => identity.id)
    }
}
