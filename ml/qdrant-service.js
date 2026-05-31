'use strict';

const { QdrantClient } = require('@qdrant/js-client-rest');
const config = require('../config');
const embeddingClient = require('./embedding-client');
const { cardPointId } = require('./card-id');
const logger = require('../utils/logger').child('QdrantService');

class QdrantService {
  constructor(opts = {}) {
    this.enabled = opts.enabled !== undefined ? opts.enabled : config.VECTOR_SEARCH_ENABLED;
    this.collection = opts.collection || config.QDRANT_COLLECTION;
    this.dim = opts.dim || config.EMBED_DIM;
    this.embeddingClient = opts.embeddingClient || embeddingClient;
    this.client = null;
    if (this.enabled) {
      this.client = new QdrantClient({
        url: config.QDRANT_URL,
        apiKey: config.QDRANT_API_KEY || undefined
      });
    }
  }

  // Create the collection + userId payload index if absent. Fail-open.
  async ensureCollection() {
    if (!this.enabled) return;
    try {
      const existing = await this.client.getCollections();
      const names = (existing.collections || []).map(c => c.name);
      if (!names.includes(this.collection)) {
        await this.client.createCollection(this.collection, {
          vectors: { size: this.dim, distance: 'Cosine' }
        });
        await this.client.createPayloadIndex(this.collection, {
          field_name: 'userId',
          field_schema: 'keyword'
        });
        logger.info('Created Qdrant collection', { collection: this.collection });
      }
    } catch (err) {
      logger.error('ensureCollection failed (continuing)', { error: err.message });
    }
  }

  async upsertCard(card, userId) {
    if (!this.enabled) return;
    const text = `${card.question} ${card.answer}`;
    const vector = await this.embeddingClient.embed(text);
    await this.client.upsert(this.collection, {
      points: [{
        id: cardPointId(card._id),
        vector,
        payload: {
          userId: String(userId),
          cardId: String(card._id),
          question: card.question,
          answer: card.answer
        }
      }]
    });
  }

  async deleteCard(cardId) {
    if (!this.enabled) return;
    await this.client.delete(this.collection, { points: [cardPointId(cardId)] });
  }

  // Index a whole user's deck. Embeddings are cached by text within the run
  // (the seed deck repeats the same strings across users). Fail-open per card.
  async indexUserDeck(user) {
    if (!this.enabled) return;
    const cache = new Map();
    const points = [];
    for (const card of user.questions) {
      const text = `${card.question} ${card.answer}`;
      let vector = cache.get(text);
      if (!vector) {
        vector = await this.embeddingClient.embed(text);
        cache.set(text, vector);
      }
      points.push({
        id: cardPointId(card._id),
        vector,
        payload: {
          userId: String(user._id),
          cardId: String(card._id),
          question: card.question,
          answer: card.answer
        }
      });
    }
    if (points.length) {
      await this.client.upsert(this.collection, { points });
    }
    return points.length;
  }

  // Recommend by the card's stored vector, scoped to the user. `recommend`
  // excludes the example point from results. Apply the score floor + cap.
  async related(cardId, userId, k, minScore) {
    if (!this.enabled) return [];
    const res = await this.client.recommend(this.collection, {
      positive: [cardPointId(cardId)],
      filter: { must: [{ key: 'userId', match: { value: String(userId) } }] },
      limit: k,
      with_payload: true
    });
    return (res || [])
      .filter(p => p.score >= minScore)
      .slice(0, k)
      .map(p => ({
        cardId: p.payload.cardId,
        question: p.payload.question,
        answer: p.payload.answer,
        score: p.score
      }));
  }
}

const qdrantService = new QdrantService();
module.exports = qdrantService;
module.exports.QdrantService = QdrantService;
