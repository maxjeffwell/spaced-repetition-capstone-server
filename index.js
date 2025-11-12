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
const path = require('path');

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

// Serve static files from React build (production)
const clientBuildPath = path.join(__dirname, '../spaced-repetition-capstone-client/build');
app.use(express.static(clientBuildPath));

// Serve ML model files
const mlModelPath = path.join(__dirname, '../spaced-repetition-capstone-client/public/models');
app.use('/models', express.static(mlModelPath));

// Catch-all for client-side routing - serve index.html for non-API routes
// This enables React Router to work when refreshing on routes like /learn
app.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return next();
  }

  // For all other routes, serve index.html to enable client-side routing
  res.sendFile(path.join(clientBuildPath, 'index.html'));
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
