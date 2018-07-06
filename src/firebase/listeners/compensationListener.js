import { db, sendPush } from '../main';
import updateBalances from '../balances';
import calculateCompensations from '../compensations';
import { formatMoney } from '../../utils';

export default function compensationListener() {
  const now = new Date().getTime();
  listenToPaid(now);
}

function listenToPaid(now) {
  const addRef = db.ref('compensations').child('paid').orderByChild('createdAt').startAt(now);
  addRef.on('child_added', onPaidAdded);

  const ref = db.ref('compensations').child('paid');
  ref.on('child_removed', onPaidChangedOrRemoved);
  ref.on('child_changed', onPaidChangedOrRemoved);
}

async function onPaidAdded(snapshot) {
  const comp = snapshot.val();
  const identityIds = [comp.creditor, comp.creditor];
  try {
    await updateBalances(comp.group, identityIds);
    if (comp.isAmountChanged) {
      await calculateCompensations(comp.group);
    }
    await sendPushPaid(comp);
  } catch (e) {
    console.error('Failed to calculate balances with error:', e);
  }
}

async function onPaidChangedOrRemoved(snapshot) {
  const comp = snapshot.val();
  const identityIds = [comp.creditor, comp.creditor];
  try {
    await updateBalances(comp.group, identityIds);
    await calculateCompensations(comp.group);
  } catch (e) {
    console.error('Failed to calculate balances with error:', e);
  }
}

async function sendPushPaid(comp) {
  const [debtor, creditor] = await Promise.all([
    db.ref('identities').child('active').child(comp.debtor).once('value')
      .then(snap => snap.val()),
    db.ref('identities').child('active').child(comp.creditor).once('value')
      .then(snap => snap.val()),
  ]);

  if (debtor && debtor.user) {
    const user = (await db.ref('users').child(debtor.user).once('value')).val();
    const data = {
      type: 'COMPENSATION_PAID',
      tab: 'paid',
      groupId: comp.group,
      nickname: creditor.nickname,
      amount: comp.amount.num / comp.amount.den,
      currency: creditor.groupCurrency,
    };

    const notification = {
      click_action: 'OPEN_FINANCE',
      title_loc_key: 'push_compensation_payment_done_title',
      body_loc_key: 'push_compensation_payment_done_alert',
      body_loc_args: [creditor.nickname, formatMoney(comp.amount.num / comp.amount.den, creditor.groupCurrency)],
    };

    await sendPush(Object.keys(user.tokens), data, notification);
  }
}
