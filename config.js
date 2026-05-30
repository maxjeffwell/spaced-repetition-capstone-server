'use strict';

require('dotenv').config();

// Security: Fail fast if JWT_SECRET is not set in production
// Supports both INTERVALAI_JWT_SECRET (Doppler) and JWT_SECRET naming
const JWT_SECRET = process.env.INTERVALAI_JWT_SECRET || process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!JWT_SECRET && NODE_ENV === 'production') {
  console.error('FATAL: INTERVALAI_JWT_SECRET or JWT_SECRET environment variable is not set');
  console.error('Generate a secure secret: openssl rand -base64 64');
  process.exit(1);
}

if (NODE_ENV === 'production' && JWT_SECRET && JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

// Use a development-only secret for local testing (never in production)
const effectiveJwtSecret = JWT_SECRET || (NODE_ENV !== 'production' ? 'dev-only-secret-not-for-prod' : null);

// Refresh token secret (derived from main secret or separate env var)
// Supports both INTERVALAI_JWT_REFRESH_SECRET (Doppler) and JWT_REFRESH_SECRET naming
const JWT_REFRESH_SECRET_ENV = process.env.INTERVALAI_JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET;
const effectiveJwtRefreshSecret = JWT_REFRESH_SECRET_ENV || (effectiveJwtSecret ? effectiveJwtSecret + '_refresh' : null);

module.exports = {
  PORT: process.env.PORT || 8080,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/spaced-repetition',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'mongodb://root:intervalai_mongo123@localhost:27018/intervalai-test?authSource=admin',
  JWT_SECRET: effectiveJwtSecret,
  JWT_REFRESH_SECRET: effectiveJwtRefreshSecret,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  NODE_ENV,

  // AI Configuration
  AI_PROVIDER: process.env.AI_PROVIDER || 'gateway', // 'local', 'cloud', or 'gateway'
  AI_LOCAL_URL: process.env.AI_LOCAL_URL || 'http://llama-cpu-service:8080/v1/chat/completions',
  AI_CLOUD_URL: process.env.AI_CLOUD_URL || 'https://api.openai.com/v1/chat/completions',
  AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || 'http://shared-ai-gateway:8002',
  AI_API_KEY: process.env.AI_API_KEY || '',

  // Vector search (Qdrant + OVMS embeddings) — see docs/superpowers/specs/2026-05-30-qdrant-related-cards-design.md
  VECTOR_SEARCH_ENABLED: process.env.VECTOR_SEARCH_ENABLED === 'true',
  QDRANT_URL: process.env.QDRANT_URL || 'http://qdrant:6333',
  QDRANT_API_KEY: process.env.QDRANT_API_KEY || '',
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || 'intervalai_cards',
  OVMS_EMBED_URL: process.env.OVMS_EMBED_URL || 'http://ovms-embed:8000',
  EMBED_MODEL_NAME: process.env.EMBED_MODEL_NAME || 'text_embed',
  EMBED_OUTPUT_NAME: process.env.EMBED_OUTPUT_NAME || 'last_hidden_state',
  EMBED_TOKENIZER: process.env.EMBED_TOKENIZER || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  EMBED_DIM: parseInt(process.env.EMBED_DIM, 10) || 384,
  RELATED_K_DEFAULT: parseInt(process.env.RELATED_K_DEFAULT, 10) || 5,
  RELATED_K_MAX: parseInt(process.env.RELATED_K_MAX, 10) || 20,
  RELATED_MIN_SCORE: process.env.RELATED_MIN_SCORE !== undefined
    ? parseFloat(process.env.RELATED_MIN_SCORE)
    : 0.5
};
