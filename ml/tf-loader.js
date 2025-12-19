'use strict';

/**
 * TensorFlow.js Loader with Native Fallback
 *
 * Attempts to load tfjs-node for optimal performance (10x faster),
 * falls back to pure JavaScript tfjs when native bindings fail.
 *
 * Common failure reasons:
 * - CPU lacks AVX instructions (older Celeron, Atom, etc.)
 * - Missing system libraries
 * - Platform incompatibility
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

try {
  // Try native Node.js backend first (requires AVX instructions)
  tf = require('@tensorflow/tfjs-node');
  backend = 'tfjs-node';
  console.log('TensorFlow.js: Using native Node.js backend (optimal performance)');
} catch (nativeError) {
  // Fall back to pure JavaScript backend
  console.warn('TensorFlow.js: Native backend unavailable, falling back to pure JavaScript');
  console.warn(`  Reason: ${nativeError.message}`);

  try {
    tf = require('@tensorflow/tfjs');
    backend = 'tfjs-cpu';
    console.log('TensorFlow.js: Using pure JavaScript CPU backend');
  } catch (jsError) {
    console.error('TensorFlow.js: Failed to load any backend!');
    console.error(`  Native error: ${nativeError.message}`);
    console.error(`  JS error: ${jsError.message}`);
    throw new Error('Could not load TensorFlow.js');
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
