/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'Compensation';
export const GROUP = 'group';
export const CREDITOR = 'creditor';
export const DEBTOR = 'debtor';
export const AMOUNT = 'amount';
export const PAID = 'paid';

export default class Compensation extends Parse.Object {

    constructor() {
        super(CLASS);
    }

    get group() {
        return this.get(GROUP);
    }

    set group(group) {
        this.set(GROUP, group);
    }

    get creditor() {
        return this.get(CREDITOR);
    }

    set creditor(creditor) {
        this.set(CREDITOR, creditor);
    }

    get debtor() {
        return this.get(DEBTOR);
    }

    set debtor(debtor) {
        this.set(DEBTOR, debtor);
    }
    
    get amount() {
        const amount = this.get(AMOUNT);
        return amount[0] / amount[1];
    }
    
    set amount(amount) {
        this.set(AMOUNT, amount);
    }

    get paid() {
        return this.get(PAID);
    }

    set paid(paid) {
        this.set(PAID, paid);
    }
}
