'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createAdvancedFeatureVector, getFeatureArray } = require('./advanced-features');

/**
 * Interval-prediction inference client with a 2-tier fallback.
 *
 *   Tier 1 "ovms"  : OpenVINO Model Server on the cluster's Intel iGPU, reached over
 *                    the KServe v2 REST API (PRIMARY_TRITON_URL, TRITON_MODEL_NAME).
 *   Tier 2 "local" : the same v2 model loaded in-process with TensorFlow.js
 *                    (ml/saved-model). Loaded lazily, only when tier 1 is down.
 *
 * If both tiers are unavailable predict() throws; the algorithm manager catches
 * that and falls back to the SM-2 baseline, so a dead model server never fails
 * a review. Health of tier 1 is cached for healthCacheTTL ms so a down OVMS
 * costs one probe per TTL rather than one per prediction.
 *
 * Both tiers consume the same normalized 24-feature v2 vector (see
 * advanced-features.js); tier 1 is normalized here with the stats file, tier 2
 * normalizes internally with the same stats.
 */
class InferenceClient {
  constructor(config = {}) {
    this.primaryUrl = config.primaryUrl || process.env.PRIMARY_TRITON_URL || 'http://ovms-embeddings.ovms:8000';
    this.modelName = config.modelName || process.env.TRITON_MODEL_NAME || 'interval_ai';
    this.statsPath = config.statsPath || 'ml/saved-model/normalization-stats.json';
    this.localModelPath = config.localModelPath || 'ml/saved-model';
    this.http = config.http || axios;
    this.healthCacheTTL = config.healthCacheTTL !== undefined ? config.healthCacheTTL : 30000;
    this.healthTimeoutMs = config.healthTimeoutMs || 5000;
    this.inferTimeoutMs = config.inferTimeoutMs || 10000;

    // Tier 2 is constructed on first use so tfjs is not loaded while OVMS is healthy.
    this._localModelFactory = config.localModelFactory || (() => {
      const IntervalPredictionModel = require('./model');
      return new IntervalPredictionModel();
    });
    this._local = null;          // { model, state: 'ready' | 'failed' }

    this.health = { status: 'unknown', lastCheck: 0 };
    this.featureStats = { mean: null, std: null };
    this.isLoaded = false;
    this.lastBackend = null;
  }

  tiers() { return ['ovms', 'local']; }

  /** Load normalization stats used for the tier-1 request. */
  async load(statsPath = this.statsPath) {
    const fullPath = path.resolve(statsPath);
    if (fs.existsSync(fullPath)) {
      const stats = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      this.featureStats.mean = stats.mean;
      this.featureStats.std = stats.std;
      console.log('✓ InferenceClient: normalization stats loaded');
    } else {
      console.warn('⚠️ InferenceClient: normalization stats not found; OVMS predictions will be unnormalized');
    }
    this.isLoaded = true;
  }

  normalize(features) {
    if (!this.featureStats.mean || !this.featureStats.std) return features;
    return features.map((val, i) => (val - this.featureStats.mean[i]) / (this.featureStats.std[i] || 1e-8));
  }

  /** Cached readiness probe of OVMS. */
  async ovmsReady() {
    const now = Date.now();
    if (this.health.status !== 'unknown' && now - this.health.lastCheck < this.healthCacheTTL) {
      return this.health.status === 'healthy';
    }
    try {
      const r = await this.http.get(`${this.primaryUrl}/v2/health/ready`, { timeout: this.healthTimeoutMs });
      this.health.status = r.status === 200 ? 'healthy' : 'unhealthy';
    } catch (err) {
      this.health.status = 'unhealthy';
      console.log(`✗ OVMS not ready (${err.message}); using local model`);
    }
    this.health.lastCheck = now;
    return this.health.status === 'healthy';
  }

  markOvmsUnhealthy() {
    this.health.status = 'unhealthy';
    this.health.lastCheck = Date.now();
  }

  /**
   * @param {Object} baseFeatures  8 base features + `recalled` (graded outcome)
   * @param {Array}  reviewHistory kept for API compatibility; v2 features ignore it
   * @returns {Promise<number>} next interval in whole days (>= 1)
   */
  async predict(baseFeatures, reviewHistory = null) {
    if (!this.isLoaded) await this.load();

    if (await this.ovmsReady()) {
      try {
        const interval = await this.predictOvms(baseFeatures, reviewHistory);
        this.lastBackend = 'ovms';
        return Math.max(1, Math.round(interval));
      } catch (err) {
        console.error(`❌ OVMS inference failed (${err.message}); falling back to local model`);
        this.markOvmsUnhealthy();
      }
    }

    const interval = await this.predictLocal(baseFeatures, reviewHistory);
    this.lastBackend = 'local';
    return Math.max(1, Math.round(interval));
  }

  async predictOvms(baseFeatures, reviewHistory) {
    const featureArray = getFeatureArray(createAdvancedFeatureVector(baseFeatures, reviewHistory));
    const data = this.normalize(featureArray);
    // No version in the path: OVMS serves its latest version of the model.
    const response = await this.http.post(`${this.primaryUrl}/v2/models/${this.modelName}/infer`, {
      inputs: [{ name: 'dense_input', shape: [1, data.length], datatype: 'FP32', data }]
    }, { timeout: this.inferTimeoutMs });
    return response.data.outputs[0].data[0];
  }

  async predictLocal(baseFeatures, reviewHistory) {
    if (!this._local) {
      const model = this._localModelFactory();
      try {
        await model.load(this.localModelPath);
        this._local = { model, state: 'ready' };
        console.log('✓ InferenceClient: local tfjs model loaded (tier 2)');
      } catch (err) {
        this._local = { model: null, state: 'failed', error: err.message };
        console.error(`❌ InferenceClient: local model failed to load (${err.message})`);
      }
    }
    if (this._local.state !== 'ready') {
      throw new Error(`All inference tiers unavailable (ovms: ${this.health.status}, local: ${this._local.error})`);
    }
    return this._local.model.predict(baseFeatures, reviewHistory);
  }
}

module.exports = { InferenceClient };
