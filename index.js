'use strict';

// Polyfill for Node.js 24+ compatibility with TensorFlow.js
// util.isNullOrUndefined was removed in Node.js 18+
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function(value) {
    return value === null || value === undefined;
  };
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const passport = require('passport');

const { PORT, CLIENT_ORIGIN } = require('./config');
const { dbConnect } = require('./db-mongoose');
const { localStrategy, jwtStrategy } = require('./auth/passport');
const mlService = require('./ml/ml-service');

const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const questionsRouter = require('./routes/questions');

const app = express();

app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'common' : 'dev', {
    skip: (req, res) => process.env.NODE_ENV === 'test'
  })
);

app.use(bodyParser.json());

// CORS configuration - supports multiple origins for production
const allowedOrigins = CLIENT_ORIGIN.split(',').map(origin => origin.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true
  })
);

passport.use(jwtStrategy);
passport.use(localStrategy);

app.use('/api/questions', questionsRouter);
app.use('/api/users', usersRouter);
app.use('/api', authRouter);


app.use((req, res, next) => {
  const err = new Error ('Not found');
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.status) {
    const errBody = Object.assign({}, err, { message: err.message });
    res.status(err.status).json(errBody);
  } else {
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

function runServer(port = PORT) {
  const server = app
    .listen(port, () => {
      console.info(`App listening on port ${server.address().port}`);
    })
    .on('error', err => {
      console.error('Express failed to start');
      console.error(err);
    });
}

if (require.main === module) {
  dbConnect();
  runServer();

  // Initialize ML model asynchronously (non-blocking)
  mlService.initialize().catch(err => {
    console.error('Failed to initialize ML service:', err.message);
  });
}

module.exports = { app };
