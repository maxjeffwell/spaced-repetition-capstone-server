'use strict';
const chai = require('chai');
const expect = chai.expect;
const { InferenceClient } = require('../ml/inference-client');

// 8 base features + graded outcome, as createFeatureVector() produces them.
const BASE = {
  memoryStrength: 0.5, difficultyRating: 0.5, timeSinceLastReview: 3, successRate: 0.8,
  averageResponseTime: 2000, totalReviews: 5, consecutiveCorrect: 2, timeOfDay: 0.5, recalled: 1
};

function fakeHttp({ ready = true, inferValue = 7.4, inferError = null } = {}) {
  const calls = { get: [], post: [] };
  return {
    calls,
    async get(url) { calls.get.push(url); if (!ready) throw new Error('ECONNREFUSED'); return { status: 200 }; },
    async post(url, body) {
      calls.post.push({ url, body });
      if (inferError) throw inferError;
      return { data: { outputs: [{ data: [inferValue] }] } };
    }
  };
}

function fakeLocal({ value = 11, loadError = null } = {}) {
  const m = { loads: 0, predicts: 0, isLoaded: false };
  m.load = async () => { m.loads++; if (loadError) throw loadError; m.isLoaded = true; };
  m.predict = (features) => { m.predicts++; m.lastFeatures = features; return value; };
  return m;
}

function makeClient(http, local, extra = {}) {
  return new InferenceClient({
    primaryUrl: 'http://ovms:8000', modelName: 'interval_ai', http,
    localModelFactory: () => local,
    statsPath: 'ml/saved-model/normalization-stats.json',
    ...extra
  });
}

describe('InferenceClient (2-tier: OVMS -> local tfjs)', function() {
  it('tier 1: posts a normalized 24-feature vector to OVMS and rounds the result', async function() {
    const http = fakeHttp({ inferValue: 7.4 });
    const local = fakeLocal();
    const c = makeClient(http, local);
    const interval = await c.predict(BASE, null);
    expect(interval).to.equal(7);
    expect(http.calls.get[0]).to.equal('http://ovms:8000/v2/health/ready');
    expect(http.calls.post).to.have.length(1);
    expect(http.calls.post[0].url).to.equal('http://ovms:8000/v2/models/interval_ai/infer');
    const input = http.calls.post[0].body.inputs[0];
    expect(input.name).to.equal('dense_input');
    expect(input.shape).to.deep.equal([1, 24]);
    expect(input.data).to.have.length(24);
    expect(local.predicts).to.equal(0);
    expect(c.lastBackend).to.equal('ovms');
  });

  it('tier 2: uses the local model when OVMS is not ready, passing the graded outcome through', async function() {
    const http = fakeHttp({ ready: false });
    const local = fakeLocal({ value: 11 });
    const c = makeClient(http, local);
    const interval = await c.predict({ ...BASE, recalled: 0 }, null);
    expect(interval).to.equal(11);
    expect(http.calls.post).to.have.length(0);
    expect(local.loads).to.equal(1);
    expect(local.lastFeatures.recalled).to.equal(0);
    expect(c.lastBackend).to.equal('local');
  });

  it('falls back to local on an OVMS inference error and remembers OVMS as unhealthy', async function() {
    const http = fakeHttp({ inferError: new Error('timeout') });
    const local = fakeLocal({ value: 4 });
    const c = makeClient(http, local);
    expect(await c.predict(BASE)).to.equal(4);
    expect(await c.predict(BASE)).to.equal(4);
    expect(http.calls.post).to.have.length(1, 'no second OVMS attempt inside the health TTL');
    expect(http.calls.get).to.have.length(1, 'health is cached, not re-probed per call');
    expect(local.loads).to.equal(1, 'local model is loaded once');
  });

  it('re-probes OVMS after the health cache expires', async function() {
    const http = fakeHttp({ ready: false });
    const local = fakeLocal();
    const c = makeClient(http, local, { healthCacheTTL: 0 });
    await c.predict(BASE);
    http.ready = true; http.get = async (url) => { http.calls.get.push(url); return { status: 200 }; };
    await c.predict(BASE);
    expect(http.calls.post).to.have.length(1);
  });

  it('throws when both tiers are unavailable so the caller can use the baseline algorithm', async function() {
    const http = fakeHttp({ ready: false });
    const local = fakeLocal({ loadError: new Error('no model files') });
    const c = makeClient(http, local);
    let err;
    try { await c.predict(BASE); } catch (e) { err = e; }
    expect(err).to.be.an('error');
    expect(err.message).to.match(/unavailable/i);
  });

  it('reports exactly two tiers and no RunPod configuration', function() {
    const c = makeClient(fakeHttp(), fakeLocal());
    expect(c.tiers()).to.deep.equal(['ovms', 'local']);
    expect(JSON.stringify(c)).to.not.match(/runpod/i);
  });
});

describe('InferenceClient non-finite output guard', function() {
  function emptyOvms() {
    const calls = { get: 0, post: 0 };
    return { calls,
      async get() { calls.get++; return { status: 200 }; },
      // OVMS drops NaN/Inf from the JSON body: shape [1,1] but data []
      async post() { calls.post++; return { data: { outputs: [{ name: 'output_0', shape: [1, 1], datatype: 'FP32', data: [] }] } }; } };
  }
  it('treats an empty/non-finite OVMS output as a miss and uses the local tier for that call', async function() {
    const http = emptyOvms();
    const local = fakeLocal({ value: 116 });
    const c = makeClient(http, local);
    expect(await c.predict(BASE)).to.equal(116);
    expect(c.lastBackend).to.equal('local');
  });
  it('does not mark OVMS unhealthy for an input-specific non-finite result', async function() {
    const http = emptyOvms();
    const c = makeClient(http, fakeLocal({ value: 5 }));
    await c.predict(BASE); await c.predict(BASE);
    expect(http.calls.post).to.equal(2, 'OVMS is still tried on the next call');
  });
  it('rejects a non-finite local result instead of returning NaN', async function() {
    const http = fakeHttp({ ready: false });
    const c = makeClient(http, fakeLocal({ value: NaN }));
    let err; try { await c.predict(BASE); } catch (e) { err = e; }
    expect(err).to.be.an('error');
    expect(err.message).to.match(/non-finite/i);
  });
  it('clamps predictions to 1..365 days', async function() {
    expect(await makeClient(fakeHttp({ inferValue: 900 }), fakeLocal()).predict(BASE)).to.equal(365);
    expect(await makeClient(fakeHttp({ inferValue: -3 }), fakeLocal()).predict(BASE)).to.equal(1);
  });
});
