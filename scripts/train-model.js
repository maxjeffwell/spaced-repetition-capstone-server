#!/usr/bin/env node
'use strict';

/**
 * Train the ML model for interval prediction
 *
 * Usage: node scripts/train-model.js [training-data.json]
 */

const fs = require('fs');
const path = require('path');
const IntervalPredictionModel = require('../ml/model');

async function trainModel(trainingDataPath, options = {}) {
  const {
    epochs = 100,
    validationSplit = 0.2,
    saveModel = true,
    modelPath = 'ml/saved-model'
  } = options;

  console.log('='.repeat(60));
  console.log('ML Model Training - Spaced Repetition Intervals');
  console.log('='.repeat(60));

  // Load training data
  console.log(`\n📂 Loading training data from ${trainingDataPath}...`);
  const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf8'));
  console.log(`✓ Loaded ${trainingData.length} training samples`);

  // Validate minimum data requirements
  if (trainingData.length < 50) {
    console.error(`\n⚠️  Warning: Only ${trainingData.length} samples available.`);
    console.error('   Recommended minimum: 100 samples for effective training.');
    console.error('   Run: node scripts/simulate-reviews.js 100\n');
  }

  // Split data for final evaluation
  const splitIndex = Math.floor(trainingData.length * 0.8);
  const trainData = trainingData.slice(0, splitIndex);
  const testData = trainingData.slice(splitIndex);

  console.log(`\n📊 Dataset split:`);
  console.log(`   Training: ${trainData.length} samples`);
  console.log(`   Testing:  ${testData.length} samples`);

  // Create and train model
  const model = new IntervalPredictionModel();

  console.log('\n🏗️  Model Architecture:');
  model.createModel();
  model.summary();

  console.log('\n🎯 Training Configuration:');
  console.log(`   Epochs: ${epochs}`);
  console.log(`   Validation Split: ${validationSplit * 100}%`);
  console.log(`   Optimizer: Adam (lr=0.001)`);
  console.log(`   Loss: Mean Squared Error`);

  // Train
  const startTime = Date.now();
  await model.train(trainData, validationSplit, epochs);
  const trainingTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n⏱️  Training time: ${trainingTime}s`);

  // Evaluate on test set
  console.log('\n📈 Evaluating on test set...');
  const testMetrics = await model.evaluate(testData);
  console.log(`   Test Loss (MSE): ${testMetrics.loss.toFixed(4)}`);
  console.log(`   Test MAE: ${testMetrics.mae.toFixed(4)} days`);

  // Calculate baseline performance for comparison
  const baselineErrors = testData.map(sample => {
    const predicted = sample.features.memoryStrength; // Baseline just uses current interval
    const actual = sample.label.optimalInterval;
    return Math.abs(predicted - actual);
  });
  const baselineMAE = baselineErrors.reduce((a, b) => a + b, 0) / baselineErrors.length;

  console.log(`\n🎯 Performance Comparison:`);
  console.log(`   ML Model MAE: ${testMetrics.mae.toFixed(4)} days`);
  console.log(`   Baseline MAE: ${baselineMAE.toFixed(4)} days`);

  const improvement = ((baselineMAE - testMetrics.mae) / baselineMAE * 100);
  if (improvement > 0) {
    console.log(`   ✓ ${improvement.toFixed(1)}% improvement over baseline!`);
  } else {
    console.log(`   ⚠️  Model performing ${Math.abs(improvement).toFixed(1)}% worse than baseline`);
    console.log(`      (May need more training data or tuning)`);
  }

  // Save model
  if (saveModel) {
    console.log(`\n💾 Saving model to ${modelPath}...`);
    await model.save(modelPath);
  }

  // Test predictions
  console.log('\n🔮 Sample Predictions:');
  const sampleIndices = [0, Math.floor(testData.length / 2), testData.length - 1];

  sampleIndices.forEach(i => {
    if (i >= testData.length) return;

    const sample = testData[i];
    const predicted = model.predict(sample.features);
    const actual = sample.label.optimalInterval;
    const error = Math.abs(predicted - actual);

    console.log(`\n   Question: ${sample.metadata.question}`);
    console.log(`   Current interval: ${sample.features.memoryStrength} days`);
    console.log(`   Success rate: ${(sample.features.successRate * 100).toFixed(1)}%`);
    console.log(`   ML Prediction: ${predicted} days`);
    console.log(`   Optimal: ${actual} days`);
    console.log(`   Error: ${error.toFixed(1)} days`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✓ Training Complete!');
  console.log('='.repeat(60));

  return {
    model,
    metrics: testMetrics,
    trainingTime,
    improvement
  };
}

async function main() {
  const trainingDataPath = process.argv[2] || 'training-data.json';

  if (!fs.existsSync(trainingDataPath)) {
    console.error(`Error: Training data file not found: ${trainingDataPath}`);
    console.error('\nGenerate training data first:');
    console.error('  1. node scripts/simulate-reviews.js 100');
    console.error('  2. node scripts/extract-training-data.js');
    process.exit(1);
  }

  try {
    await trainModel(trainingDataPath, {
      epochs: parseInt(process.argv[3]) || 100,
      validationSplit: 0.2,
      saveModel: true,
      modelPath: 'ml/saved-model'
    });

  } catch (error) {
    console.error('\n❌ Error during training:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { trainModel };
