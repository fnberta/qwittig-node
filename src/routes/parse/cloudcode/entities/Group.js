/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'Group';
export const NAME = 'name';
export const CURRENCY = 'currency';

export default class Group extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get name() {
        return this.get(NAME)
    }

    set name(name) {
        this.set(NAME, name)
    }
    
    get currency() {
        return this.get(CURRENCY)
    }
    
    set currency(currency) {
        this.set(CURRENCY, currency)
    }
}