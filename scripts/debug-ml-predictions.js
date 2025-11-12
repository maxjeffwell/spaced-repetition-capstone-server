#!/usr/bin/env node
'use strict';

// Polyfill for Node.js 24+ compatibility with TensorFlow.js
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function(value) {
    return value === null || value === undefined;
  };
}

const IntervalPredictionModel = require('../ml/model');
const { createFeatureVector } = require('../utils/question-helpers');

async function debug() {
  console.log('🔍 Debugging ML Predictions\n');

  // Load model
  const model = new IntervalPredictionModel();
  await model.load('ml/saved-model');

  // Test question
  const question = {
    memoryStrength: 6,
    difficultyRating: 0.3,
    lastReviewed: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
    timesCorrect: 4,
    timesIncorrect: 1,
    averageResponseTime: 2500,
    consecutiveCorrect: 2,
    reviewHistory: [
      { timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), recalled: true, responseTime: 2500 }
    ]
  };

  console.log('Test question:', JSON.stringify(question, null, 2));
  console.log();

  // Create feature vector
  const features = createFeatureVector(question);
  console.log('Feature vector:', JSON.stringify(features, null, 2));
  console.log();

  // Try prediction
  try {
    const prediction = model.predict(features);
    console.log('✓ Prediction:', prediction, 'days');
  } catch (error) {
    console.error('❌ Prediction failed:', error.message);
    console.error(error.stack);
  }

  // Check normalization stats
  console.log('\nNormalization stats:');
  if (model.featureStats.mean && model.featureStats.std) {
    const meanData = await model.featureStats.mean.data();
    const stdData = await model.featureStats.std.data();
    console.log('Mean:', Array.from(meanData));
    console.log('Std:', Array.from(stdData));
  } else {
    console.log('❌ No normalization stats loaded');
  }
}

debug();
