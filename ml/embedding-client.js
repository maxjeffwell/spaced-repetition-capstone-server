'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger').child('EmbeddingClient');

/**
 * L2-normalize a vector. Insurance so cosine == dot product in Qdrant even if
 * the server returns un-normalized embeddings. Idempotent on unit vectors.
 * @param {number[]} vec
 * @returns {number[]}
 */
function l2normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1e-9;
  return vec.map(v => v / norm);
}

/**
 * Client for OVMS's OpenAI-compatible embeddings endpoint (/v3/embeddings).
 * The model server owns tokenization, the model, and pooling — we send text
 * and receive a vector. e5 models need a task prefix on the input text.
 */
class EmbeddingClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || config.OVMS_EMBED_URL;
    this.modelName = opts.modelName || config.EMBED_MODEL_NAME;
    this.prefix = opts.prefix !== undefined ? opts.prefix : config.EMBED_TEXT_PREFIX;
  }

  /**
   * Embed a single text into a unit vector (EMBED_DIM dimensions).
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const resp = await axios.post(
      `${this.baseUrl}/v3/embeddings`,
      { model: this.modelName, input: `${this.prefix}${text}` },
      { timeout: 10000 }
    );

    const vec = resp.data && resp.data.data && resp.data.data[0]
      ? resp.data.data[0].embedding
      : null;
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error('OVMS embeddings: no embedding in response');
    }
    return l2normalize(vec);
  }
}

// Export singleton + the pure helper + the class (for tests/custom instances).
const embeddingClient = new EmbeddingClient();
module.exports = embeddingClient;
module.exports.l2normalize = l2normalize;
module.exports.EmbeddingClient = EmbeddingClient;
