/**
 * Created by fabio on 10.05.16.
 */

const express = require('express');
export const router = express.Router();
const bodyParser = require('body-parser');
router.use(bodyParser.json());
const request = require('request-promise');

import {APP_ID} from './parse/parse.js'

router.post('/product', function (req, res, next) {
    const products = req.body.products;
    if (!products) {
        const error = new Error('Bad request');
        error.status = 400;
        next(error);
        return;
    }

    addProducts(products)
        .then(() => res.sendStatus(200))
        .catch(err => next(err))
});

function addProducts(products) {
    const requests = products.map(product => {
        return {
            "method": "POST",
            "path": "/api/data/classes/Product",
            "body": {
                "name": product.name,
                "info": product.info,
                "brand": product.brand,
                "category": product.category,
                "subcategory": product.subcategory,
                "source": product.source
            }
        }
    });

    return request({
        method: "POST",
        url: "http://localhost:3000/api/data/batch",
        headers: {
            "X-Parse-Application-Id": APP_ID
        },
        body: {
            "requests": requests
        },
        json: true
    });
}