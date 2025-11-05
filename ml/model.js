'use strict';

/**
 * Neural Network Model for Spaced Repetition Interval Prediction
 *
 * Uses TensorFlow.js to predict optimal review intervals based on:
 * - Memory strength (current interval)
 * - Difficulty rating (historical failure rate)
 * - Time since last review
 * - Success rate
 * - Average response time
 * - Total reviews
 * - Consecutive correct
 * - Time of day
 */

// Use regular TensorFlow.js with CPU backend (compatible with Node.js 24)
const tf = require('@tensorflow/tfjs');
const path = require('path');

// Set CPU backend to avoid Node binding issues
tf.setBackend('cpu');

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
   * Create the neural network architecture
   */
  createModel() {
    const model = tf.sequential();

    // Input layer: 8 features
    model.add(tf.layers.dense({
      inputShape: [8],
      units: 32,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Hidden layer 1: Learn complex patterns
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Hidden layer 2: Refine predictions
    model.add(tf.layers.dropout({ rate: 0.1 }));
    model.add(tf.layers.dense({
      units: 8,
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
   * Prepare training data from extracted samples
   */
  prepareTrainingData(trainingData) {
    const features = [];
    const labels = [];

    trainingData.forEach(sample => {
      // Feature vector (8 dimensions)
      features.push([
        sample.features.memoryStrength,
        sample.features.difficultyRating,
        sample.features.timeSinceLastReview,
        sample.features.successRate,
        sample.features.averageResponseTime / 1000, // Convert ms to seconds
        sample.features.totalReviews,
        sample.features.consecutiveCorrect,
        sample.features.timeOfDay
      ]);

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
   * Predict optimal interval for a single question
   */
  predict(questionFeatures) {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded. Train or load model first.');
    }

    // Convert features to tensor
    const featureVector = [
      questionFeatures.memoryStrength,
      questionFeatures.difficultyRating,
      questionFeatures.timeSinceLastReview,
      questionFeatures.successRate,
      questionFeatures.averageResponseTime / 1000,
      questionFeatures.totalReviews,
      questionFeatures.consecutiveCorrect,
      questionFeatures.timeOfDay
    ];

    const featureTensor = tf.tensor2d([featureVector]);
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
   * Load model from disk (JSON format)
   */
  async load(modelPath = 'ml/saved-model') {
    const fs = require('fs');
    const loadPath = path.resolve(modelPath);

    // Recreate model architecture
    this.createModel();

    // Load weights
    const modelData = JSON.parse(
      fs.readFileSync(path.join(loadPath, 'model.json'), 'utf8')
    );

    const weightsData = modelData.weightsManifest;
    const weightTensors = weightsData.map(w =>
      tf.tensor(w.data, w.shape)
    );

    this.model.setWeights(weightTensors);

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
}

module.exports = IntervalPredictionModel;
