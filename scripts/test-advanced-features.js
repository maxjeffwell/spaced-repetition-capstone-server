#!/usr/bin/env node
'use strict';

/**
 * Test and demonstrate advanced feature engineering
 *
 * Usage: node scripts/test-advanced-features.js
 */

const {
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames
} = require('../ml/advanced-features');

console.log('='.repeat(70));
console.log('Advanced Feature Engineering - Demonstration');
console.log('='.repeat(70));

// Sample base features
const baseFeatures = {
  memoryStrength: 3,
  difficultyRating: 0.4,
  timeSinceLastReview: 2.5,
  successRate: 0.75,
  averageResponseTime: 3500, // milliseconds
  totalReviews: 8,
  consecutiveCorrect: 3,
  timeOfDay: 0.58 // 2:00 PM
};

// Sample review history
const reviewHistory = [
  { timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 3000, intervalUsed: 1 },
  { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2800, intervalUsed: 2 },
  { timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000, recalled: false, responseTime: 5000, intervalUsed: 2 },
  { timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 3200, intervalUsed: 1 },
  { timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2900, intervalUsed: 2 },
  { timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2500, intervalUsed: 2 },
  { timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2200, intervalUsed: 3 }
];

console.log('\n📊 Base Features (8 dimensions):');
console.log('-'.repeat(70));
Object.entries(baseFeatures).forEach(([key, value]) => {
  console.log(`  ${key.padEnd(25)}: ${value}`);
});

console.log('\n🔬 Generating Advanced Features...\n');

// Generate advanced features
const advancedFeatures = createAdvancedFeatureVector(baseFeatures, reviewHistory);
const featureArray = getFeatureArray(advancedFeatures);
const featureNames = getFeatureNames();

console.log('✓ Generated 51-dimensional feature vector\n');

console.log('🎯 Feature Categories:');
console.log('-'.repeat(70));

// Display by category
const categories = {
  'Base Features': featureNames.slice(0, 8),
  'Forgetting Curve': featureNames.slice(8, 13),
  'Interaction Features': featureNames.slice(13, 23),
  'Polynomial Features': featureNames.slice(23, 32),
  'Cyclical Time': featureNames.slice(32, 37),
  'Moving Averages': featureNames.slice(37, 42),
  'Momentum Features': featureNames.slice(42, 46),
  'Retention Prediction': featureNames.slice(46, 51)
};

Object.entries(categories).forEach(([category, names]) => {
  console.log(`\n${category} (${names.length} features):`);
  names.forEach((name, idx) => {
    const globalIdx = featureNames.indexOf(name);
    const value = featureArray[globalIdx];
    console.log(`  ${name.padEnd(30)}: ${value.toFixed(4)}`);
  });
});

console.log('\n' + '='.repeat(70));
console.log('📈 Feature Engineering Summary');
console.log('='.repeat(70));
console.log(`  Original features:     8`);
console.log(`  Advanced features:     51`);
console.log(`  Expansion factor:      6.4x`);
console.log(`  Feature categories:    8`);
console.log('='.repeat(70));

console.log('\n💡 Key Insights:');
console.log('-'.repeat(70));

// Calculate some insights
const insights = [
  {
    name: 'Forgetting Curve Prediction',
    value: advancedFeatures.forgettingCurve,
    description: 'Estimated retention based on Ebbinghaus model',
    interpretation: advancedFeatures.forgettingCurve > 0.7 ? 'Strong retention' :
      advancedFeatures.forgettingCurve > 0.4 ? 'Moderate retention' : 'Weak retention'
  },
  {
    name: 'Retention Probability',
    value: advancedFeatures.retentionProbability,
    description: 'ML-based retention estimate',
    interpretation: `${(advancedFeatures.retentionProbability * 100).toFixed(1)}% likely to recall`
  },
  {
    name: 'Learning Momentum',
    value: advancedFeatures.learningMomentum,
    description: 'Recent performance vs overall',
    interpretation: advancedFeatures.learningMomentum > 0 ? 'Improving' :
      advancedFeatures.learningMomentum < 0 ? 'Declining' : 'Stable'
  },
  {
    name: 'Mastery Level',
    value: advancedFeatures.masteryLevel,
    description: 'Overall proficiency with this item',
    interpretation: advancedFeatures.masteryLevel > 0.7 ? 'High mastery' :
      advancedFeatures.masteryLevel > 0.4 ? 'Moderate mastery' : 'Low mastery'
  },
  {
    name: 'Optimal Interval Estimate',
    value: advancedFeatures.optimalIntervalEstimate,
    description: 'Days until 90% retention',
    interpretation: `Review in ~${Math.round(advancedFeatures.optimalIntervalEstimate)} days`
  }
];

insights.forEach(insight => {
  console.log(`\n  ${insight.name}:`);
  console.log(`    Value: ${insight.value.toFixed(4)}`);
  console.log(`    ${insight.description}`);
  console.log(`    ➜ ${insight.interpretation}`);
});

console.log('\n' + '='.repeat(70));
console.log('✅ Advanced Feature Engineering Test Complete!');
console.log('='.repeat(70));

console.log('\n📚 Benefits of Advanced Features:');
console.log('  • Captures non-linear relationships between variables');
console.log('  • Models forgetting curves based on cognitive science');
console.log('  • Tracks learning momentum and trends over time');
console.log('  • Provides interpretable retention predictions');
console.log('  • Encodes cyclical patterns (time of day)');
console.log('  • Reduces need for manual feature selection\n');
