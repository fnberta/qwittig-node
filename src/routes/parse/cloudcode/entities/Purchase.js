/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'Purchase';
export const BUYER = 'buyer';
export const GROUP = 'group';
export const DATE = 'date';
export const STORE = 'store';
export const ITEMS = 'items';
export const TOTAL_PRICE = 'totalPrice';
export const IDENTITIES = 'identities';
export const CURRENCY = 'currency';
export const EXCHANGE_RATE = 'exchangeRate';
export const READ_BY = 'readBy';
export const RECEIPT = 'receipt';
export const NOTE = 'note';

export default class Purchase extends Parse.Object {
    constructor() {
        super(CLASS);
    }
    
    get buyer() {
        return this.get(BUYER)
    }   
    
    set buyer(buyer) {
        this.set(BUYER, buyer)
    }
    
    get group() {
        return this.get(GROUP)
    }
    
    set group(group) {
        this.set(GROUP, group)
    }
    
    get date() {
        return this.get(DATE)
    }
    
    set date(date) {
        this.set(DATE, date)
    }
    
    get store() {
        return this.get(STORE)
    }
    
    set store(store) {
        this.set(STORE, store)
    }

    get items() {
        return this.get(ITEMS)
    }

    set items(items) {
        this.set(ITEMS, items)
    }

    get totalPrice() {
        return this.get(TOTAL_PRICE)
    }

    set totalPrice(totalPrice) {
        this.set(TOTAL_PRICE, totalPrice)
    }

    get identities() {
        return this.get(IDENTITIES)
    }

    set identities(identities) {
        this.set(IDENTITIES, identities)
    }

    get currency() {
        return this.get(CURRENCY)
    }

    set currency(currency) {
        this.set(CURRENCY, currency)
    }

    get exchangeRate() {
        return this.get(EXCHANGE_RATE)
    }

    set exchangeRate(exchangeRate) {
        this.set(EXCHANGE_RATE, exchangeRate)
    }

    get readBy() {
        return this.get(READ_BY)
    }

    set readBy(readBy) {
        this.set(READ_BY, readBy)
    }

    get receipt() {
        return this.get(RECEIPT)
    }

    set receipt(receipt) {
        this.set(RECEIPT, receipt)
    }

    get note() {
        return this.get(NOTE)
    }

    set note(note) {
        this.set(NOTE, note)
    }
    
    getIdentitiesIds() {
        return this.identities.map(identity => identity.id)
    }
}
