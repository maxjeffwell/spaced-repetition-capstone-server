#!/usr/bin/env node
'use strict';

/**
 * Fix Keras 3.x model format for TensorFlow.js Node compatibility
 *
 * Converts inbound_nodes from object format to array format
 */

const fs = require('fs');
const path = require('path');

const modelPath = path.join(__dirname, '../ml/saved-model/model.json');

console.log('Reading model.json...');
const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

console.log('Converting inbound_nodes format...');

// Fix each layer's inbound_nodes
const layers = modelData.modelTopology.model_config.config.layers;
let fixedCount = 0;

layers.forEach(layer => {
  if (layer.inbound_nodes && Array.isArray(layer.inbound_nodes)) {
    // Convert from Keras 3.x format to TF.js compatible format
    layer.inbound_nodes = layer.inbound_nodes.map(node => {
      if (node.args) {
        // New format: {args: [...], kwargs: {...}}
        // Old format: [[layer_name, node_index, tensor_index], ...]

        // Extract the tensor info from args
        const tensors = node.args.map(arg => {
          if (arg.class_name === '__keras_tensor__' && arg.config.keras_history) {
            // keras_history is [layer_name, node_index, tensor_index]
            return arg.config.keras_history;
          }
          return arg;
        });

        fixedCount++;
        return tensors;
      }
      return node;
    });
  }
});

console.log(`Fixed ${fixedCount} inbound_nodes`);

// Backup original
const backupPath = modelPath + '.backup';
fs.writeFileSync(backupPath, JSON.stringify(modelData, null, 2));
console.log(`Backup saved to ${backupPath}`);

// Write fixed version
fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2));
console.log('✓ Model format fixed!');
console.log('  model.json has been updated for TensorFlow.js Node compatibility');
