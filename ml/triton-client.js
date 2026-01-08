'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createAdvancedFeatureVector, getFeatureArray } = require('./advanced-features');

/**
 * Client for ML Inference with 3-tier fallback
 * Priority 1: Local GPU (GTX 1080 via Cloudflare tunnel) - Triton
 * Priority 2: RunPod vLLM (serverless GPU)
 * Priority 3: VPS CPU (triton-service in cluster) - Triton
 */
class TritonClient {
    constructor(config = {}) {
        // Tier 1: Local GPU via Cloudflare tunnel (Triton)
        this.primaryUrl = config.primaryUrl || process.env.PRIMARY_TRITON_URL || 'https://intervalai-triton.el-jefe.me';

        // Tier 2: RunPod vLLM (serverless)
        this.runpodUrl = config.runpodUrl || process.env.RUNPOD_URL || 'https://api.runpod.ai/v2/7a2s0z4p6x0i8n';
        this.runpodApiKey = config.runpodApiKey || process.env.RUNPOD_API_KEY;

        // Tier 3: VPS CPU Triton
        this.fallbackUrl = config.fallbackUrl || process.env.FALLBACK_TRITON_URL || 'http://triton-service:8000';

        // Legacy single URL support
        this.legacyUrl = process.env.TRITON_URL;

        this.modelName = config.modelName || process.env.TRITON_MODEL_NAME || 'interval_ai';
        this.isLoaded = false;

        // Health cache to avoid hammering backends
        this.healthCache = {
            primary: { status: 'unknown', lastCheck: 0 },
            runpod: { status: 'unknown', lastCheck: 0 },
            fallback: { status: 'unknown', lastCheck: 0 }
        };
        this.healthCacheTTL = 30000; // 30 seconds

        this.featureStats = {
            mean: null,
            std: null
        };
    }

    /**
     * Load normalization stats from disk
     */
    async load(statsPath = 'ml/saved-model/normalization-stats.json') {
        const fullPath = path.resolve(statsPath);
        if (fs.existsSync(fullPath)) {
            const stats = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            this.featureStats.mean = stats.mean;
            this.featureStats.std = stats.std;
            this.isLoaded = true;
            console.log('✓ Triton Client: Normalization stats loaded');
        }
    }

    /**
     * Normalize features locally
     */
    normalize(features) {
        if (!this.featureStats.mean || !this.featureStats.std) return features;
        return features.map((val, i) => {
            const mean = this.featureStats.mean[i];
            const std = this.featureStats.std[i] || 1e-8;
            return (val - mean) / std;
        });
    }

    /**
     * Check backend health with caching
     */
    async checkHealth(backend) {
        const now = Date.now();
        const cache = this.healthCache[backend];

        // Return cached result if fresh
        if (now - cache.lastCheck < this.healthCacheTTL && cache.status !== 'unknown') {
            return cache.status === 'healthy';
        }

        try {
            let response;

            if (backend === 'runpod') {
                // RunPod health check - just check if we have an API key
                if (!this.runpodApiKey) {
                    throw new Error('No RunPod API key configured');
                }
                // RunPod serverless is always "ready" if we have a key
                // Actual availability is checked per-request
                response = { status: 200 };
            } else {
                // Triton health check (primary or fallback)
                const url = backend === 'primary' ? this.primaryUrl : this.fallbackUrl;
                response = await axios.get(`${url}/v2/health/ready`, { timeout: 5000 });
            }

            cache.status = response.status === 200 ? 'healthy' : 'unhealthy';
            cache.lastCheck = now;
            console.log(`✓ Health check (${backend}): ${cache.status}`);
            return cache.status === 'healthy';
        } catch (error) {
            cache.status = 'unhealthy';
            cache.lastCheck = now;
            console.log(`✗ Health check (${backend}): unhealthy - ${error.message}`);
            return false;
        }
    }

