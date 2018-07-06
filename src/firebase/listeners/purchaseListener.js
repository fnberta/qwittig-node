import { db, getUserTokens, sendPush } from '../main';
import updateBalances from '../balances';
import calculateCompensations from '../compensations';
import { formatMoney } from '../../utils';

export default function purchaseListener() {
  const now = new Date().getTime();
  const addRef = db.ref('purchases').orderByChild('createdAt').startAt(now);
  addRef.on('child_added', onAdded);

  const ref = db.ref('purchases');
  ref.on('child_removed', onRemoved);
  ref.on('child_changed', onChanged);
}

async function onAdded(snapshot) {
  const purchase = snapshot.val();
  await calcBalancesAndComps(purchase);
  await sendPurchasePush(purchase, snapshot.key, 'push_purchase_new_title', 'push_purchase_new_alert',
    'OPEN_PURCHASE_DETAILS');
}

async function onRemoved(snapshot) {
  const purchase = snapshot.val();
  // TODO: delete receipt image from storage
  await calcBalancesAndComps(purchase);
  await sendPurchasePush(purchase, snapshot.key, 'push_purchase_delete_title', 'push_purchase_delete_alert');
}

async function onChanged(snapshot) {
  const purchase = snapshot.val();
  await calcBalancesAndComps(purchase);
  await sendPurchasePush(purchase, snapshot.key, 'push_purchase_edit_title', 'push_purchase_edit_alert',
    'OPEN_PURCHASE_DETAILS');
}

async function calcBalancesAndComps(purchase) {
  const identityIds = Object.keys(purchase.identities);
  if (!purchase.identities[purchase.buyer]) {
    identityIds.push(purchase.buyer);
  }

  try {
    await updateBalances(purchase.group, identityIds);
    await calculateCompensations(purchase.group);
  } catch (e) {
    console.error('Failed to calculate balances and compensations with error:', e);
  }
}

async function sendPurchasePush(purchase, purchaseId, titleKey, bodyKey, clickAction) {
  const identityIds = Object.keys(purchase.identities).filter(id => id !== purchase.buyer);
  const userTokens = await getUserTokens(identityIds);
  const buyer = (await db.ref('identities').child('active').child(purchase.buyer).once('value')).val();
  const data = {
    purchaseId,
    groupId: purchase.group,
  };
  const notification = {
    click_action: clickAction,
    title_loc_key: titleKey,
    title_loc_args: [buyer.nickname],
    body_loc_key: bodyKey,
    body_loc_args: [purchase.store, formatMoney(purchase.total, buyer.groupCurrency)],
  };

  await sendPush(userTokens, data, notification);
}
