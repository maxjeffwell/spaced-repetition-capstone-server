#!/usr/bin/env node
'use strict';

/**
 * Export trained model for browser use
 *
 * Creates a browser-compatible model bundle that can be loaded
 * with TensorFlow.js in the browser for WebGPU acceleration
 *
 * Usage: node scripts/export-model-for-browser.js [output-dir]
 */

const fs = require('fs');
const path = require('path');

async function exportModelForBrowser(modelPath = 'ml/saved-model', outputDir = '../spaced-repetition-capstone-client/public/models') {
  console.log('='.repeat(60));
  console.log('Exporting ML Model for Browser/WebGPU');
  console.log('='.repeat(60));

  const sourcePath = path.resolve(modelPath);
  const destPath = path.resolve(outputDir);

  console.log(`\n📂 Source: ${sourcePath}`);
  console.log(`📦 Destination: ${destPath}`);

  // Create destination directory
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
    console.log(`✓ Created directory: ${destPath}`);
  }

  // Load model data
  const modelData = JSON.parse(
    fs.readFileSync(path.join(sourcePath, 'model.json'), 'utf8')
  );

  const normalizationStats = JSON.parse(
    fs.readFileSync(path.join(sourcePath, 'normalization-stats.json'), 'utf8')
  );

  console.log('\n📊 Model Information:');
  console.log(`   Layers: ${modelData.modelTopology.config.layers.length}`);
  console.log(`   Weight tensors: ${modelData.weightsManifest.length}`);
  console.log(`   Features: 8 dimensions`);
  console.log(`   Output: 1 dimension (interval in days)`);

  // Create browser-compatible model manifest
  const browserModel = {
    format: 'layers-model',
    generatedBy: 'spaced-repetition-ml-trainer',
    convertedBy: '1.0.0',
    modelTopology: modelData.modelTopology,
    weightsManifest: [{
      paths: ['weights.bin'],
      weights: modelData.weightsManifest.map((w, i) => ({
        name: `weight_${i}`,
        shape: w.shape,
        dtype: 'float32'
      }))
    }]
  };

  // Convert weights to binary format
  const weightsData = [];
  let totalWeights = 0;

  modelData.weightsManifest.forEach(weight => {
    weight.data.forEach(value => {
      const buffer = Buffer.allocUnsafe(4);
      buffer.writeFloatLE(value, 0);
      weightsData.push(buffer);
      totalWeights++;
    });
  });

  const weightsBuffer = Buffer.concat(weightsData);

  // Save model.json
  fs.writeFileSync(
    path.join(destPath, 'model.json'),
    JSON.stringify(browserModel, null, 2)
  );

  // Save weights.bin
  fs.writeFileSync(
    path.join(destPath, 'weights.bin'),
    weightsBuffer
  );

  // Save normalization stats
  fs.writeFileSync(
    path.join(destPath, 'normalization-stats.json'),
    JSON.stringify(normalizationStats, null, 2)
  );

  // Create model metadata for client
  const metadata = {
    version: '1.0.0',
    trainedOn: new Date().toISOString(),
    trainingSamples: 90,
    testMAE: 0.0735,
    baselineMAE: 1.8889,
    improvement: 96.1,
    features: [
      'memoryStrength',
      'difficultyRating',
      'timeSinceLastReview',
      'successRate',
      'averageResponseTime',
      'totalReviews',
      'consecutiveCorrect',
      'timeOfDay'
    ],
    normalization: normalizationStats
  };

  fs.writeFileSync(
    path.join(destPath, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('\n✓ Exported Files:');
  console.log(`   model.json (${fs.statSync(path.join(destPath, 'model.json')).size} bytes)`);
  console.log(`   weights.bin (${weightsBuffer.length} bytes, ${totalWeights} weights)`);
  console.log(`   normalization-stats.json`);
  console.log(`   metadata.json`);

  console.log('\n📱 Client Usage:');
  console.log(`   import * as tf from '@tensorflow/tfjs';`);
  console.log(`   const model = await tf.loadLayersModel('/models/model.json');`);

  console.log('\n' + '='.repeat(60));
  console.log('✓ Export Complete!');
  console.log('='.repeat(60));

  return {
    modelPath: destPath,
    totalWeights,
    size: weightsBuffer.length
  };
}

async function main() {
  const modelPath = process.argv[2] || 'ml/saved-model';
  const outputDir = process.argv[3] || '../spaced-repetition-capstone-client/public/models';

  try {
    await exportModelForBrowser(modelPath, outputDir);
  } catch (error) {
    console.error('\n❌ Error during export:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { exportModelForBrowser };
