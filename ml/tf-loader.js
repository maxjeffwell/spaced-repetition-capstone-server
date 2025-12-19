'use strict';

/**
 * TensorFlow.js Loader with GPU/Native/JS Fallback
 *
 * Backend priority: GPU (fastest) → Native CPU → Pure JavaScript (slowest)
 *
 * Environment variables:
 * - TFJS_BACKEND=gpu   : Force GPU backend (requires NVIDIA GPU + CUDA)
 * - TFJS_BACKEND=node  : Force native CPU backend (requires AVX instructions)
 * - TFJS_BACKEND=cpu   : Force pure JavaScript backend (works anywhere)
 * - TFJS_FORCE_JS=true : Alternative way to force pure JavaScript
 *
 * Common failure reasons:
 * - GPU: Missing CUDA/cuDNN, incompatible GPU, or driver issues
 * - Native: CPU lacks AVX instructions (older Celeron, Atom, etc.)
 * - Platform: Missing system libraries or incompatibility
 */

// Polyfill for Node.js 24+ compatibility with TensorFlow.js
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function(value) {
    return value === null || value === undefined;
  };
}

let tf;
let backend = 'unknown';

// Check environment variable for backend preference
const backendPreference = process.env.TFJS_BACKEND || 'auto';
const forceJsBackend = backendPreference === 'cpu' ||
                       process.env.TFJS_FORCE_JS === 'true' ||
                       process.env.DOCKER_CONTAINER === 'true';

if (forceJsBackend) {
  // Force pure JavaScript backend - prevents crashes on incompatible hardware
  console.log('TensorFlow.js: Using pure JavaScript backend (forced via environment)');
  tf = require('@tensorflow/tfjs');
  backend = 'tfjs-cpu';
} else if (backendPreference === 'gpu') {
  // Force GPU backend
  try {
    tf = require('@tensorflow/tfjs-node-gpu');
    backend = 'tfjs-node-gpu';
    console.log('TensorFlow.js: Using GPU backend (forced via environment)');
  } catch (gpuError) {
    console.error('TensorFlow.js: GPU backend forced but unavailable!');
    console.error(`  Reason: ${gpuError.message}`);
    throw new Error('Could not load GPU backend as requested');
  }
} else if (backendPreference === 'node') {
  // Force native CPU backend
  try {
    tf = require('@tensorflow/tfjs-node');
    backend = 'tfjs-node';
    console.log('TensorFlow.js: Using native Node.js backend (forced via environment)');
  } catch (nativeError) {
    console.error('TensorFlow.js: Native backend forced but unavailable!');
    console.error(`  Reason: ${nativeError.message}`);
    throw new Error('Could not load native backend as requested');
  }
} else {
  // Auto-detect: Try GPU → Native CPU → Pure JavaScript
  try {
    // Try GPU backend first (fastest, but requires NVIDIA GPU + CUDA)
    tf = require('@tensorflow/tfjs-node-gpu');
    backend = 'tfjs-node-gpu';
    console.log('TensorFlow.js: Using GPU backend (auto-detected) 🚀');
  } catch (gpuError) {
    // GPU unavailable, try native CPU backend
    try {
      tf = require('@tensorflow/tfjs-node');
      backend = 'tfjs-node';
      console.log('TensorFlow.js: Using native Node.js backend (GPU unavailable, using CPU)');
      console.log(`  GPU unavailable: ${gpuError.message}`);
    } catch (nativeError) {
      // Native backend failed, fall back to pure JavaScript
      console.warn('TensorFlow.js: Both GPU and native backends unavailable, using pure JavaScript');
      console.warn(`  GPU error: ${gpuError.message}`);
      console.warn(`  Native error: ${nativeError.message}`);

      try {
        tf = require('@tensorflow/tfjs');
        backend = 'tfjs-cpu';
        console.log('TensorFlow.js: Using pure JavaScript CPU backend');
      } catch (jsError) {
        console.error('TensorFlow.js: Failed to load any backend!');
        console.error(`  GPU error: ${gpuError.message}`);
        console.error(`  Native error: ${nativeError.message}`);
        console.error(`  JS error: ${jsError.message}`);
        throw new Error('Could not load TensorFlow.js');
      }
    }
  }
}

// Export the loaded TensorFlow instance and backend info
// Note: Can't set 'backend' property as TF already defines it as getter-only
tf._loadedBackend = backend;
tf._isNativeBackend = backend === 'tfjs-node';

// Add convenience getters that don't conflict with TF's built-in properties
Object.defineProperty(tf, 'isNative', {
  get: () => tf._isNativeBackend,
  enumerable: false
});

Object.defineProperty(tf, 'loadedBackend', {
  get: () => tf._loadedBackend,
  enumerable: false
});

module.exports = tf;
