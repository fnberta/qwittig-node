const express = require('express');
const path = require('path');
export const router = express.Router();

const AASA = path.join(__dirname, '../../cert/apple-app-site-association');

router.get('/apple-app-site-association', function (req, res, next) {
        res.set('Content-Type', 'application/pkcs7-mime');
        res.status(200);
        res.sendFile(AASA);
    });