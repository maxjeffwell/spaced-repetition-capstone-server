'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger').child('EmbeddingClient');

/**
 * Mean-pool token embeddings using the attention mask, then L2-normalize.
 * @param {number[][]} tokenEmbeddings  seqLen x dim
 * @param {number[]} attentionMask      seqLen (1 = keep, 0 = pad)
 * @returns {number[]} dim-length unit vector
 */
function meanPoolNormalize(tokenEmbeddings, attentionMask) {
  const dim = tokenEmbeddings[0].length;
  const pooled = new Array(dim).fill(0);
  let maskSum = 0;
  for (let t = 0; t < tokenEmbeddings.length; t++) {
    const m = attentionMask[t] || 0;
    if (!m) continue;
    maskSum += m;
    const row = tokenEmbeddings[t];
    for (let d = 0; d < dim; d++) pooled[d] += row[d] * m;
  }
  const denom = maskSum > 0 ? maskSum : 1e-9;
  for (let d = 0; d < dim; d++) pooled[d] /= denom;
  let norm = 0;
  for (let d = 0; d < dim; d++) norm += pooled[d] * pooled[d];
  norm = Math.sqrt(norm) || 1e-9;
  return pooled.map(v => v / norm);
}

class EmbeddingClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || config.OVMS_EMBED_URL;
    this.modelName = opts.modelName || config.EMBED_MODEL_NAME;
    this.outputName = opts.outputName || config.EMBED_OUTPUT_NAME;
    this.tokenizerName = opts.tokenizerName || config.EMBED_TOKENIZER;
    this.tokenizer = null;
  }

  // Lazy-load the ESM-only tokenizer (no model weights, just vocab/merges).
  async _getTokenizer() {
    if (this.tokenizer) return this.tokenizer;
    const { AutoTokenizer } = await import('@xenova/transformers');
    this.tokenizer = await AutoTokenizer.from_pretrained(this.tokenizerName);
    return this.tokenizer;
  }

  /**
   * Embed a single text into a 384-dim unit vector.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const tokenizer = await this._getTokenizer();
    const enc = await tokenizer(text, { add_special_tokens: true });
    // enc.* are Tensors; flatten to plain arrays. The BERT IR requires three
    // inputs: input_ids, attention_mask, AND token_type_ids (all zeros for a
    // single sentence — the tokenizer provides them when available).
    const ids = Array.from(enc.input_ids.data, Number);
    const mask = Array.from(enc.attention_mask.data, Number);
    const seqLen = ids.length;
    const typeIds = enc.token_type_ids
      ? Array.from(enc.token_type_ids.data, Number)
      : new Array(seqLen).fill(0);

    const resp = await axios.post(
      `${this.baseUrl}/v2/models/${this.modelName}/infer`,
      {
        inputs: [
          { name: 'input_ids', shape: [1, seqLen], datatype: 'INT64', data: ids },
          { name: 'attention_mask', shape: [1, seqLen], datatype: 'INT64', data: mask },
          { name: 'token_type_ids', shape: [1, seqLen], datatype: 'INT64', data: typeIds }
        ]
      },
      { timeout: 10000 }
    );

    const out = (resp.data.outputs || []).find(o => o.name === this.outputName)
      || resp.data.outputs[0];
    if (!out) throw new Error('OVMS returned no outputs');

    // out.shape is [1, seqLen, dim]; out.data is a flat row-major array.
    const dim = out.shape[out.shape.length - 1];
    const tokenEmbeddings = [];
    for (let t = 0; t < seqLen; t++) {
      tokenEmbeddings.push(out.data.slice(t * dim, (t + 1) * dim));
    }
    return meanPoolNormalize(tokenEmbeddings, mask);
  }
}

// Export singleton + the pure helper + the class (for tests/custom instances).
const embeddingClient = new EmbeddingClient();
module.exports = embeddingClient;
module.exports.meanPoolNormalize = meanPoolNormalize;
module.exports.EmbeddingClient = EmbeddingClient;
