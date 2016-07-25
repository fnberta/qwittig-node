import RatingSummary from '../entities/RatingSummary';
import OcrRating from '../entities/OcrRating';

export function afterSave(request) {
    const ratingSummary = request.object;
    if (ratingSummary.username == 'OVERALL_AVERAGE') {
        return;
    }

    getOcrRatings()
        .then(ocrRatings => calcOverallAverage(ocrRatings))
        .catch(err => console.error('failed to calculate and set overall average with error:', err));
}

function getOcrRatings() {
    const query = new Parse.Query(OcrRating);
    return query.find({useMasterKey: true});
}

function calcOverallAverage(ocrRatings) {
    const query = new Parse.Query(RatingSummary);
    query.equalTo('username', 'OVERALL_AVERAGE');
    return query.first({useMasterKey: true})
        .then(overallRating => {
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

            if (!overallRating) {
                overallRating = new RatingSummary();
                overallRating.username = 'OVERALL_AVERAGE';
            }
            if (saCount > 0) {
                overallRating.satisfaction = satisfaction / saCount;
                overallRating.satisfactionCount = saCount;
            } else {
                overallRating.satisfaction = 0;
                overallRating.satisfactionCount = 0;
            }
            if (naCount > 0) {
                overallRating.names = names / naCount;
                overallRating.improvementCount = naCount;
            } else {
                overallRating.names = 0;
                overallRating.improvementCount = 0;
            }
            overallRating.prices = prCount > 0 ? prices / prCount : 0;
            overallRating.missingArticles = miCount > 0 ? missingArticles / miCount : 0;
            overallRating.speed = spCount > 0 ? speed / spCount : 0;

            return overallRating.save(null, {useMasterKey: true});
        });
}