const express = require('express');
const router = express.Router();
const request = require('request-promise');
const execFile = require('mz/child_process').execFile;
const path = require('path');
const multer = require('multer');
const receipts = multer({dest: './receipts/'});
const rootPath = './';

router.route('/receipt')
    .post(receipts.single('receipt'), function (req, res, next) {
        res.setTimeout(0);

        var sessionToken = req.body.sessionToken;
        var receipt = req.file;

        validateSessionToken(sessionToken)
            .then((user) => {
                return performOcr(receipt)
                    .then(result => {
                        res.json(result);
                        return sendPush(result, user)
                    })
            })
            .catch(e => next(e));
    });

function validateSessionToken(sessionToken) {
    return request(
        {
            method: "GET",
            url: "http://localhost:3000/api/data/sessions/me",
            headers: {
                "X-Parse-Application-Id": "yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji",
                "X-Parse-Session-Token": sessionToken
            },
            json: true
        })
        .then(response => response.user);
}

function performOcr(receipt) {
    const imagePath = path.resolve(rootPath, receipt.path);
    const scriptPath = path.resolve(rootPath, 'bin/Run.py');
    const args = [imagePath];

    return execFile(scriptPath, args, {cwd: path.resolve(rootPath, 'bin/')})
        .then(([stdout, stderr]) => {
            if (stderr) {
                console.log('stderr', stderr);
                throw new Error();
            }

            return JSON.parse(stdout);
        });
}

function sendPush(data, user) {
    return request({
        method: "POST",
        url: "http://localhost:3000/api/data/push",
        headers: {
            "X-Parse-Application-Id": "yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji",
            "X-Parse-Master-Key": "TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK"
        },
        body: {
            "where": {
                "user": user
            },
            "data": {
                "type": "ocrFinished",
                "content-available": 1,
                "alert": {
                    "loc-key": "locKey.ocrFinished"
                },
                "purchase": data
            }
        },
        json: true
    });
}

module.exports = router;
