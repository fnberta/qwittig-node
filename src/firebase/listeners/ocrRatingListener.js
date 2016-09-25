/**
 * Created by fabio on 25.07.16.
 */

import { db, TIMESTAMP } from '../main';

export default function ocrRatingListener() {
  const now = new Date().getTime();
  const ref = db.ref('ocrRatings').orderByChild('createdAt').startAt(now);
  ref.on('child_added', (snapshot) => {
    onOcrRatingAdded(snapshot);
  });
}

async function onOcrRatingAdded(snapshot) {
  const ocrRating = snapshot.val();
  try {
    await deleteOldSummaries(ocrRating.user);
    const summary = await createNewSummary(ocrRating.user);
    await db.ref('ocrSummaries').push().set(summary);
  } catch (e) {
    console.error('Failed to calculate rating summaries with error:', e);
  }
}

async function deleteOldSummaries(user) {
  const ref = db.ref('ocrSummaries').orderByChild('user').equalTo(user);
  const summariesSnap = await ref.once('value');
  if (summariesSnap.hasChildren()) {
    const summaryIds = summariesSnap.val();
    await Promise.all(Object.keys(summaryIds).map((summaryId) => db.ref('ocrSummaries').child(summaryId).remove()));
  }
}

async function createNewSummary(user) {
  const ref = db.ref('ocrRatings').orderByChild('user').equalTo(user);
  const ratingsSnap = await ref.once('value');

  let satisfaction = 0;
  let names = 0;
  let prices = 0;
  let missingArticles = 0;
  let speed = 0;
  let saCount = 0;
  let naCount = 0;
  let prCount = 0;
  let miCount = 0;
  let spCount = 0;

  ratingsSnap.forEach((child) => {
    const rating = child.val();
    if (rating.satisfaction) {
      satisfaction += rating.satisfaction;
      saCount++;
    }
    if (rating.names) {
      names += rating.names;
      naCount++;
    }
    if (rating.prices) {
      prices += rating.prices;
      prCount++;
    }
    if (rating.missingArticles) {
      missingArticles += rating.missingArticles;
      miCount++;
    }
    if (rating.speed) {
      speed += rating.speed;
      spCount++;
    }
  });

  const summary = {
    createdAt: TIMESTAMP,
    user,
  };
  if (saCount > 0) {
    summary.satisfaction = satisfaction / saCount;
    summary.satisfactionCount = saCount;
  } else {
    summary.satisfaction = 0;
    summary.satisfactionCount = 0;
  }
  if (naCount > 0) {
    summary.names = names / naCount;
    summary.improvementCount = naCount;
  } else {
    summary.names = 0;
    summary.improvementCount = 0;
  }
  summary.prices = prCount > 0 ? prices / prCount : 0;
  summary.missingArticles = miCount > 0 ? missingArticles / miCount : 0;
  summary.speed = spCount > 0 ? speed / spCount : 0;

  return summary;
}

// function calcOverallAverage(ocrRatings) {
//   const query = new Parse.Query(RatingSummary);
//   query.equalTo('username', 'OVERALL_AVERAGE');
//   return query.first({ useMasterKey: true })
//     .then(overallRating => {
//       let satisfaction = 0, names = 0, prices = 0, missingArticles = 0, speed = 0;
//       let saCount = 0, naCount = 0, prCount = 0, miCount = 0, spCount = 0;
//       for (let ocrRating of ocrRatings) {
//         if (ocrRating.satisfaction) {
//           satisfaction += ocrRating.satisfaction;
//           saCount++;
//         }
//         if (ocrRating.names) {
//           names += ocrRating.names;
//           naCount++;
//         }
//         if (ocrRating.prices) {
//           prices += ocrRating.prices;
//           prCount++;
//         }
//         if (ocrRating.missingArticles) {
//           missingArticles += ocrRating.missingArticles;
//           miCount++;
//         }
//         if (ocrRating.speed) {
//           speed += ocrRating.speed;
//           spCount++;
//         }
//       }
//
//       if (!overallRating) {
//         overallRating = new RatingSummary();
//         overallRating.username = 'OVERALL_AVERAGE';
//       }
//       if (saCount > 0) {
//         overallRating.satisfaction = satisfaction / saCount;
//         overallRating.satisfactionCount = saCount;
//       } else {
//         overallRating.satisfaction = 0;
//         overallRating.satisfactionCount = 0;
//       }
//       if (naCount > 0) {
//         overallRating.names = names / naCount;
//         overallRating.improvementCount = naCount;
//       } else {
//         overallRating.names = 0;
//         overallRating.improvementCount = 0;
//       }
//       overallRating.prices = prCount > 0 ? prices / prCount : 0;
//       overallRating.missingArticles = miCount > 0 ? missingArticles / miCount : 0;
//       overallRating.speed = spCount > 0 ? speed / spCount : 0;
//
//       return overallRating.save(null, { useMasterKey: true });
//     });
// }
