/**
 * Created by fabio on 18.04.16.
 */

const Fraction = require('fraction.js');
import {isEmpty} from 'lodash';

export const CLASS = 'Identity';
export const ACTIVE = 'active';
export const PENDING = 'pending';
export const GROUP = 'group';
export const NICKNAME = 'nickname';
export const AVATAR = 'avatar';
export const BALANCE = 'balance';
export const INVITATION_LINK = 'invitationLink';

export default class Identity extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get active() {
        return this.get(ACTIVE);
    }

    set active(active) {
        this.set(ACTIVE, active);
    }

    get pending() {
        return this.get(PENDING);
    }

    set pending(pending) {
        this.set(PENDING, pending);
        if (!pending) {
            this.unset(INVITATION_LINK);
        }
    }

    get group() {
        return this.get(GROUP);
    }

    set group(group) {
        this.set(GROUP, group);
    }

    get nickname() {
        return this.get(NICKNAME);
    }

    set nickname(nickname) {
        this.set(NICKNAME, nickname);
    }

    get avatar() {
        return this.get(AVATAR);
    }

    set avatar(avatar) {
        this.set(AVATAR, avatar);
    }

    get balance() {
        const balance = this.get(BALANCE);
        return isEmpty(balance) ? new Fraction(0, 1) : new Fraction(balance[0], balance[1]);
    }

    set balance(balance) {
        this.set(BALANCE, balance);
    }
}
