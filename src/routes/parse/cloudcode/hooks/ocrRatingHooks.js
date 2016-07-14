import RatingSummary from '../entities/RatingSummary';
import OcrRating from '../entities/OcrRating';
import {isEmpty} from 'lodash';

export function beforeSave(request, response) {
    const ocrRating = request.object;
    if (!ocrRating.isNew() || ocrRating.user != null) {
        response.success();
        return;
    }

    addUserFromOcrData(ocrRating)
        .then(() => response.success())
        .catch(err => {
            console.error('Failed to add user from ocrData with error: ' + err);
            response.error('Failed to add user from ocrData with error: ' + err.message)
        });
}

function addUserFromOcrData(ocrRating) {
    return ocrRating.ocrData.fetch({useMasterKey: true})
        .then(ocrData => {
            ocrRating.user = ocrData.user;
            return ocrRating.save(null, {useMasterKey: true});
        })
}

export function afterSave(request) {
    const ocrRating = request.object;
    const user = ocrRating.user;
    deleteOldRatingSummaries(user)
        .then(() => getOcrRatings(user))
        .then(ocrRatings => saveRatingSummary(user, ocrRatings))
        .catch(err => console.error('failed to create rating summary with error: ', err))
}

function deleteOldRatingSummaries(user) {
    const query = new Parse.Query(RatingSummary);
    query.equalTo('user', user);
    return query.find({useMasterKey: true})
        .then(ratingSummaries => !isEmpty(ratingSummaries)
            ? Parse.Object.destroyAll(ratingSummaries, {useMasterKey: true})
            : Parse.Promise.as());
}

function getOcrRatings(user) {
    const query = new Parse.Query(OcrRating);
    query.equalTo('user', user);
    return Parse.Promise.when(query.find({useMasterKey: true}));
}

function saveRatingSummary(user, ocrRatings) {
    return user.fetch({useMasterKey: true})
        .then(user => {
            const ratingSummary = new RatingSummary();
            ratingSummary.user = user;
            ratingSummary.username = user.get('username');

            let satisfaction = 0, names = 0, prices = 0, missingArticles = 0, speed = 0;
            let saCount = 0, naCount = 0, prCount = 0, miCount = 0, spCount = 0;
            for (let ocrRating of ocrRatings) {
                if (ocrRating.satisfaction) {
                    satisfaction += ocrRating.satisfaction;
                    saCount++;
                }
                if (ocrRating.names) {
                    names += ocrRating.names;
                    naCount++;
                }
                if (ocrRating.prices) {
                    prices += ocrRating.prices;
                    prCount++;
                }
                if (ocrRating.missingArticles) {
                    missingArticles += ocrRating.missingArticles;
                    miCount++;
                }
                if (ocrRating.speed) {
                    speed += ocrRating.speed;
                    spCount++;
                }
            }
            ratingSummary.satisfaction = saCount > 0 ? satisfaction / saCount : 0;
            ratingSummary.names = naCount > 0 ? names / naCount : 0;
            ratingSummary.prices = prCount > 0 ? prices / prCount : 0;
            ratingSummary.missingArticles = miCount > 0 ? missingArticles / miCount : 0;
            ratingSummary.speed = spCount > 0 ? speed / spCount : 0;

            return ratingSummary.save(null, {useMasterKey: true});
        });
}