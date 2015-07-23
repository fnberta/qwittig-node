var express = require('express');
var router = express.Router();
var Promise = require("bluebird");
var request = Promise.promisifyAll(require('request'));
var fs = require('fs');
Promise.promisifyAll(fs);
var execFileAsync = Promise.promisify(require('child_process').execFile);

router.route('/receipt')
    .post(function(req, res, next) {
        req.socket.setTimeout(0);
        //res.setTimeout(0);

        var sessionToken = req.body.sessionToken;
        var receipt = req.files.receipt;

        validateSessionToken(sessionToken).then(function () {
            return performOcr(receipt);
        }).then(function (result) {
            res.json(result);
        }).catch(function (e) {
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
    }).spread(function (response, body) {
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
    var imagePath = '../' + receipt.path;
    var jsonPath = './ocr/' + receipt.name;

    var matlabExec = '/Applications/MATLAB_R2014b.app/bin/matlab';
    var matlabArgs = ['-nojvm', '-r "try, qScan(\'' + imagePath + '\'); end, quit"'];

    return execFileAsync(matlabExec, matlabArgs, {cwd: './ocr'}).spread(function (stdout, stderr) {
        var jsonOutput = removeExtension(jsonPath) + '-matlab.json';
        return fs.readFileAsync(jsonOutput, 'utf8');
    }).then(function (data) {
        return JSON.parse(data);
    });
}

function removeExtension(filename){
    var lastDotPosition = filename.lastIndexOf(".");
    if (lastDotPosition === -1) {
        return filename;
    } else {
        return filename.substr(0, lastDotPosition);
    }
}

module.exports = router;