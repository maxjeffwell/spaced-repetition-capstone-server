// Polyfill for Node.js 20+ compatibility
const util = require('util');
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = function(value) {
    return value === null || value === undefined;
  };
}

const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const fs = require('fs');

async function verifyModel() {
    const modelPath = 'file://' + path.join(__dirname, 'ml/saved-model/model.json');
    console.log(`Loading model from: ${modelPath}`);
    
    try {
        const model = await tf.loadLayersModel(modelPath);
        
        // Load normalization stats
        const statsPath = path.join(__dirname, 'ml/saved-model/normalization-stats.json');
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        const mean = stats.mean;
        const std = stats.std;

        console.log('\n--- Test Case: Expert Review ---');
        // Scenario: Card was reviewed 7 days ago, user answered correctly and quickly
        // We expect prediction > 7 (e.g., 14-20 days)
        
        const baseFeatures = {
            memoryStrength: 7,       // Previous interval was 7 days
            difficultyRating: 0.3,   // Easy card
            timeSinceLastReview: 7,  // Reviewed exactly on schedule
            successRate: 1.0,        // Perfect history
            averageResponseTime: 1.5, // 1.5 seconds (Fast!)
            totalReviews: 5,         // Seen 5 times
            consecutiveCorrect: 5,
            timeOfDay: 0.5           // Noon
        };

        // Mock the "Advanced Feature" generation (simplified to match training script logic)
        // We need 51 features. This is a rough approximation of what `advanced-features.js` does.
        // Important: We must normalize these inputs!
        
        const rawFeatures = generateMockAdvancedFeatures(baseFeatures);
        
        // Normalize
        const normalizedFeatures = rawFeatures.map((val, i) => (val - mean[i]) / (std[i] + 1e-8));
        
        const inputTensor = tf.tensor2d([normalizedFeatures]);
        const prediction = model.predict(inputTensor);
        const result = prediction.dataSync()[0];
        
        console.log(`Input 'Time Since Review': ${baseFeatures.timeSinceLastReview} days`);
        console.log(`Input 'Memory Strength':   ${baseFeatures.memoryStrength} days`);
        console.log(`Input 'Success Rate':      ${baseFeatures.successRate * 100}%`);
        console.log('-----------------------------------');
        console.log(`RAW Model Prediction:      ${result.toFixed(4)} days`);
        console.log(`Rounded Interval:          ${Math.max(1, Math.round(result))} days`);
        
        if (result < 7) {
            console.log('\n❌ FAIL: Model is predicting shorter interval than elapsed time.');
        } else {
            console.log('\n✅ PASS: Model is expanding the interval.');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

// Minimal reimplementation of the Python advanced feature logic for testing
function generateMockAdvancedFeatures(base) {
    const { memoryStrength: ms, difficultyRating: dr, timeSinceLastReview: ts, successRate: sr, averageResponseTime: art, totalReviews: tr, consecutiveCorrect: cc, timeOfDay: tod } = base;
    
    // This MUST match the 51-feature vector order from `train-model-advanced.py`
    const features = [];
    
    // 8 Base
    features.push(ms, dr, ts, sr, art, tr, cc, tod);
    
    // 5 Forgetting Curve
    const decay = ts / Math.max(ms, 0.1);
    features.push(Math.exp(-decay)); // forgettingCurve
    features.push(Math.exp(-decay / (sr * 2))); // adjustedDecay
    features.push(Math.log1p(decay)); // logTimeDecay
    features.push(Math.log1p(ms)); // logMemoryStrength
    features.push(decay); // decayRate
    
    // 10 Interactions
    features.push(dr * ts, dr * ms, sr * ms, sr * ts, art * dr, art * ms, cc * ms, cc / (dr||1), tr * sr, tr / (dr+1));
    
    // 9 Polynomial
    features.push(ms*ms, dr*dr, ts*ts, sr*sr, ms*ms*ms, ts*ts*ts, Math.sqrt(ms), Math.sqrt(ts), Math.sqrt(tr));
    
    // 5 Cyclical Time
    const rad = tod * 2 * Math.PI;
    features.push(Math.sin(rad), Math.cos(rad), Math.sin(2*rad), Math.cos(2*rad), Math.atan2(Math.sin(rad), Math.cos(rad)));
    
    // 5 Moving Avg (simplified)
    features.push(dr, art, sr, ts, tr/ts);
    
    // 4 Momentum
    features.push(cc/tr, 0, sr-0.5, (cc/tr)*ms); // difficultyTrend hardcoded to 0
    
    // 5 Retention
    features.push(Math.exp(-decay)*sr, sr*(1-dr), ms/ts, sr/art, ms*(1+sr));
    
    return features;
}

verifyModel();
