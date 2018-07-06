import { add, compose, evolve, has, when } from 'ramda';
import { db, TIMESTAMP } from '../main';

export default function ocrRatingListener() {
  const now = new Date().getTime();
  const ref = db.ref('ocrRatings').orderByChild('createdAt').startAt(now);
  ref.on('child_added', onOcrRatingAdded);
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
  const summariesSnap = await db.ref('ocrSummaries').orderByChild('user').equalTo(user).once('value');
  if (summariesSnap.hasChildren()) {
    await Promise.all(Object.keys(summariesSnap.val())
      .map(summaryId => db.ref('ocrSummaries').child(summaryId).remove()));
  }
}

async function createNewSummary(user) {
  const ratingsSnap = await db.ref('ocrRatings').orderByChild('user').equalTo(user).once('value');
  const initialRatings = {
    satisfaction: 0,
    names: 0,
    prices: 0,
    missingArticles: 0,
    saCount: 0,
    naCount: 0,
    prCount: 0,
    miCount: 0,
    spCount: 0,
  };

  const ratingsSum = Object.values(ratingsSnap.val()).reduce(makeRatingsReducer(), initialRatings);
  return getSummary(user, ratingsSum);
}

function makeRatingsReducer() {
  const makeModify = (curr, prop, counterProp) => when(() => has(prop, curr), evolve({
    [prop]: add(curr[prop]),
    [counterProp]: add(1),
  }));

  return (acc, curr) => compose(
    makeModify(curr, 'satisfaction', 'saCount'),
    makeModify(curr, 'names', 'naCount'),
    makeModify(curr, 'prices', 'prCount'),
    makeModify(curr, 'missingArticles', 'miCount'),
    makeModify(curr, 'prices', 'spCount'),
  )(acc);
}

function getSummary(user, ratingsSum) {
  const hasPrices = ratingsSum.prCount > 0;
  const hasMissingArticles = ratingsSum.miCount > 0;
  const hasSpeed = ratingsSum.spCount > 0;
  const hasSatisfaction = ratingsSum.saCount > 0;
  const hasNames = ratingsSum.naCount > 0;

  return {
    createdAt: TIMESTAMP,
    user,
    prices: hasPrices ? ratingsSum.prices / ratingsSum.prCount : 0,
    missingArticles: hasMissingArticles ? ratingsSum.missingArticles / ratingsSum.miCount : 0,
    speed: hasSpeed ? ratingsSum.speed / ratingsSum.spCount : 0,
    satisfaction: hasSatisfaction ? ratingsSum.satisfaction / ratingsSum.saCount : 0,
    satisfactionCount: hasSatisfaction ? ratingsSum.saCount : 0,
    names: hasNames ? ratingsSum.names / ratingsSum.naCount : 0,
    improvementCount: hasNames ? ratingsSum.naCount : 0,
  };
}
