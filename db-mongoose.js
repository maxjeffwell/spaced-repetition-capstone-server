'use strict';

const mongoose = require('mongoose');
mongoose.Promise = global.Promise;

const { MONGODB_URI } = require('./config');

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
      console.log(`Attempting MongoDB connection (attempt ${attempt}/${retries})...`);
      await mongoose.connect(url, mongooseOptions);
      console.log('✓ MongoDB connected successfully');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err.message);

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff: increase delay for next attempt
        delay = Math.min(delay * 1.5, 30000);
      } else {
        console.error('All MongoDB connection attempts failed');
        console.error(err);
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


