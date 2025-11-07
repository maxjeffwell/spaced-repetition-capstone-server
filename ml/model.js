'use strict';

/**
 * Advanced Neural Network Model for Spaced Repetition Interval Prediction
 *
 * Uses TensorFlow.js with sophisticated feature engineering including:
 * - 8 base features (memory strength, difficulty, etc.)
 * - Forgetting curve modeling (Ebbinghaus exponential decay)
 * - Interaction features (non-linear relationships)
 * - Polynomial features (higher-order terms)
 * - Cyclical time encoding (sinusoidal)
 * - Moving averages and trends
 * - Momentum features (learning acceleration)
 * - Retention prediction features
 *
 * Total: 51 engineered features
 */

// Use TensorFlow.js Node backend for proper file loading
const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const {
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames
} = require('./advanced-features');

class IntervalPredictionModel {
  constructor() {
    this.model = null;
    this.isLoaded = false;

    // Feature normalization parameters (will be calculated from training data)
    this.featureStats = {
      mean: null,
      std: null
    };
  }

  /**
   * Create the neural network architecture (Enhanced for 51 features)
   */
  createModel() {
    const model = tf.sequential();

    // Input layer: 51 advanced features
    // Larger first layer to handle increased dimensionality
    model.add(tf.layers.dense({
      inputShape: [51],
      units: 128,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Batch normalization for better training stability
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.3 }));

    // Hidden layer 1: Learn complex patterns
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.25 }));

    // Hidden layer 2: Refine patterns
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Hidden layer 3: Final refinement
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Output layer: Predict optimal interval (days)
    // Using softplus to ensure positive output
    model.add(tf.layers.dense({
      units: 1,
      activation: 'softplus'
    }));

    // Compile with Adam optimizer and MSE loss
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    this.model = model;
    return model;
  }

  /**
   * Normalize features using z-score normalization
   */
  normalizeFeatures(features, calculateStats = false) {
    // Features shape: [batchSize, 8]

    if (calculateStats) {
      // Calculate mean and std for training data
      const mean = features.mean(0);
      const std = tf.moments(features, 0).variance.sqrt().add(1e-8);

      this.featureStats.mean = mean;
      this.featureStats.std = std;
    }

    if (!this.featureStats.mean || !this.featureStats.std) {
      throw new Error('Feature statistics not calculated. Train model first.');
    }

    // Normalize: (x - mean) / std
    return features.sub(this.featureStats.mean).div(this.featureStats.std);
  }

  /**
   * Prepare training data from extracted samples (with advanced features)
   */
  prepareTrainingData(trainingData) {
    const features = [];
    const labels = [];

    trainingData.forEach(sample => {
      // Create advanced feature vector (51 dimensions)
      const baseFeatures = {
        memoryStrength: sample.features.memoryStrength,
        difficultyRating: sample.features.difficultyRating,
        timeSinceLastReview: sample.features.timeSinceLastReview,
        successRate: sample.features.successRate,
        averageResponseTime: sample.features.averageResponseTime,
        totalReviews: sample.features.totalReviews,
        consecutiveCorrect: sample.features.consecutiveCorrect,
        timeOfDay: sample.features.timeOfDay
      };

      // Get review history if available
      const reviewHistory = sample.metadata && sample.metadata.reviewHistory
        ? sample.metadata.reviewHistory
        : null;
      const reviewIndex = sample.metadata && sample.metadata.reviewIndex
        ? sample.metadata.reviewIndex
        : null;

      // Generate advanced features
      const advancedFeatures = createAdvancedFeatureVector(baseFeatures, reviewHistory, reviewIndex);
      const featureArray = getFeatureArray(advancedFeatures);

      features.push(featureArray);

      // Label: optimal interval in days
      labels.push(sample.label.optimalInterval);
    });

    return {
      features: tf.tensor2d(features),
      labels: tf.tensor2d(labels, [labels.length, 1])
    };
  }

  /**
   * Train the model
   */
  async train(trainingData, validationSplit = 0.2, epochs = 100) {
    console.log(`\nTraining model on ${trainingData.length} samples...`);

    // Create model if not exists
    if (!this.model) {
      this.createModel();
    }

    // Prepare data
    const { features, labels } = this.prepareTrainingData(trainingData);

    // Normalize features (and calculate stats)
    const normalizedFeatures = this.normalizeFeatures(features, true);

    // Train
    const history = await this.model.fit(normalizedFeatures, labels, {
      epochs,
      validationSplit,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(
              `Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, ` +
              `val_loss=${logs.val_loss.toFixed(4)}, ` +
              `mae=${logs.mae.toFixed(4)}`
            );
          }
        }
      }
    });

    console.log('\n✓ Training complete!');

    // Cleanup tensors
    features.dispose();
    labels.dispose();
    normalizedFeatures.dispose();

    this.isLoaded = true;
    return history;
  }

  /**
   * Predict optimal interval for a single question (with advanced features)
   */
  predict(questionFeatures, reviewHistory = null) {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded. Train or load model first.');
    }

    // Create base features object
    const baseFeatures = {
      memoryStrength: questionFeatures.memoryStrength,
      difficultyRating: questionFeatures.difficultyRating,
      timeSinceLastReview: questionFeatures.timeSinceLastReview,
      successRate: questionFeatures.successRate,
      averageResponseTime: questionFeatures.averageResponseTime,
      totalReviews: questionFeatures.totalReviews,
      consecutiveCorrect: questionFeatures.consecutiveCorrect,
      timeOfDay: questionFeatures.timeOfDay
    };

    // Generate advanced features
    const advancedFeatures = createAdvancedFeatureVector(baseFeatures, reviewHistory);
    const featureArray = getFeatureArray(advancedFeatures);

    const featureTensor = tf.tensor2d([featureArray]);
    const normalizedFeatures = this.normalizeFeatures(featureTensor, false);

    // Predict
    const prediction = this.model.predict(normalizedFeatures);
    const interval = prediction.dataSync()[0];

    // Cleanup
    featureTensor.dispose();
    normalizedFeatures.dispose();
    prediction.dispose();

    // Round to nearest day, minimum 1 day
    return Math.max(1, Math.round(interval));
  }

  /**
   * Save model to disk using JSON format
   */
  async save(modelPath = 'ml/saved-model') {
    if (!this.model) {
      throw new Error('No model to save');
    }

    const fs = require('fs');
    const savePath = path.resolve(modelPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    // Get model configuration
    const modelConfig = this.model.toJSON(null, false);

    // Get weights
    const weights = this.model.getWeights();
    const weightsData = await Promise.all(
      weights.map(async w => ({
        shape: w.shape,
        data: Array.from(await w.data())
      }))
    );

    // Save complete model data
    const modelData = {
      modelTopology: modelConfig,
      weightsManifest: weightsData,
      format: 'layers-model',
      generatedBy: 'spaced-repetition-ml',
      convertedBy: '1.0.0'
    };

    fs.writeFileSync(
      path.join(savePath, 'model.json'),
      JSON.stringify(modelData, null, 2)
    );

    // Save normalization stats
    const stats = {
      mean: Array.from(await this.featureStats.mean.data()),
      std: Array.from(await this.featureStats.std.data())
    };

    fs.writeFileSync(
      path.join(savePath, 'normalization-stats.json'),
      JSON.stringify(stats, null, 2)
    );

    console.log(`✓ Model saved to ${savePath}`);
  }

  /**
   * Load model from disk (TensorFlow.js format)
   */
  async load(modelPath = 'ml/saved-model') {
    const fs = require('fs');
    const loadPath = path.resolve(modelPath);

    // Use TensorFlow.js built-in loader for proper format support
    const modelFile = `file://${path.join(loadPath, 'model.json')}`;
    this.model = await tf.loadLayersModel(modelFile);

    // Load normalization stats
    const stats = JSON.parse(
      fs.readFileSync(path.join(loadPath, 'normalization-stats.json'), 'utf8')
    );

    this.featureStats.mean = tf.tensor1d(stats.mean);
    this.featureStats.std = tf.tensor1d(stats.std);

    this.isLoaded = true;
    console.log(`✓ Model loaded from ${loadPath}`);
  }

  /**
   * Evaluate model performance
   */
  async evaluate(testData) {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded');
    }

    const { features, labels } = this.prepareTrainingData(testData);
    const normalizedFeatures = this.normalizeFeatures(features, false);

    const result = this.model.evaluate(normalizedFeatures, labels);
    const [loss, mae] = await Promise.all(result.map(t => t.data()));

    // Cleanup
    features.dispose();
    labels.dispose();
    normalizedFeatures.dispose();
    result.forEach(t => t.dispose());

    return {
      loss: loss[0],
      mae: mae[0]
    };
  }

  /**
   * Get model summary
   */
  summary() {
    if (this.model) {
      this.model.summary();
    }
  }

  /**
   * Get feature importance using gradient-based attribution
   * This helps understand which features the model relies on most
   */
  async getFeatureImportance(testData, numSamples = 20) {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded');
    }

    const { features } = this.prepareTrainingData(testData.slice(0, numSamples));
    const normalizedFeatures = this.normalizeFeatures(features, false);

    const featureNames = getFeatureNames();
    const importanceScores = new Array(featureNames.length).fill(0);

    // Calculate gradients for each sample
    for (let i = 0; i < normalizedFeatures.shape[0]; i++) {
      const sample = normalizedFeatures.slice([i, 0], [1, -1]);

      // Calculate gradient of output with respect to input
      const gradients = tf.tidy(() => {
        const grad = tf.variableGrads(() => {
          const pred = this.model.predict(sample);
          return pred.asScalar();
        }, [sample]);

        return grad.grads[0];
      });

      // Accumulate absolute gradients as importance scores
      const gradData = await gradients.data();
      for (let j = 0; j < gradData.length; j++) {
        importanceScores[j] += Math.abs(gradData[j]);
      }

      sample.dispose();
      gradients.dispose();
    }

    // Normalize scores
    const totalImportance = importanceScores.reduce((a, b) => a + b, 0);
    const normalizedImportance = importanceScores.map(score => score / totalImportance);

    // Create feature importance object
    const importance = {};
    featureNames.forEach((name, idx) => {
      importance[name] = normalizedImportance[idx];
    });

    // Sort by importance
    const sorted = Object.entries(importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 features

    features.dispose();
    normalizedFeatures.dispose();

    return {
      allFeatures: importance,
      topFeatures: sorted
    };
  }

  /**
   * Get detailed prediction with feature breakdown
   * Useful for debugging and understanding model behavior
   */
  predictWithDetails(questionFeatures, reviewHistory = null) {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded. Train or load model first.');
    }

    // Create base features object
    const baseFeatures = {
      memoryStrength: questionFeatures.memoryStrength,
      difficultyRating: questionFeatures.difficultyRating,
      timeSinceLastReview: questionFeatures.timeSinceLastReview,
      successRate: questionFeatures.successRate,
      averageResponseTime: questionFeatures.averageResponseTime,
      totalReviews: questionFeatures.totalReviews,
      consecutiveCorrect: questionFeatures.consecutiveCorrect,
      timeOfDay: questionFeatures.timeOfDay
    };

    // Generate advanced features
    const advancedFeatures = createAdvancedFeatureVector(baseFeatures, reviewHistory);
    const featureArray = getFeatureArray(advancedFeatures);

    const featureTensor = tf.tensor2d([featureArray]);
    const normalizedFeatures = this.normalizeFeatures(featureTensor, false);

    // Predict
    const prediction = this.model.predict(normalizedFeatures);
    const interval = prediction.dataSync()[0];

    // Cleanup
    featureTensor.dispose();
    normalizedFeatures.dispose();
    prediction.dispose();

    return {
      predictedInterval: Math.max(1, Math.round(interval)),
      rawPrediction: interval,
      baseFeatures: baseFeatures,
      advancedFeatures: advancedFeatures,
      featureArray: featureArray,
      featureNames: getFeatureNames()
    };
  }
}

module.exports = IntervalPredictionModel;
