const express = require('express');
export const router = express.Router();
const co = require('co');
const fs = require('mz/fs');
const request = require('request-promise');
const execFile = require('mz/child_process').execFile;
const path = require('path');
const multer = require('multer');
const receipts = multer({dest: './receipts/'});
import {MASTER_KEY} from './parse/parse.js'
import {APP_ID} from './parse/parse.js'

const ROOT_PATH = path.resolve(__dirname, '../../');

router.post('/receipt', receipts.single('receipt'), function (req, res, next) {
    res.setTimeout(3600000);

    const sessionToken = req.body.sessionToken;
    const receipt = req.file;
    if (!sessionToken || !receipt) {
        const error = new Error('Bad request');
        error.status = 400;
        next(error);
        return;
    }

    const receiptPath = path.resolve(ROOT_PATH, receipt.path);
    co(function*() {
        const user = yield validateSessionToken(sessionToken);
        res.status(200).end();
        try {
            const ocrData = yield performOcr(receiptPath);
            const ocrPurchaseId = yield saveOcrPurchase(receiptPath, ocrData, user);
            yield sendPushSuccessful(ocrPurchaseId, user);
        } catch (e) {
            yield sendPushFailed(user);
            next(e);
        }
    }).catch(e => next(e));
});

function validateSessionToken(sessionToken) {
    return request(
        {
            method: "GET",
            url: "http://localhost:3000/api/data/sessions/me",
            headers: {
                "X-Parse-Application-Id": APP_ID,
                "X-Parse-Session-Token": sessionToken
            },
            json: true
        })
        .then(response => response.user);
}

function performOcr(receiptPath) {
    const scriptPath = path.resolve(ROOT_PATH, 'bin/Run.py');
    const args = [receiptPath];

    return execFile(scriptPath, args, {cwd: path.resolve(ROOT_PATH, 'bin/')})
        .then(([stdout, stderr]) => {
            if (stderr) {
                throw new Error(stderr);
            }

            return JSON.parse(stdout);
        });
}

function saveOcrPurchase(receiptPath, ocrData, user) {
    const fileName = "receipt.jpg";
    return fs.readFile(receiptPath)
        .then(buffer => request({
                method: "POST",
                url: `http://localhost:3000/api/data/files/${fileName}`,
                headers: {
                    "X-Parse-Application-Id": APP_ID,
                    "Content-Type": "image/jpeg"
                },
                body: buffer
            }))
        .then(response => JSON.parse(response).name)
        .then(fileName => request({
                method: "POST",
                url: "http://localhost:3000/api/data/classes/OcrPurchase",
                headers: {
                    "X-Parse-Application-Id": APP_ID
                },
                body: {
                    "user": user,
                    "data": ocrData,
                    "receipt": {
                        "name": fileName,
                        "__type": "File"
                    }
                },
                json: true
            }))
        .then(result => result.objectId)
}

function sendPushSuccessful(ocrPurchaseId, user) {
    return request({
        method: "POST",
        url: "http://localhost:3000/api/data/push",
        headers: {
            "X-Parse-Application-Id": APP_ID,
            "X-Parse-Master-Key": MASTER_KEY
        },
        body: {
            "where": {
                "user": user
            },
            "data": {
                "type": "ocrSucceeded",
                "content-available": 1,
                "sound": "default",
                "alert": {
                    "loc-key": "locKey.ocrSucceeded"
                },
                "ocrPurchaseId": ocrPurchaseId
            }
        },
        json: true
    });
}

function sendPushFailed(user) {
    return request({
        method: "POST",
        url: "http://localhost:3000/api/data/push",
        headers: {
            "X-Parse-Application-Id": APP_ID,
            "X-Parse-Master-Key": MASTER_KEY
        },
        body: {
            "where": {
                "user": user
            },
            "data": {
                "type": "ocrFailed",
                "content-available": 1,
                "sound": "default",
                "alert": {
                    "loc-key": "locKey.ocrFailed"
                }
            }
        },
        json: true
    });
}
