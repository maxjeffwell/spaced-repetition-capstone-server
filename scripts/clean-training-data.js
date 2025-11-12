#!/usr/bin/env node
'use strict';

/**
 * Clean training data by capping unrealistic memoryStrength values
 */

const fs = require('fs');

const MAX_INTERVAL = 90; // Cap at 90 days (3 months)

console.log('🧹 Cleaning training data...\n');

const data = require('../training-data.json');
console.log(`Loaded ${data.length} samples`);

let cleanedCount = 0;

const cleanedData = data.map(sample => {
  if (sample.features.memoryStrength > MAX_INTERVAL) {
    cleanedCount++;
    return {
      ...sample,
      features: {
        ...sample.features,
        memoryStrength: Math.min(sample.features.memoryStrength, MAX_INTERVAL)
      },
      label: {
        ...sample.label,
        optimalInterval: Math.min(sample.label.optimalInterval, MAX_INTERVAL)
      }
    };
  }
  return sample;
});

console.log(`✓ Cleaned ${cleanedCount} samples (capped at ${MAX_INTERVAL} days)`);

// Save cleaned data
fs.writeFileSync('training-data-clean.json', JSON.stringify(cleanedData, null, 2));
console.log(`✓ Saved to training-data-clean.json`);
