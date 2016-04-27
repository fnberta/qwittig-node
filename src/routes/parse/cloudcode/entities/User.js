/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'User';
export const NAME = 'username';
export const PASSWORD = 'password';
export const IDENTITIES = 'identities';
export const ARCHIVED_IDENTITIES = 'archivedIdentities';
export const CURRENT_IDENTITY = 'currentIdentity';
export const GOOGLE_ID = 'googleId';

export default class User extends Parse.User {
    constructor() {
        super(CLASS);
    }

    get name() {
        return this.get(NAME);
    }

    set name(name) {
        this.set(NAME, name);
    }

    set password(password) {
        this.set(PASSWORD, password);
    }

    get identities() {
        return this.get(IDENTITIES);
    }

    set identities(identities) {
        this.set(IDENTITIES, identities);
    }
    
    addIdentity(identity) {
        this.addUnique(IDENTITIES, identity);
    }
    
    removeIdentity() {
        this.remove(IDENTITIES, identity);
        this.remove(ARCHIVED_IDENTITIES, identity);
    }

    get archivedIdentities() {
        return this.get(ARCHIVED_IDENTITIES);
    }

    set archivedIdentities(archivedIdentities) {
        this.set(ARCHIVED_IDENTITIES, archivedIdentities);
    }

    addArchivedIdentity(identity) {
        this.addUnique(ARCHIVED_IDENTITIES, identity);
    }

    get currentIdentity() {
        return this.get(CURRENT_IDENTITY);
    }

    set currentIdentity(currentIdentity) {
        this.set(CURRENT_IDENTITY, currentIdentity);
    }
    
    removeCurrentIdentity() {
        this.unset(CURRENT_IDENTITY);
    }

    get googleId() {
        return this.get(GOOGLE_ID);
    }

    set googleId(googleId) {
        this.set(GOOGLE_ID, googleId);
    }
}
