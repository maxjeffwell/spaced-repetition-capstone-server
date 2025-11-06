#!/usr/bin/env node
'use strict';

/**
 * Continuous Training Pipeline
 *
 * Automatically generates new training data, trains model, and tracks performance
 *
 * Usage:
 *   node scripts/continuous-training-pipeline.js [options]
 *
 * Options:
 *   --simulate     Generate new simulated data
 *   --extract      Extract training data
 *   --evaluate     Evaluate current model performance
 *   --report       Generate performance report
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');

/**
 * Generate new simulated training data
 */
async function generateNewData(options = {}) {
  const {
    users = 2,
    sessions = 5,
    reviews = 5,
    days = 14
  } = options;

  console.log('\n📊 Generating new training data...');
  console.log(`  Users: ${users}`);
  console.log(`  Sessions: ${sessions}`);
  console.log(`  Days: ${days}`);

  try {
    execSync(
      `node scripts/simulate-realistic-reviews.js --users=${users} --sessions=${sessions} --reviews=${reviews} --days=${days} --mode=realistic`,
      { stdio: 'inherit' }
    );

    console.log('✓ New training data generated');
    return true;
  } catch (error) {
    console.error('❌ Failed to generate data:', error.message);
    return false;
  }
}

/**
 * Extract training data to JSON
 */
async function extractTrainingData() {
  console.log('\n📦 Extracting training data...');

  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `training-data-${timestamp}.json`;

    execSync(
      `node scripts/extract-training-data.js ${filename}`,
      { stdio: 'inherit' }
    );

    console.log(`✓ Training data extracted to ${filename}`);
    return filename;
  } catch (error) {
    console.error('❌ Failed to extract data:', error.message);
    return null;
  }
}

/**
 * Get current model metadata
 */
function getCurrentModelMetrics() {
  const metadataPath = path.join(__dirname, '../ml/saved-model/metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

/**
 * Calculate data statistics from MongoDB
 */
async function getDataStatistics() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const User = require('../models/user');
  const users = await User.find({});

  let totalReviews = 0;
  let totalCorrect = 0;
  let totalQuestions = 0;

  users.forEach(user => {
    user.questions.forEach(q => {
      totalQuestions++;
      const reviews = q.reviewHistory || [];
      totalReviews += reviews.length;
      totalCorrect += reviews.filter(r => r.recalled).length;
    });
  });

  await mongoose.disconnect();

  return {
    users: users.length,
    questions: totalQuestions,
    reviews: totalReviews,
    accuracy: totalReviews > 0 ? (totalCorrect / totalReviews) : 0
  };
}

/**
 * Generate performance report
 */
async function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('Continuous Training Report');
  console.log('='.repeat(60));

  // Current model metrics
  const modelMetrics = getCurrentModelMetrics();

  if (modelMetrics) {
    console.log('\n📈 Current Model Performance:');
    console.log(`  Version: ${modelMetrics.modelVersion}`);
    console.log(`  Trained: ${new Date(modelMetrics.trainedDate).toLocaleDateString()}`);
    console.log(`  Test MAE: ${modelMetrics.performance.testMAE.toFixed(2)} days`);
    console.log(`  Baseline MAE: ${modelMetrics.performance.baselineMAE.toFixed(2)} days`);
    console.log(`  Improvement: ${modelMetrics.performance.improvement.toFixed(1)}%`);
    console.log(`  Training samples: ${modelMetrics.trainingSize}`);
  } else {
    console.log('\n⚠️  No model found');
  }

  // Data statistics
  console.log('\n📊 Current Data Statistics:');
  const stats = await getDataStatistics();
  console.log(`  Users: ${stats.users}`);
  console.log(`  Questions: ${stats.questions}`);
  console.log(`  Total reviews: ${stats.reviews}`);
  console.log(`  Overall accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);

  // Recommendations
  console.log('\n💡 Recommendations:');

  if (!modelMetrics) {
    console.log('  ⚠️  Train initial model');
  } else {
    const daysSinceTraining = (Date.now() - new Date(modelMetrics.trainedDate)) / (1000 * 60 * 60 * 24);

    if (daysSinceTraining > 30) {
      console.log('  🔄 Model is over 30 days old - consider retraining');
    }

    if (stats.reviews - modelMetrics.trainingSize > 100) {
      console.log(`  📈 ${stats.reviews - modelMetrics.trainingSize} new reviews since last training`);
      console.log('     Consider retraining to incorporate new data');
    }

    if (modelMetrics.performance.testMAE > 10) {
      console.log('  ⚠️  MAE is high (>10 days) - model may need improvement');
    }

    if (stats.reviews < 500) {
      console.log('  📊 Generate more training data (current: ' + stats.reviews + ', target: 500+)');
    }
  }

  console.log('\n' + '='.repeat(60));

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    model: modelMetrics,
    data: stats,
    recommendations: []
  };

  const reportPath = path.join(__dirname, `../reports/training-report-${Date.now()}.json`);
  const reportsDir = path.join(__dirname, '../reports');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Report saved to ${reportPath}`);
}

/**
 * Automated training pipeline
 */
async function runPipeline(options = {}) {
  const {
    generateData = true,
    extract = true,
    report = true
  } = options;

  console.log('🤖 Starting Continuous Training Pipeline...\n');

  try {
    // Step 1: Generate new data
    if (generateData) {
      const success = await generateNewData({
        users: 2,
        sessions: 5,
        reviews: 5,
        days: 14
      });

      if (!success) {
        console.error('❌ Pipeline failed at data generation');
        return;
      }
    }

    // Step 2: Extract training data
    if (extract) {
      const filename = await extractTrainingData();

      if (!filename) {
        console.error('❌ Pipeline failed at data extraction');
        return;
      }

      console.log('\n📤 Next steps:');
      console.log(`  1. Upload ${filename} to Google Colab`);
      console.log('  2. Run training notebook');
      console.log('  3. Download trained model');
      console.log('  4. Deploy to ml/saved-model/');
      console.log('  5. Commit and push to production');
    }

    // Step 3: Generate report
    if (report) {
      await generateReport();
    }

    console.log('\n✓ Pipeline completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Pipeline error:', error.message);
    console.error(error.stack);
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const options = {
    generateData: args.includes('--simulate'),
    extract: args.includes('--extract'),
    report: args.includes('--report'),
    fullPipeline: args.length === 0 // Run full pipeline if no args
  };

  if (options.fullPipeline) {
    // Run complete pipeline
    await runPipeline({
      generateData: true,
      extract: true,
      report: true
    });
  } else {
    // Run selected steps
    if (options.generateData) {
      await generateNewData();
    }

    if (options.extract) {
      await extractTrainingData();
    }

    if (options.report) {
      await generateReport();
    }
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  generateNewData,
  extractTrainingData,
  generateReport,
  runPipeline
};
