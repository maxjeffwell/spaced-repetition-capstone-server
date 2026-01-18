'use strict';

// Polyfill for Node.js 24+ compatibility with TensorFlow.js
// util.isNullOrUndefined was removed in Node.js 18+
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function (value) {
    return value === null || value === undefined;
  };
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const passport = require('passport');
const path = require('path');
const client = require('prom-client');

const { PORT, CLIENT_ORIGIN } = require('./config');
const { dbConnect } = require('./db-mongoose');
const { localStrategy, jwtStrategy } = require('./auth/passport');
const mlService = require('./ml/ml-service');

const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const questionsRouter = require('./routes/questions');
const chatRouter = require('./routes/chat');

// Prometheus metrics setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  registers: [register]
});

const app = express();

// Metrics middleware (before other middleware)
app.use((req, res, next) => {
  if (req.path === '/metrics' || req.path === '/health') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status: res.statusCode.toString() };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });
  next();
});

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

// Health check endpoint (both paths for proxy compatibility)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Mount questions router at both /questions and /api/questions for compatibility
app.use('/questions', questionsRouter);
app.use('/api/questions', questionsRouter);
// Mount users router at both paths for proxy compatibility
app.use('/users', usersRouter);
app.use('/api/users', usersRouter);
// Mount auth router at both /api and root to support both /auth/login and /api/auth/login
app.use('/api', authRouter);
app.use('/', authRouter);
// Mount chat router at both paths for proxy compatibility
app.use('/chat', chatRouter);
app.use('/api/chat', chatRouter);

// Conditionally serve static files only when not in API-only mode (for Kubernetes)
if (process.env.API_ONLY !== 'true') {
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
} else {
  console.log('Running in API-only mode (Kubernetes deployment)');
}

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
      // Check if server successfully bound to port
      const address = server.address();
      if (address) {
        console.info(`App listening on port ${address.port}`);
      } else {
        console.error('Server failed to bind to port');
      }
    })
    .on('error', err => {
      console.error('Express failed to start');
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please stop the other process or use a different port.`);
      } else {
        console.error(err);
      }
      process.exit(1);
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
