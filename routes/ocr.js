var express = require('express');
var router = express.Router();
var Promise = require("bluebird");
var request = Promise.promisifyAll(require('request'));
var fs = require('fs');
Promise.promisifyAll(fs);
var execFileAsync = Promise.promisify(require('child_process').execFile);
var path = require('path');

router.route('/receipt')
    .post(function (req, res, next) {
        req.socket.setTimeout(0);

        var sessionToken = req.body.sessionToken;
        var receipt = req.files.receipt;

        validateSessionToken(sessionToken).then(function () {
            return performOcr(receipt);
        })
        .then(function (result) {
            res.json(result);
        })
        .catch(function (e) {
            next(e);
        });
    });

function validateSessionToken(sessionToken) {
    return request.getAsync({
        url: 'https://api.parse.com/1/sessions/me',
        method: 'GET',
        headers: {
            'X-Parse-Application-Id': 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji',
            'X-Parse-REST-API-Key': '6YNWJ2WjkHpNeMQ240CGxt9t8EzG7WKlAOqokpFG',
            'X-Parse-Session-Token': sessionToken
        }
    })
    .spread(function (response, body) {
        var statusCode = response.statusCode;
        if (statusCode != 200) {
            var parseResponse = JSON.parse(body);
            var error = new Error(parseResponse.error);
            error.status = 401;
            error.parseCode = parseResponse.code;
            throw error;
        }
    });
}

function performOcr(receipt) {
    var imagePath = path.resolve(process.cwd(), receipt.path);

    var exec = '/home/node/qscan/Python-Code/Run2.py';
    var args = [imagePath];

    return execFileAsync(exec, args, {cwd: '/home/node/qscan/Python-Code/'})
    .spread(function (stdout, stderr) {
        var jsonOutput = removeExtension(imagePath) + '.json';
        return fs.readFileAsync(jsonOutput, 'utf8');
    })
    .then(function (data) {
        return JSON.parse(data);
    });
}

function removeExtension(filename) {
    var lastDotPosition = filename.lastIndexOf(".");
    if (lastDotPosition === -1) {
        return filename;
    } else {
        return filename.substr(0, lastDotPosition);
    }
}

module.exports = router;
