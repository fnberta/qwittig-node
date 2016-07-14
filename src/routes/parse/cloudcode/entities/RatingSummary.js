/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'RatingSummary';
export const USER = 'user';
export const USERNAME = 'username';
export const SATISFACTION = 'satisfaction';
export const NAMES = 'names';
export const PRICES = 'prices';
export const MISSING_ARTICLES = 'missingArticles';
export const SPEED = 'speed';

export default class RatingSummary extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get user() {
        return this.get(USER);
    }

    set user(user) {
        this.set(USER, user);
    }

    get username() {
        return this.get(USERNAME);
    }

    set username(username) {
        this.set(USERNAME, username);
    }

    get satisfaction() {
        return this.get(SATISFACTION);
    }

    set satisfaction(satisfaction) {
        this.set(SATISFACTION, satisfaction);
    }

    get names() {
        return this.get(NAMES);
    }

    set names(names) {
        this.set(NAMES, names);
    }

    get prices() {
        return this.get(PRICES);
    }

    set prices(prices) {
        this.set(PRICES, prices);
    }

    get missingArticles() {
        return this.get(MISSING_ARTICLES);
    }

    set missingArticles(missingArticles) {
        this.set(MISSING_ARTICLES, missingArticles);
    }

    get speed() {
        return this.get(SPEED);
    }

    set speed(speed) {
        this.set(SPEED, speed);
    }
}
