var express = require('express');
var router = express.Router();
var request = require('request-promise');
var fs = require('mz/fs');
var execFile = require('mz/child_process').execFile;
var path = require('path');
var multer = require('multer');
var receipts = multer({ dest: './receipts/' });

router.route('/receipt')
    .post(receipts.single('receipt'), function (req, res, next) {
        req.socket.setTimeout(0);

        var sessionToken = req.body.sessionToken;
        var receipt = req.file;

        // validateSessionToken(sessionToken)
        //     .then(() => performOcr(receipt))
        //     .then(result => res.json(result))
        //     .catch(e => next(e));

        performOcr(receipt)
        .then(result => res.json(result))
            .catch(e => next(e));
    });

function validateSessionToken(sessionToken) {
    return request({
            url: 'http://localhost:3000/sessions/me',
            method: 'GET',
            headers: {
                'X-Parse-Application-Id': 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji',
                'X-Parse-Session-Token': sessionToken
            }
        })
        .spread((response, body) => {
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
    var scriptPath = path.resolve(process.cwd(), 'bin/Run.py');
    var args = [imagePath];

    return execFile(scriptPath, args, {cwd: path.resolve(process.cwd(), 'bin/')})
        .spread((stdout, stderr) => {
            console.log('stdout', stdout);
            console.log('stderr', stderr);
            return JSON.parse(stdout);
            // var jsonOutput = removeExtension(imagePath) + '.json';
            // return fs.readFile(jsonOutput, 'utf8');
        });
        // .then(data => JSON.parse(data));
}

function removeExtension(filename) {
    var lastDotPosition = filename.lastIndexOf(".");
    return lastDotPosition === -1 ? filename : filename.substr(0, lastDotPosition);
}

module.exports = router;
