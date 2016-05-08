const express = require('express');
export const router = express.Router();
const co = require('co');
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

    co(function*() {
        const user = yield validateSessionToken(sessionToken);
        res.status(200).end();
        try {
            const result = yield performOcr(receipt);
            yield sendPushSuccessful(result, user);
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

function performOcr(receipt) {
    const imagePath = path.resolve(ROOT_PATH, receipt.path);
    const scriptPath = path.resolve(ROOT_PATH, 'bin/Run.py');
    const args = [imagePath];

    return execFile(scriptPath, args, {cwd: path.resolve(ROOT_PATH, 'bin/')})
        .then(([stdout, stderr]) => {
            if (stderr) {
                throw new Error(stderr);
            }

            return JSON.parse(stdout);
        });
}

function sendPushSuccessful(data, user) {
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
                "confidentiality": data.confidentiality,
                "store": data.store,
                "totalPrice": data.total,
                "items": data.items
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
