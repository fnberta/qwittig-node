import express from 'express';
import bodyParser from 'body-parser';
import moment from 'moment';
import 'moment-range';
import { reduce, size } from 'lodash';
import { db, validateIdToken } from '../firebase/main';

const MAX_STORES = 6;
const MAX_IDENTITIES = 6;
const OTHER = 'other';

const jsonParser = bodyParser.json();
const router = express.Router(); // eslint-disable-line babel/new-cap
export default router;

router.post('/stats', jsonParser, (req, res, next) => {
  const idToken = req.body.idToken;
  const startDate = req.body.startDate;
  const endDate = req.body.endDate;
  if (!idToken || !startDate || !endDate) {
    const error = new Error('Bad request');
    error.status = 400;
    next(error);
    return;
  }

  handleStatsRequest(idToken, startDate, endDate)
    .then(stats => res.json(stats))
    .catch(err => next(err));
});

async function handleStatsRequest(idToken, startDate, endDate) {
  const userId = await validateIdToken(idToken);
  const start = moment(startDate).startOf('day');
  const end = moment(endDate).endOf('day');
  return calculateStats(userId, start, end);
}

async function calculateStats(userId, start, end) {
  const user = (await db.ref('users').child(userId).once('value')).val();
  const currentIdentitySnap = await db.ref('identities').child('active').child(user.currentIdentity).once('value');
  const currentIdentityId = currentIdentitySnap.key;
  const currentIdentity = currentIdentitySnap.val();
  const purchasesSnap = await db.ref('purchases').orderByChild('group').equalTo(currentIdentity.group).once('value');

  let total = 0;
  let myShareTotal = 0;
  const totalsByStore = {};
  const totalsByBuyer = {};
  const myShareByStore = {};

  const unit = getUnit(start, end);
  const totalsByDate = getInitialDateResult(start, end, unit);
  const myShareByDate = getInitialDateResult(start, end, unit);

  const purchases = purchasesSnap.val();
  for (const purchaseId of Object.keys(purchases)) {
    const purchase = purchases[purchaseId];
    const date = moment(purchase.date);
    if (date.isBetween(start, end, null, [])) {
      total += purchase.total;

      if (totalsByStore[purchase.store]) {
        totalsByStore[purchase.store] += purchase.total;
      } else if (size(totalsByStore) <= MAX_STORES) {
        totalsByStore[purchase.store] = purchase.total;
      } else {
        totalsByStore[OTHER] = (totalsByStore[OTHER] || 0) + purchase.total;
      }

      if (totalsByBuyer[purchase.buyer]) {
        totalsByBuyer[purchase.buyer].total += purchase.total;
      } else if (size(totalsByBuyer) <= MAX_IDENTITIES) {
        const identity = (await db.ref('identities').child('active').child(purchase.buyer).once('value')).val();
        totalsByBuyer[purchase.buyer] = {
          nickname: identity.nickname,
          total: purchase.total,
        };
      } else if (totalsByBuyer[OTHER]) {
        totalsByBuyer[OTHER].total += purchase.total;
      } else {
        totalsByBuyer[OTHER] = {
          nickname: OTHER,
          total: purchase.total,
        };
      }

      const endOfUnit = date.endOf(unit);

      if (purchase.identities[currentIdentityId]) {
        const myShare = purchase.articles
          .filter(article => article.identities[currentIdentityId])
          .reduce((acc, curr) => acc + (curr.price / size(curr.identities)), 0);

        if (myShareByStore[purchase.store]) {
          myShareByStore[purchase.store].myShare += myShare;
        } else if (size(myShareByStore) <= MAX_STORES) {
          myShareByStore[purchase.store] = myShare;
        } else {
          myShareByStore[OTHER] = (myShareByStore[OTHER] || 0) + myShare;
        }

        myShareByDate[+endOfUnit] += myShare;
        myShareTotal += myShare;
      }

      totalsByDate[+endOfUnit] += purchase.total;
    }
  }

  const averageByDate = reduce(totalsByDate, (result, value) => result + value, 0) / size(totalsByDate);
  const myShareAverageByDate = reduce(myShareByDate, (result, value) => result + value, 0) / size(myShareByDate);

  return {
    group: {
      pie: {
        stores: totalsByStore,
        identities: totalsByBuyer,
        total,
      },
      bar: {
        data: totalsByDate,
        unit,
        average: averageByDate,
      },
    },
    user: {
      pie: {
        stores: myShareByStore,
        total: myShareTotal,
      },
      bar: {
        data: myShareByDate,
        unit,
        average: myShareAverageByDate,
      },
    },
  };
}

function getUnit(start, end) {
  const daysDiff = end.diff(start, 'days');
  if (daysDiff > 31 && daysDiff < 365) {
    return 'months';
  }

  if (daysDiff > 365) {
    return 'years';
  }

  return 'days';
}

function getInitialDateResult(start, end, unit) {
  const result = {};
  const range = moment.range(start.endOf(unit), end.endOf(unit));
  range.by(unit, (date) => {
    result[+date.endOf(unit)] = 0;
  });

  return result;
}
