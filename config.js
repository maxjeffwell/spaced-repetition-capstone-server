'use strict';

require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 8080,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/intervalai',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'mongodb://localhost/intervalai-test',
  JWT_SECRET: process.env.JWT_SECRET || 'development-secret-do-not-use-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d'


};
