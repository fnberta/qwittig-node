import express from 'express';
import bodyParser from 'body-parser';
import { db } from '../firebase/main';

const jsonParser = bodyParser.json();
const router = express.Router(); // eslint-disable-line babel/new-cap
export default router;

router.post('/product', jsonParser, (req, res, next) => {
  const products = req.body.products;
  if (!products) {
    const error = new Error('Bad request');
    error.status = 400;
    next(error);
    return;
  }

  addProducts(products)
    .then(() => res.sendStatus(200))
    .catch(err => next(err));
});

async function addProducts(products) {
  await Promise.all(products.map(product => db.ref('products').push().set(product)));
}
