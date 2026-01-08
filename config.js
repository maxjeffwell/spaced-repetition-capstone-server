'use strict';

require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 8080,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/spaced-repetition',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'mongodb://localhost/thinkful-backend-test',
  JWT_SECRET: process.env.JWT_SECRET || 'development-secret-do-not-use-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',

  // AI Configuration
  AI_PROVIDER: process.env.AI_PROVIDER || 'gateway', // 'local', 'cloud', or 'gateway'
  AI_LOCAL_URL: process.env.AI_LOCAL_URL || 'http://llama-cpu-service:8080/v1/chat/completions',
  AI_CLOUD_URL: process.env.AI_CLOUD_URL || 'https://api.openai.com/v1/chat/completions',
  AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || 'http://shared-ai-gateway:8002',
  AI_API_KEY: process.env.AI_API_KEY || ''
};
