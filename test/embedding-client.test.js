'use strict';
const chai = require('chai');
const expect = chai.expect;
const axios = require('axios');
const { l2normalize, EmbeddingClient } = require('../ml/embedding-client');

function l2(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

describe('l2normalize', function() {
  it('returns a unit vector', function() {
    const out = l2normalize([3, 4]);
    expect(l2(out)).to.be.closeTo(1, 1e-6);
    expect(out[0]).to.be.closeTo(0.6, 1e-6);
    expect(out[1]).to.be.closeTo(0.8, 1e-6);
  });
  it('handles the zero vector without NaN', function() {
    l2normalize([0, 0, 0]).forEach(v => expect(Number.isNaN(v)).to.equal(false));
  });
});

describe('EmbeddingClient.embed', function() {
  let origPost;
  beforeEach(function() { origPost = axios.post; });
  afterEach(function() { axios.post = origPost; });

  it('posts prefixed text to /v3/embeddings and returns a normalized vector', async function() {
    let captured;
    axios.post = async (url, body) => {
      captured = { url, body };
      return { data: { data: [{ embedding: [3, 4] }] } };
    };
    const client = new EmbeddingClient({ baseUrl: 'http://ovms', modelName: 'e5-large', prefix: 'query: ' });
    const vec = await client.embed('casa house');

    expect(captured.url).to.equal('http://ovms/v3/embeddings');
    expect(captured.body).to.deep.equal({ model: 'e5-large', input: 'query: casa house' });
    expect(l2(vec)).to.be.closeTo(1, 1e-6); // [3,4] -> [0.6,0.8]
    expect(vec[0]).to.be.closeTo(0.6, 1e-6);
  });

  it('throws when the response has no embedding', async function() {
    axios.post = async () => ({ data: { data: [] } });
    const client = new EmbeddingClient({ baseUrl: 'http://ovms', modelName: 'e5-large', prefix: '' });
    let threw = false;
    try { await client.embed('x'); } catch (e) { threw = true; }
    expect(threw).to.equal(true);
  });
});
