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
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { PORT, CLIENT_ORIGIN, NODE_ENV } = require('./config');
const logger = require('./utils/logger');
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

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // TensorFlow.js needs eval
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Required for TensorFlow.js
}));

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
      // Security: In production, require Origin header to prevent CSRF-like attacks
      if (!origin) {
        if (NODE_ENV === 'production') {
          return callback(new Error('Origin header required'), false);
        }
        // In development, allow for testing with curl/Postman
        return callback(null, true);
      }

      if (!allowedOrigins.includes(origin)) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true
  })
);

// Rate limiting - protect against brute force attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs per IP
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per 15 minutes
  skipSuccessfulRequests: true, // Only count failed requests
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);
app.use('/auth', generalLimiter);
app.use('/questions', generalLimiter);
app.use('/users', generalLimiter);

// Apply strict rate limiting to authentication endpoints
app.use('/api/auth/login', authLimiter);
app.use('/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/auth/refresh', authLimiter);

passport.use(jwtStrategy);
passport.use(localStrategy);

// Health check endpoint (both paths for proxy compatibility)
// Returns detailed service status including ML and database readiness
const mongoose = require('mongoose');

const healthCheck = (req, res) => {
  const mlStatus = mlService.getStatus();
  const dbStatus = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: {
        status: dbStatus === 1 ? 'healthy' : 'unhealthy',
        state: dbStates[dbStatus] || 'unknown'
      },
      mlModel: {
        status: mlStatus.isReady ? 'ready' : 'unavailable',
        loading: mlStatus.isLoading,
        loaded: mlStatus.modelLoaded
      }
    },
    environment: NODE_ENV
  };

  // Return 503 if critical services are down
  const httpStatus = dbStatus === 1 ? 200 : 503;
  res.status(httpStatus).json(health);
};

app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// Kubernetes readiness probe - only ready when DB is connected
app.get('/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (dbReady) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'Database not connected' });
  }
});

// Kubernetes liveness probe - basic check that server is running
app.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
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
  logger.info('Running in API-only mode (Kubernetes deployment)');
}

app.use((err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
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
        logger.info(`Server started`, { port: address.port, env: NODE_ENV });
      } else {
        logger.error('Server failed to bind to port');
      }
    })
    .on('error', err => {
      logger.error('Express failed to start', { error: err.message });
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
      }
      process.exit(1);
    });
}

if (require.main === module) {
  dbConnect();
  runServer();

  // Initialize ML model asynchronously (non-blocking)
  mlService.initialize().catch(err => {
    logger.error('Failed to initialize ML service', { error: err.message });
  });
}

module.exports = { app };
