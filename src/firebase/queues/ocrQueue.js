/**
 * Created by fabio on 25.07.16.
 */

import Queue from 'firebase-queue';
import path from 'path';
import { isEmpty } from 'lodash';
import { db, TIMESTAMP, sendPush, sendDataPush } from '../main';

const fs = require('mz/fs');
const execFile = require('mz/child_process').execFile;
const gcloud = require('google-cloud')({
  projectId: 'qwittig-6fb93',
  keyFilename: path.resolve(__dirname, '../../../cert/qwittig-314610931f3b.json'),
});

const gcs = gcloud.storage();
const ROOT_PATH = path.resolve(__dirname, '../../../');

export default function startOcrQueue() {
  const ref = db.ref('queue/ocr');
  const queue = new Queue(ref, (data, progress, resolve, reject) => {
    handleOcr(data)
      .then(() => resolve())
      .catch((err) => reject(err));
  });
}

async function handleOcr(data) {
  try {
    const purchaseId = db.ref('purchases').push().key;
    const receiptPath = await parseReceipt(data.receipt, purchaseId);
    const ocrData = await performOcr(receiptPath);
    await uploadReceipt(receiptPath, purchaseId);
    const ocrDataId = await saveOcrData(ocrData, purchaseId, data.userId);
    await fs.unlink(receiptPath);
    await sendPushSuccessful(ocrDataId, purchaseId, data.userId);
  } catch (e) {
    await sendPushFailed(data.userId);
    throw e;
  }
}

async function parseReceipt(receiptString, purchaseId) {
  const fileName = `receipts/${purchaseId}.jpg`;
  const receiptPath = path.resolve(ROOT_PATH, fileName);
  await fs.writeFile(receiptPath, receiptString, { encoding: 'base64' });
  return receiptPath;
}

async function performOcr(receiptPath) {
  const scriptPath = path.resolve(ROOT_PATH, 'bin/Run.py');
  const args = [receiptPath];

  const [stdout, stderr] = await execFile(scriptPath, args, { cwd: path.resolve(ROOT_PATH, 'bin/') });
  if (stderr) {
    throw new Error(stderr);
  }
  const ocrData = JSON.parse(stdout);
  if (isEmpty(ocrData.items)) {
    throw new Error('No items found');
  }

  return ocrData;
}

function uploadReceipt(receiptPath, purchaseId) {
  const bucket = gcs.bucket('qwittig-6fb93.appspot.com');
  const remoteFileName = `receipts/${purchaseId}.jpg`;
  const options = {
    destination: remoteFileName,
  };

  return new Promise(
    (resolve, reject) => {
      bucket.upload(receiptPath, options, (err) => {
        if (err) {
          reject(err);
        } else {
          const fileName = encodeURIComponent(remoteFileName);
          resolve(fileName);
        }
      });
    });
}

async function saveOcrData(data, purchaseId, userId) {
  const ocrData = {
    createdAt: TIMESTAMP,
    user: userId,
    purchase: purchaseId,
    data,
    // receipt: url,
    processed: false,
  };

  const ref = db.ref('ocrData').child(userId).push();
  await ref.set(ocrData);

  return ref.key;
}

async function sendPushSuccessful(ocrDataId, purchaseId, userId) {
  const userTokens = await getUserTokens(userId);
  const data = {
    type: 'OCR_PROCESSED',
    ocrDataId,
    purchaseId,
  };

  await sendDataPush(userTokens, data);
}

async function sendPushFailed(userId) {
  const userTokens = await getUserTokens(userId);
  const notification = {
    title_loc_key: 'push_purchase_ocr_failed_title',
    body_loc_key: 'push_purchase_ocr_failed_alert',
  };

  await sendPush(userTokens, {}, notification);
}

async function getUserTokens(userId) {
  const user = (await db.ref('users').child(userId).once('value')).val();
  return Object.keys(user.tokens);
}
