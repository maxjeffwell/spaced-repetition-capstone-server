'use strict';

require('dotenv').config();

// Security: Fail fast if JWT_SECRET is not set in production
const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!JWT_SECRET && NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  console.error('Generate a secure secret: openssl rand -base64 64');
  process.exit(1);
}

if (NODE_ENV === 'production' && JWT_SECRET && JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

// Use a development-only secret for local testing (never in production)
const effectiveJwtSecret = JWT_SECRET || (NODE_ENV !== 'production' ? 'dev-only-secret-not-for-prod' : null);

module.exports = {
  PORT: process.env.PORT || 8080,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/spaced-repetition',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'mongodb://root:intervalai_mongo123@localhost:27018/intervalai-test?authSource=admin',
  JWT_SECRET: effectiveJwtSecret,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  NODE_ENV,

  // AI Configuration
  AI_PROVIDER: process.env.AI_PROVIDER || 'gateway', // 'local', 'cloud', or 'gateway'
  AI_LOCAL_URL: process.env.AI_LOCAL_URL || 'http://llama-cpu-service:8080/v1/chat/completions',
  AI_CLOUD_URL: process.env.AI_CLOUD_URL || 'https://api.openai.com/v1/chat/completions',
  AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || 'http://shared-ai-gateway:8002',
  AI_API_KEY: process.env.AI_API_KEY || ''
};
