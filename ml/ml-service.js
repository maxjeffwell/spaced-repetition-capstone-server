'use strict';

/**
 * ML Model Service
 *
 * Singleton service that loads and manages the ML model
 * for interval prediction across the application
 */

const IntervalPredictionModel = require('./model');
const OpenVINOClient = require('./openvino-client');
const TritonClient = require('./triton-client');
const path = require('path');
const logger = require('../utils/logger').child('MLService');

class MLService {
  constructor() {
    this.model = null;
    this.isReady = false;
    this.isLoading = false;
    this.useOpenVino = process.env.USE_OPENVINO === 'true';
    this.useTriton = process.env.USE_TRITON === 'true';
  }

  /**
   * Initialize and load the ML model
   */
  async initialize(modelPath = 'ml/saved-model') {
    if (this.isReady) {
      logger.debug('ML model already loaded');
      return;
    }

    if (this.isLoading) {
      logger.debug('ML model is already loading');
      return;
    }

    this.isLoading = true;

    try {
      if (this.useTriton) {
        logger.info('Loading Triton Model Client');
        this.model = new TritonClient();
        await this.model.load();
        this.isReady = true;
        this.isLoading = false;
        logger.info('Triton Inference Server client ready');
        return;
      }

      if (this.useOpenVino) {
        logger.info('Loading OpenVINO Model Client');
        this.model = new OpenVINOClient();
        await this.model.load();
        this.isReady = true;
        this.isLoading = false;
        logger.info('OpenVINO Model Server client ready');
        return;
      }

      logger.info('Loading local ML model', { modelPath });
      this.model = new IntervalPredictionModel();

      const fullPath = path.resolve(modelPath);
      const fs = require('fs');

      // Check if model exists
      if (!fs.existsSync(path.join(fullPath, 'model.json'))) {
        logger.warn('ML model not found, using baseline algorithm only', {
          hint: 'Train a model with: node scripts/train-model.js'
        });
        this.isLoading = false;
        return;
      }

      await this.model.load(modelPath);
      this.isReady = true;
      this.isLoading = false;

      logger.info('ML model loaded and ready for predictions');

    } catch (error) {
      logger.error('Failed to load ML model, falling back to baseline', { error: error.message });
      this.model = null;
      this.isReady = false;
      this.isLoading = false;
    }
  }

  /**
   * Get the ML model instance
   */
  getModel() {
    return this.isReady ? this.model : null;
  }

  /**
   * Check if ML model is available
   */
  isAvailable() {
    return this.isReady && this.model !== null;
  }

  /**
   * Get model status
   */
  getStatus() {
    return {
      isReady: this.isReady,
      isLoading: this.isLoading,
      modelLoaded: this.model !== null
    };
  }
}

// Export singleton instance
const mlService = new MLService();

module.exports = mlService;
