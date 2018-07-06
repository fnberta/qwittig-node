import express from 'express';

const router = express.Router(); // eslint-disable-line babel/new-cap
export default router;

router.get('/_ah/health', (req, res) => {
  res.sendStatus(200);
});
