/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'Item';
export const NAME = 'name';
export const PRICE = 'price';
export const IDENTITIES = 'identities';

export default class Item extends Parse.Object {
    constructor() {
        super(CLASS);
    }
    
    get name() {
        return this.get(NAME)
    }   
    
    set name(name) {
        this.set(NAME, name)
    }
    
    get price() {
        return this.get(PRICE)
    }
    
    set price(price) {
        this.set(PRICE, price)
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
