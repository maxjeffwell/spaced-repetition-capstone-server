'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Client for OpenVINO Model Server (OVMS) running on NAS
 */
class OpenVINOClient {
    constructor(config = {}) {
        // Default to local if running on the same machine as Docker, 
        // but can be configured to point to the NAS IP
        this.baseUrl = config.baseUrl || process.env.OVMS_URL || 'http://localhost:8000';
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
            console.log('✓ OpenVINO Client: Normalization stats loaded');
        } else {
            console.warn('⚠️ OpenVINO Client: Normalization stats not found. Predictions might be inaccurate.');
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
     * Predict using OpenVINO Model Server REST API
     */
    async predict(questionFeatures) {
        if (!this.isLoaded) await this.load();

        // 8 features matching your training script
        const featureArray = [
            questionFeatures.memoryStrength,
            questionFeatures.difficultyRating,
            questionFeatures.timeSinceLastReview,
            questionFeatures.successRate,
            questionFeatures.averageResponseTime / 1000,
            questionFeatures.totalReviews,
            questionFeatures.consecutiveCorrect,
            questionFeatures.timeOfDay
        ];

        const normalizedFeatures = this.normalize(featureArray);

        try {
            const response = await axios.post(`${this.baseUrl}/v1/models/${this.modelName}:predict`, {
                "instances": [ normalizedFeatures ]
            });

            const interval = response.data.predictions[0][0];
            return Math.max(1, Math.round(interval));
        } catch (error) {
            console.error('❌ OpenVINO Prediction Error:', error.message);
            throw error;
        }
    }
}

module.exports = OpenVINOClient;
