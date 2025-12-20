'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Client for Triton Inference Server running on AMD VPS
 */
class TritonClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || process.env.TRITON_URL || 'http://triton-service:8000';
        this.modelName = config.modelName || 'interval_ai';
        this.isLoaded = false;
        
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
     * Predict using Triton REST API (Standard KServe V2)
     */
    async predict(questionFeatures) {
        if (!this.isLoaded) await this.load();

        // 51 features matching your advanced model
        // For simplicity in this demo, assuming questionFeatures is the array:
        const normalizedFeatures = this.normalize(questionFeatures);

        try {
            // Triton expects a specific JSON structure for V2 API
            const response = await axios.post(`${this.baseUrl}/v2/models/${this.modelName}/versions/1/infer`, {
                "inputs": [
                    {
                        "name": "dense_input", 
                        "shape": [1, 51],
                        "datatype": "FP32",
                        "data": normalizedFeatures
                    }
                ]
            });

            // Extract result
            const interval = response.data.outputs[0].data[0];
            return Math.max(1, Math.round(interval));
        } catch (error) {
            console.error('❌ Triton Prediction Error:', error.message);
            throw error;
        }
    }
}

module.exports = TritonClient;
