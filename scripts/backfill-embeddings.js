'use strict';

/**
 * One-off backfill: embed every existing user's cards into Qdrant.
 * Usage:
 *   VECTOR_SEARCH_ENABLED=true MONGODB_URI=... QDRANT_URL=... \
 *   OVMS_EMBED_URL=... node scripts/backfill-embeddings.js
 */

const mongoose = require('mongoose');
const config = require('./../config');
const { dbConnect, dbDisconnect } = require('../db-mongoose');
const User = require('../models/user');
const qdrantService = require('../ml/qdrant-service');
const logger = require('../utils/logger').child('Backfill');

async function backfillAll() {
  if (!qdrantService.enabled) {
    logger.error('VECTOR_SEARCH_ENABLED is not true; refusing to run.');
    return { users: 0, points: 0 };
  }
  await qdrantService.ensureCollection();

  let users = 0;
  let points = 0;
  const cursor = User.find({}, 'questions').cursor();
  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    try {
      const n = await qdrantService.indexUserDeck(user);
      users += 1;
      points += n || 0;
      logger.info('Indexed user', { userId: user.id, cards: n });
    } catch (err) {
      logger.warn('Failed to index user (continuing)', { userId: user.id, error: err.message });
    }
  }
  logger.info('Backfill complete', { users, points });
  return { users, points };
}

// Run directly (not when require()'d by a test).
if (require.main === module) {
  (async () => {
    await dbConnect(config.MONGODB_URI);
    try {
      await backfillAll();
    } finally {
      await dbDisconnect();
    }
  })().catch(err => {
    logger.error('Backfill failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { backfillAll };
