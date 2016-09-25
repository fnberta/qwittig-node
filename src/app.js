import express from 'express';
import morgan from 'morgan';
import userData from './routes/userData';
import product from './routes/products';
import stats from './routes/stats';

const app = express();

app.use(morgan('dev'));

app.use('/api2/user', userData);
app.use('/api2', product);
app.use('/api2', stats);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

export default app;
