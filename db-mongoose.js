'use strict';

const mongoose = require('mongoose');
mongoose.Promise = global.Promise;

const { MONGODB_URI } = require('./config');
const logger = require('./utils/logger').child('Database');

// Connection options optimized for Mongoose 8.x and MongoDB Atlas
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000, // 30 seconds for server selection
  socketTimeoutMS: 45000, // 45 seconds for socket timeout
  connectTimeoutMS: 30000, // 30 seconds for initial connection
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  family: 4 // Use IPv4, skip trying IPv6
};

async function dbConnect(url = MONGODB_URI, retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info('Attempting MongoDB connection', { attempt, maxRetries: retries });
      await mongoose.connect(url, mongooseOptions);
      logger.info('MongoDB connected successfully');
      return;
    } catch (err) {
      logger.error('MongoDB connection attempt failed', { attempt, error: err.message });

      if (attempt < retries) {
        logger.info('Retrying connection', { delaySeconds: delay / 1000 });
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff: increase delay for next attempt
        delay = Math.min(delay * 1.5, 30000);
      } else {
        logger.error('All MongoDB connection attempts failed', { error: err.message });
        // Don't throw - let the app start but log the error
        // This allows the app to be healthy for k8s probes
      }
    }
  }
}

function dbDisconnect() {
  return mongoose.disconnect();
}

function dbGet() {
  return mongoose;
}

module.exports = {
  dbConnect,
  dbDisconnect,
  dbGet
};


