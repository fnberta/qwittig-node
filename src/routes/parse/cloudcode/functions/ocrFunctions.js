import OcrRating from '../entities/OcrRating';
import {USER} from '../entities/OcrRating';


export function setOcrRatingUserFromOcrData(request, response) {
    findOcrRatings()
        .then(() => response.success('Users were set for all OcrRatings'))
        .catch(err => {
            console.error('Failed to set users for OrcRatings with error:', err);
            response.error('Failed to set users for OrcRatings with error: ' + err.message);
        });
}

function findOcrRatings() {
    const query = new Parse.Query(OcrRating);
    // query.doesNotExist(USER);
    return query.find({useMasterKey: true})
        .then(ocrRatings => setUser(ocrRatings));
}

function setUser(ocrRatings) {
    return ocrRatings.map(ocrRating => {
        return ocrRating.ocrData.fetch({useMasterKey: true})
            .then(ocrData => {
                ocrRating.user = ocrData.user;
                return ocrRating.save(null, {useMasterKey: true});
            });
    });
}