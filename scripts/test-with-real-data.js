#!/usr/bin/env node
'use strict';

/**
 * Test Advanced Feature Engineering with Real Training Data
 *
 * This script:
 * 1. Loads real training data
 * 2. Tests feature generation
 * 3. Trains a model with 51 features
 * 4. Evaluates performance
 * 5. Analyzes feature importance
 *
 * Usage: node scripts/test-with-real-data.js [training-data.json]
 */

const fs = require('fs');
const IntervalPredictionModel = require('../ml/model');
const { getFeatureNames } = require('../ml/advanced-features');

async function testWithRealData(trainingDataPath) {
  console.log('='.repeat(80));
  console.log(' Testing Advanced Features with Real Training Data');
  console.log('='.repeat(80));
  console.log();

  // Load training data
  console.log(`📂 Loading training data from ${trainingDataPath}...`);
  if (!fs.existsSync(trainingDataPath)) {
    console.error(`❌ Training data file not found: ${trainingDataPath}`);
    console.error('\nGenerate training data first:');
    console.error('  node scripts/extract-training-data.js');
    process.exit(1);
  }

  const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf8'));
  console.log(`✓ Loaded ${trainingData.length} training samples\n`);

  if (trainingData.length < 10) {
    console.error(`❌ Not enough training data (need at least 10 samples, got ${trainingData.length})`);
    process.exit(1);
  }

  // Test feature generation
  console.log('🔬 Testing Feature Generation...');
  console.log('-'.repeat(80));

  let successfulSamples = 0;
  let failedSamples = 0;
  const errors = [];

  trainingData.forEach((sample, idx) => {
    try {
      const model = new IntervalPredictionModel();
      const { features } = model.prepareTrainingData([sample]);

      if (features.shape[1] !== 51) {
        throw new Error(`Expected 51 features, got ${features.shape[1]}`);
      }

      features.dispose();
      successfulSamples++;
    } catch (err) {
      failedSamples++;
      if (errors.length < 5) { // Only store first 5 errors
        errors.push({ sample: idx, error: err.message });
      }
    }
  });

  console.log(`✓ Successfully generated features for ${successfulSamples}/${trainingData.length} samples`);

  if (failedSamples > 0) {
    console.log(`⚠️  Failed to generate features for ${failedSamples} samples`);
    errors.forEach(({ sample, error }) => {
      console.log(`   Sample ${sample}: ${error}`);
    });
  }
  console.log();

  // Validate feature dimensions
  console.log('📊 Validating Feature Dimensions...');
  const featureNames = getFeatureNames();
  console.log(`   Expected features: 51`);
  console.log(`   Feature names count: ${featureNames.length}`);
  console.log(`   ✓ Feature dimensions match\n`);

  // Split data
  const splitIndex = Math.floor(trainingData.length * 0.8);
  const trainData = trainingData.slice(0, splitIndex);
  const testData = trainingData.slice(splitIndex);

  console.log('📈 Dataset Split:');
  console.log(`   Training: ${trainData.length} samples`);
  console.log(`   Testing:  ${testData.length} samples\n`);

  // Create and train model
  console.log('🏗️  Creating Model with 51 Features...');
  const model = new IntervalPredictionModel();
  model.createModel();
  console.log('   Architecture: 51 → 128 → 64 → 32 → 16 → 1');
  console.log(`   Parameters: ${model.model.countParams().toLocaleString()}`);
  console.log();

  model.summary();
  console.log();

  // Train model
  const epochs = 50; // Fewer epochs for quick testing
  console.log(`🎯 Training Model (${epochs} epochs)...`);
  console.log('-'.repeat(80));

  const startTime = Date.now();
  await model.train(trainData, 0.2, epochs);
  const trainingTime = (Date.now() - startTime) / 1000;

  console.log(`\n✓ Training completed in ${trainingTime.toFixed(2)}s\n`);

  // Evaluate
  console.log('📊 Evaluating Model Performance...');
  console.log('-'.repeat(80));

  const testMetrics = await model.evaluate(testData);
  console.log(`   Test Loss (MSE): ${testMetrics.loss.toFixed(4)}`);
  console.log(`   Test MAE: ${testMetrics.mae.toFixed(4)} days\n`);

  // Baseline comparison
  const baselineErrors = testData.map(sample => {
    const predicted = sample.features.memoryStrength;
    const actual = sample.label.optimalInterval;
    return Math.abs(predicted - actual);
  });
  const baselineMAE = baselineErrors.reduce((a, b) => a + b, 0) / baselineErrors.length;

  console.log('🎯 Performance Comparison:');
  console.log(`   Advanced Model MAE: ${testMetrics.mae.toFixed(4)} days`);
  console.log(`   Baseline MAE: ${baselineMAE.toFixed(4)} days`);

  const improvement = ((baselineMAE - testMetrics.mae) / baselineMAE * 100);
  if (improvement > 0) {
    console.log(`   ✓ ${improvement.toFixed(1)}% improvement over baseline!`);
  } else {
    console.log(`   ⚠️  Model ${Math.abs(improvement).toFixed(1)}% worse than baseline`);
    console.log(`      (May need more training data or tuning)`);
  }
  console.log();

  // Sample predictions
  console.log('🔮 Sample Predictions:');
  console.log('-'.repeat(80));

  const sampleIndices = [0, Math.floor(testData.length / 2), testData.length - 1];

  sampleIndices.forEach(i => {
    if (i >= testData.length) return;

    const sample = testData[i];
    const predicted = model.predict(sample.features, sample.metadata.reviewHistory);
    const actual = sample.label.optimalInterval;
    const error = Math.abs(predicted - actual);
    const baseline = sample.features.memoryStrength;

    console.log(`\n Sample ${i + 1}:`);
    console.log(`   Question: ${sample.metadata.question || 'N/A'}`);
    console.log(`   Current interval: ${sample.features.memoryStrength} days`);
    console.log(`   Success rate: ${(sample.features.successRate * 100).toFixed(1)}%`);
    console.log(`   Difficulty: ${(sample.features.difficultyRating * 100).toFixed(1)}%`);
    console.log(`   Baseline prediction: ${baseline} days`);
    console.log(`   ML Prediction: ${predicted} days`);
    console.log(`   Optimal: ${actual} days`);
    console.log(`   ML Error: ${error.toFixed(1)} days (${((error/actual)*100).toFixed(1)}%)`);
    console.log(`   Baseline Error: ${Math.abs(baseline - actual).toFixed(1)} days (${((Math.abs(baseline - actual)/actual)*100).toFixed(1)}%)`);
  });

  console.log('\n' + '-'.repeat(80));

  // Feature importance
  if (testData.length >= 10) {
    console.log('\n🔍 Analyzing Feature Importance...');
    console.log('-'.repeat(80));

    const importance = await model.getFeatureImportance(testData, Math.min(20, testData.length));

    console.log('\nTop 15 Most Important Features:');
    importance.topFeatures.slice(0, 15).forEach(([name, score], idx) => {
      const barLength = Math.round(score * 50);
      const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
      console.log(`   ${(idx + 1).toString().padStart(2)}. ${name.padEnd(30)} ${bar} ${(score * 100).toFixed(2)}%`);
    });

    console.log('\n📊 Feature Category Importance:');
    const categories = {
      'Base Features': importance.topFeatures.filter(([name]) =>
        ['memoryStrength', 'difficultyRating', 'timeSinceLastReview', 'successRate',
         'averageResponseTime', 'totalReviews', 'consecutiveCorrect', 'timeOfDay'].includes(name)
      ),
      'Forgetting Curve': importance.topFeatures.filter(([name]) =>
        name.includes('forgetting') || name.includes('decay') || name.includes('logMemory') || name.includes('logTime')
      ),
      'Retention Prediction': importance.topFeatures.filter(([name]) =>
        name.includes('retention') || name.includes('stability') || name.includes('retrievability') ||
        name.includes('learningEfficiency') || name.includes('optimalInterval')
      ),
      'Interaction Features': importance.topFeatures.filter(([name]) =>
        name.includes('Product') || name.includes('Ratio')
      ),
      'Momentum': importance.topFeatures.filter(([name]) =>
        name.includes('momentum') || name.includes('streak') || name.includes('mastery') ||
        name.includes('Trend') || name.includes('Acceleration')
      )
    };

    Object.entries(categories).forEach(([category, features]) => {
      if (features.length > 0) {
        const totalImportance = features.reduce((sum, [, score]) => sum + score, 0);
        console.log(`   ${category.padEnd(25)}: ${(totalImportance * 100).toFixed(2)}% (${features.length} features)`);
      }
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log(' Test Summary');
  console.log('='.repeat(80));
  console.log();
  console.log(`✓ Feature generation: ${successfulSamples}/${trainingData.length} successful`);
  console.log(`✓ Model trained: ${epochs} epochs in ${trainingTime.toFixed(2)}s`);
  console.log(`✓ Test MAE: ${testMetrics.mae.toFixed(4)} days`);
  console.log(`✓ Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
  console.log(`✓ Parameters: ${model.model.countParams().toLocaleString()}`);
  console.log();

  if (improvement > 50) {
    console.log('🎉 Excellent performance! The advanced features are working well.');
  } else if (improvement > 20) {
    console.log('👍 Good performance. The advanced features show promise.');
  } else if (improvement > 0) {
    console.log('⚠️  Modest improvement. Consider more training data or tuning.');
  } else {
    console.log('⚠️  Model underperforming. Need more data or architecture changes.');
  }

  console.log();
  console.log('='.repeat(80));

  return {
    trainingData,
    model,
    metrics: testMetrics,
    improvement,
    trainingTime
  };
}

async function main() {
  const trainingDataPath = process.argv[2] || 'training-data.json';

  try {
    await testWithRealData(trainingDataPath);
  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testWithRealData };
