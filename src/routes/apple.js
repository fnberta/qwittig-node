const express = require('express');
const router = express.Router();
const path = require('path');
const aasa = path.join(__dirname, '../../cert/apple-app-site-association');

router.route('/apple-app-site-association')
    .get(function (req, res, next) {
        res.set('Content-Type', 'application/pkcs7-mime');
        res.status(200);
        res.sendFile(aasa);
    });

module.exports = router;