    /**
     * Get the best available backend (3-tier fallback)
     * 1. Local GPU (Triton) -> 2. RunPod vLLM -> 3. VPS CPU (Triton)
     */
    async getActiveBackend() {
        // Legacy mode: if TRITON_URL is explicitly set, use it directly
        if (this.legacyUrl) {
            return { url: this.legacyUrl, backend: 'legacy', type: 'triton' };
        }

        // Tier 1: Try primary (local GPU Triton)
        if (await this.checkHealth('primary')) {
            return { url: this.primaryUrl, backend: 'primary (Local GPU)', type: 'triton' };
        }

        // Tier 2: Try RunPod vLLM
        if (await this.checkHealth('runpod')) {
            return { url: this.runpodUrl, backend: 'runpod (Serverless GPU)', type: 'runpod' };
        }

        // Tier 3: Fall back to VPS CPU Triton
        if (await this.checkHealth('fallback')) {
            return { url: this.fallbackUrl, backend: 'fallback (VPS CPU)', type: 'triton' };
        }

        throw new Error('All ML backends unavailable');
    }

    /**
     * Predict using appropriate API based on backend type
     * @param {Object} baseFeatures - Object with 8 base features from createFeatureVector()
     * @param {Array} reviewHistory - Optional review history for advanced features
     */
    async predict(baseFeatures, reviewHistory = null) {
        if (!this.isLoaded) await this.load();

        // Convert 8 base features → 51 advanced features → array
        const advancedFeatures = createAdvancedFeatureVector(baseFeatures, reviewHistory);
        const featureArray = getFeatureArray(advancedFeatures);

        // Normalize the 51-element array
        const normalizedFeatures = this.normalize(featureArray);

        console.log(`📊 Features: ${featureArray.length} (base: ${Object.keys(baseFeatures).length})`);

        const { url, backend, type } = await this.getActiveBackend();
        console.log(`🔮 Using ML Backend: ${backend}`);

        try {
            let interval;

            if (type === 'runpod') {
                interval = await this.predictRunPod(url, normalizedFeatures);
            } else {
                interval = await this.predictTriton(url, normalizedFeatures);
            }

            return Math.max(1, Math.round(interval));
        } catch (error) {
            console.error(`❌ Prediction Error (${backend}):`, error.message);

            // Invalidate current backend and retry with next tier
            if (backend.includes('primary')) {
                this.healthCache.primary.status = 'unhealthy';
                this.healthCache.primary.lastCheck = Date.now();
                console.log('⚠️ Primary failed, trying RunPod...');
                return this.predict(baseFeatures, reviewHistory);
            } else if (backend.includes('runpod')) {
                this.healthCache.runpod.status = 'unhealthy';
                this.healthCache.runpod.lastCheck = Date.now();
                console.log('⚠️ RunPod failed, trying VPS CPU...');
                return this.predict(baseFeatures, reviewHistory);
            }

            throw error;
        }
    }

    /**
     * Predict using Triton REST API (KServe V2)
     */
    async predictTriton(url, normalizedFeatures) {
        const response = await axios.post(`${url}/v2/models/${this.modelName}/versions/1/infer`, {
            "inputs": [
                {
                    "name": "dense_input",
                    "shape": [1, 51],
                    "datatype": "FP32",
                    "data": normalizedFeatures
                }
            ]
        }, { timeout: 10000 });

        return response.data.outputs[0].data[0];
    }

    /**
     * Predict using RunPod Serverless API
     */
    async predictRunPod(url, normalizedFeatures) {
        const response = await axios.post(`${url}/runsync`, {
            "input": {
                "features": normalizedFeatures,
                "model_name": this.modelName
            }
        }, {
            timeout: 30000, // RunPod cold starts can take longer
            headers: {
                'Authorization': `Bearer ${this.runpodApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // RunPod returns { output: { interval: X } } or similar
        if (response.data.output && typeof response.data.output.interval === 'number') {
            return response.data.output.interval;
        } else if (response.data.output && typeof response.data.output === 'number') {
            return response.data.output;
        } else if (Array.isArray(response.data.output)) {
            return response.data.output[0];
        }

        throw new Error('Unexpected RunPod response format');
    }
}

module.exports = TritonClient;
