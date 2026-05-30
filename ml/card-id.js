'use strict';

const { v5: uuidv5 } = require('uuid');

// Fixed namespace UUID for IntervalAI card point ids. Constant on purpose:
// changing it would orphan every existing Qdrant point. Must be a valid
// RFC-4122 UUID (uuid v14's parse() rejects non-compliant version nibbles).
const CARD_NAMESPACE = 'f1d2c3b4-5a6e-4b7c-8d9e-0a1b2c3d4e5f';

/**
 * Map a MongoDB card ObjectId to a deterministic UUIDv5 usable as a Qdrant
 * point id. Pure and stable: same ObjectId always yields the same UUID.
 * @param {string|object} cardObjectId
 * @returns {string} UUIDv5
 */
function cardPointId(cardObjectId) {
  return uuidv5(String(cardObjectId), CARD_NAMESPACE);
}

module.exports = { cardPointId, CARD_NAMESPACE };
