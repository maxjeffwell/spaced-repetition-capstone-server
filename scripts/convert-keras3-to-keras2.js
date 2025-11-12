#!/usr/bin/env node
/**
 * Convert Keras 3 model.json to Keras 2 format for TensorFlow.js compatibility
 *
 * Key differences:
 * - Keras 2: inbound_nodes is array of arrays
 * - Keras 3: inbound_nodes is array of objects with {args, kwargs}
 */

const fs = require('fs');
const path = require('path');

const modelPath = 'ml/saved-model/model.json';

console.log('Converting Keras 3 model to Keras 2 format...\n');

// Read model
const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

console.log(`Original format: ${modelData.generatedBy}`);
console.log(`Keras version: ${modelData.modelTopology.keras_version}\n`);

// Update version metadata
modelData.generatedBy = 'keras v2.20.0';
modelData.modelTopology.keras_version = '2.20.0';

// Convert all layers
const layers = modelData.modelTopology.model_config.config.layers;

for (const layer of layers) {
  // Fix dtype if it's an object (Keras 3 format)
  if (layer.config.dtype && typeof layer.config.dtype === 'object') {
    layer.config.dtype = 'float32';
  }

  // Fix inbound_nodes from Keras 3 to Keras 2 format
  if (layer.inbound_nodes && Array.isArray(layer.inbound_nodes)) {
    const newInboundNodes = [];

    for (const nodeGroup of layer.inbound_nodes) {
      if (Array.isArray(nodeGroup)) {
        // Process each node in the group
        const convertedGroup = [];
        for (const node of nodeGroup) {
          if (node && typeof node === 'object' && node.class_name === '__keras_tensor__') {
            // Keras 3 __keras_tensor__ format with keras_history
            // Extract [layer_name, node_index, tensor_index]
            if (node.config && node.config.keras_history) {
              convertedGroup.push(node.config.keras_history);
            }
          } else if (node && node.args) {
            // Keras 3 format: {args: [...], kwargs: {...}}
            convertedGroup.push(...node.args);
          } else if (Array.isArray(node)) {
            // Already in Keras 2 array format
            convertedGroup.push(node);
          }
        }
        newInboundNodes.push(convertedGroup.length > 0 ? convertedGroup : nodeGroup);
      } else {
        // Empty or unknown format, keep as is
        newInboundNodes.push(nodeGroup);
      }
    }

    layer.inbound_nodes = newInboundNodes;
  }

  // Remove Keras 3-specific fields from config
  if (layer.config.kernel_initializer && typeof layer.config.kernel_initializer === 'object') {
    delete layer.config.kernel_initializer.module;
    delete layer.config.kernel_initializer.registered_name;
  }
  if (layer.config.bias_initializer && typeof layer.config.bias_initializer === 'object') {
    delete layer.config.bias_initializer.module;
    delete layer.config.bias_initializer.registered_name;
  }
  if (layer.config.gamma_initializer && typeof layer.config.gamma_initializer === 'object') {
    delete layer.config.gamma_initializer.module;
    delete layer.config.gamma_initializer.registered_name;
  }
  if (layer.config.beta_initializer && typeof layer.config.beta_initializer === 'object') {
    delete layer.config.beta_initializer.module;
    delete layer.config.beta_initializer.registered_name;
  }
  if (layer.config.moving_mean_initializer && typeof layer.config.moving_mean_initializer === 'object') {
    delete layer.config.moving_mean_initializer.module;
    delete layer.config.moving_mean_initializer.registered_name;
  }
  if (layer.config.moving_variance_initializer && typeof layer.config.moving_variance_initializer === 'object') {
    delete layer.config.moving_variance_initializer.module;
    delete layer.config.moving_variance_initializer.registered_name;
  }
}

// Fix input/output layers format (Keras 3 uses arrays of arrays)
if (modelData.modelTopology.model_config.config.input_layers) {
  modelData.modelTopology.model_config.config.input_layers =
    modelData.modelTopology.model_config.config.input_layers.map(l =>
      Array.isArray(l) ? l : [l, 0, 0]
    );
}
if (modelData.modelTopology.model_config.config.output_layers) {
  modelData.modelTopology.model_config.config.output_layers =
    modelData.modelTopology.model_config.config.output_layers.map(l =>
      Array.isArray(l) ? l : [l, 0, 0]
    );
}

// Backup original
const backupPath = modelPath + '.keras3';
fs.writeFileSync(backupPath, JSON.stringify(modelData, null, 2));
console.log(`✓ Backed up original to: ${backupPath}`);

// Save converted model
fs.writeFileSync(modelPath, JSON.stringify(modelData));
console.log(`✓ Converted model saved to: ${modelPath}`);

console.log('\nConversion complete!');
console.log(`New format: ${modelData.generatedBy}`);
console.log(`Keras version: ${modelData.modelTopology.keras_version}`);
console.log('\nTest with: node scripts/debug-ml-predictions.js');
