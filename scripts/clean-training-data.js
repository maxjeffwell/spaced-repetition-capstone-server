#!/usr/bin/env node
'use strict';

/**
 * Clean training data by capping unrealistic memoryStrength values
 */

const fs = require('fs');

const MAX_INTERVAL = 90; // Cap at 90 days (3 months)
const MIN_INTERVAL = 0.1; // Minimum interval of 2.4 hours

console.log('🧹 Cleaning training data...\n');

const data = require('../training-data.json');
console.log(`Loaded ${data.length} samples`);

let cleanedCount = 0;
let removedCount = 0;

// First, filter out invalid samples
const validData = data.filter(sample => {
  // Remove samples with negative or zero intervals
  if (sample.label.optimalInterval <= 0 || sample.label.actualInterval < 0) {
    removedCount++;
    return false;
  }

  // Remove samples with invalid features
  if (sample.features.memoryStrength < 0 ||
      sample.features.successRate < 0 || sample.features.successRate > 1 ||
      sample.features.difficultyRating < 0 || sample.features.difficultyRating > 1) {
    removedCount++;
    return false;
  }

  return true;
});

console.log(`✓ Removed ${removedCount} invalid samples (negative intervals, invalid features)`);

// Then, clean remaining samples
const cleanedData = validData.map(sample => {
  if (sample.features.memoryStrength > MAX_INTERVAL || sample.label.optimalInterval > MAX_INTERVAL) {
    cleanedCount++;
    return {
      ...sample,
      features: {
        ...sample.features,
        memoryStrength: Math.min(sample.features.memoryStrength, MAX_INTERVAL)
      },
      label: {
        ...sample.label,
        optimalInterval: Math.max(MIN_INTERVAL, Math.min(sample.label.optimalInterval, MAX_INTERVAL)),
        actualInterval: Math.max(0, Math.min(sample.label.actualInterval, MAX_INTERVAL))
      }
    };
  }
  return sample;
});

console.log(`✓ Capped ${cleanedCount} samples (max ${MAX_INTERVAL} days)`);
console.log(`✓ Final dataset: ${cleanedData.length} valid samples\n`);

// Calculate statistics
const intervals = cleanedData.map(d => d.label.optimalInterval);
const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

console.log('Cleaned data statistics:');
console.log(`  Min interval: ${Math.min(...intervals).toFixed(2)} days`);
console.log(`  Max interval: ${Math.max(...intervals).toFixed(2)} days`);
console.log(`  Mean interval: ${mean.toFixed(2)} days`);
console.log(`  Median interval: ${median.toFixed(2)} days\n`);

// Save cleaned data
fs.writeFileSync('training-data-clean.json', JSON.stringify(cleanedData, null, 2));
console.log(`✓ Saved to training-data-clean.json`);
