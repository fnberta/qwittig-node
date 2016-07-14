/**
 * Created by fabio on 18.04.16.
 */

export const CLASS = 'OcrRating';
export const USER = 'user';
export const SATISFACTION = 'satisfaction';
export const NAMES = 'names';
export const PRICES = 'prices';
export const MISSING_ARTICLES = 'missingArticles';
export const SPEED = 'speed';
export const OCR_DATA = 'ocrData';

export default class OcrRating extends Parse.Object {
    constructor() {
        super(CLASS);
    }

    get user() {
        return this.get(USER);
    }

    set user(user) {
        this.set(USER, user);
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

    get ocrData() {
        return this.get(OCR_DATA);
    }

    set ocrData(ocrData) {
        this.set(OCR_DATA, ocrData);
    }
}
