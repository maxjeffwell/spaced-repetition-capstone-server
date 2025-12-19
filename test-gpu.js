// Polyfill for Node.js 24+ compatibility with TensorFlow.js
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function(value) {
    return value === null || value === undefined;
  };
}

require('dotenv').config();

// Set LD_LIBRARY_PATH to include cuda-compat directory
const path = require('path');
const cudaCompatPath = path.resolve(__dirname, 'cuda-compat');
process.env.LD_LIBRARY_PATH = `${cudaCompatPath}:${process.env.LD_LIBRARY_PATH || ''}`;

console.log('CUDA Compat Path:', cudaCompatPath);
console.log('LD_LIBRARY_PATH:', process.env.LD_LIBRARY_PATH);
console.log('TFJS_BACKEND:', process.env.TFJS_BACKEND || 'auto');
console.log('\nAttempting to load TensorFlow.js GPU backend...\n');

try {
  const tf = require('@tensorflow/tfjs-node-gpu');

  console.log('✅ TensorFlow.js GPU backend loaded successfully!');
  console.log('Backend:', tf.getBackend());

  // Test a simple operation
  console.log('\nTesting GPU computation...');
  const a = tf.tensor2d([[1, 2], [3, 4]]);
  const b = tf.tensor2d([[5, 6], [7, 8]]);
  const result = tf.matMul(a, b);

  console.log('Matrix multiplication result:');
  result.print();

  console.log('\n🚀 GPU acceleration is working!');

  // Check memory
  console.log('\nMemory info:', tf.memory());

  process.exit(0);
} catch (error) {
  console.error('❌ Failed to load TensorFlow.js GPU backend');
  console.error('Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
