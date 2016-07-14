/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'OcrData';
export const USER = 'user';
export const DATA = 'data';
export const RECEIPT = 'receipt';

export default class OcrData extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get user() {
        return this.get(USER);
    }

    set user(user) {
        this.set(USER, user);
    }

    get data() {
        return this.get(DATA);
    }

    set data(data) {
        this.set(DATA, data);
    }

    get receipt() {
        return this.get(RECEIPT);
    }

    set receipt(receipt) {
        this.set(RECEIPT, receipt);
    }
}
