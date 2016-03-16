var express = require('express');
var router = express.Router();
var path = require('path');

var aasa = path.join(__dirname, 'apple-app-site-association');

router.route('/apple-app-site-association')
    .get(function (req, res, next) {
        res.set('Content-Type', 'application/pkcs7-mime');
        res.status(200);
        res.sendFile(aasa);
    });

module.exports = router;