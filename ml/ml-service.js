'use strict';

/**
 * ML Model Service
 *
 * Singleton service that loads and manages the ML model
 * for interval prediction across the application
 */

const IntervalPredictionModel = require('./model');
const path = require('path');

class MLService {
  constructor() {
    this.model = null;
    this.isReady = false;
    this.isLoading = false;
  }

  /**
   * Initialize and load the ML model
   */
  async initialize(modelPath = 'ml/saved-model') {
    if (this.isReady) {
      console.log('✓ ML model already loaded');
      return;
    }

    if (this.isLoading) {
      console.log('⏳ ML model is already loading...');
      return;
    }

    this.isLoading = true;

    try {
      console.log('Loading ML model...');
      this.model = new IntervalPredictionModel();

      const fullPath = path.resolve(modelPath);
      const fs = require('fs');

      // Check if model exists
      if (!fs.existsSync(path.join(fullPath, 'model.json'))) {
        console.log('⚠️  ML model not found. Using baseline algorithm only.');
        console.log('   Train a model with: node scripts/train-model.js');
        this.isLoading = false;
        return;
      }

      await this.model.load(modelPath);
      this.isReady = true;
      this.isLoading = false;

      console.log('✓ ML model loaded and ready for predictions');
      console.log('  Model path:', fullPath);
      console.log('  Model instance:', this.model ? 'exists' : 'null');
      console.log('  Model loaded:', this.model.isLoaded);

    } catch (error) {
      console.error('❌ Failed to load ML model:', error.message);
      console.log('   Falling back to baseline algorithm');
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
