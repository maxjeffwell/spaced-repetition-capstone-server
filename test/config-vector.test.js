'use strict';
const chai = require('chai');
const expect = chai.expect;

describe('Vector search config', function() {
  it('exposes vector-search defaults', function() {
    delete require.cache[require.resolve('../config')];
    const config = require('../config');
    expect(config.QDRANT_COLLECTION).to.equal('intervalai_cards');
    expect(config.EMBED_DIM).to.equal(384);
    expect(config.EMBED_MODEL_NAME).to.equal('text_embed');
    expect(config.RELATED_K_DEFAULT).to.equal(5);
    expect(config.RELATED_K_MAX).to.equal(20);
    expect(config.RELATED_MIN_SCORE).to.be.a('number');
    expect(config.VECTOR_SEARCH_ENABLED).to.equal(false);
  });
});
