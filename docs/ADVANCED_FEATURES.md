# Advanced Feature Engineering for Spaced Repetition ML Model

## Overview

The neural network model has been enhanced with sophisticated feature engineering techniques, expanding from **8 base features to 51 engineered features** (6.4x expansion). This dramatically improves the model's ability to learn complex patterns in spaced repetition learning.

## Architecture Updates

### Before: Simple Feedforward Network
- Input: 8 features
- Architecture: 32 → 16 → 8 → 1
- Parameters: 961
- No batch normalization

### After: Advanced Deep Network
- Input: 51 features
- Architecture: 128 → 64 → 32 → 16 → 1
- Parameters: ~11,000
- Batch normalization layers
- Higher dropout rates for regularization

## Feature Categories

### 1. Base Features (8 features)
Original features from the spaced repetition algorithm:
- `memoryStrength` - Current interval (days)
- `difficultyRating` - Historical failure rate (0-1)
- `timeSinceLastReview` - Days since last review
- `successRate` - Overall success percentage
- `averageResponseTime` - Mean response time (seconds)
- `totalReviews` - Total number of reviews
- `consecutiveCorrect` - Current streak
- `timeOfDay` - Time of review (0-1, 0=midnight)

### 2. Forgetting Curve Features (5 features)
Based on Ebbinghaus's forgetting curve: R(t) = e^(-t/S)

- **`forgettingCurve`** - Predicted retention using exponential decay
- **`adjustedDecay`** - Decay adjusted for learner's success rate
- **`logTimeDecay`** - Log-transformed decay rate (better for neural networks)
- **`logMemoryStrength`** - Log(1 + memory strength)
- **`decayRate`** - Raw decay rate (time / strength)

**Why this matters:** Memory follows an exponential decay pattern. Encoding this relationship directly helps the model learn faster.

### 3. Interaction Features (10 features)
Capture non-linear relationships between base features:

**Difficulty Interactions:**
- `difficultyTimeProduct` - How difficulty affects time decay
- `difficultyMemoryProduct` - Difficulty × current strength
- `responseTimeDifficultyProduct` - Response time × difficulty
- `consecutiveDifficultyRatio` - Streak relative to difficulty

**Success Interactions:**
- `successMemoryProduct` - Success rate × memory strength
- `successTimeProduct` - Success rate × time since review
- `experienceSuccessProduct` - Experience × success

**Performance Interactions:**
- `responseTimeMemoryProduct` - Speed × memory strength
- `consecutiveMemoryProduct` - Streak × memory strength
- `experienceDifficultyRatio` - Experience relative to difficulty

**Why this matters:** The effect of difficulty on retention is different when combined with time, success rate, or other factors. These capture those complex relationships.

### 4. Polynomial Features (9 features)
Higher-order terms for non-linear patterns:

**Squared Features:**
- `memoryStrengthSquared` - Quadratic memory effects
- `difficultySquared` - Quadratic difficulty effects
- `timeSquared` - Quadratic time decay
- `successRateSquared` - Quadratic success patterns

**Other Non-linear:**
- `memoryStrengthCubed` - Cubic memory effects (diminishing returns)
- `sqrtMemoryStrength` - Square root (accelerating returns)
- `sqrtTotalReviews` - Experience with diminishing impact
- `inverseMemoryStrength` - 1/strength (for very short intervals)
- `inverseDifficulty` - 1/difficulty (for easy items)

**Why this matters:** Learning doesn't scale linearly. Going from 1→2 days has different impact than 10→11 days.

### 5. Cyclical Time Features (5 features)
Better encoding of time-of-day patterns:

- **`timeOfDaySin`** - Sine of time (captures continuity: 11 PM ≈ 1 AM)
- **`timeOfDayCos`** - Cosine of time (orthogonal component)
- **`isMorning`** - Binary: 6 AM - 12 PM
- **`isAfternoon`** - Binary: 12 PM - 6 PM
- **`isEvening`** - Binary: 6 PM - 6 AM

**Why this matters:** Linear time (0-1) can't capture that midnight and 1 AM are similar. Sinusoidal encoding handles cyclical patterns correctly.

### 6. Moving Average Features (5 features)
Capture trends and recent performance:

- **`recentSuccessRate`** - Success rate over last 5 reviews
- **`recentAvgResponseTime`** - Response time over last 5 reviews
- **`performanceTrend`** - Change in success (first half vs second half)
  - Positive = improving, Negative = declining
- **`difficultyTrend`** - Change in intervals over time
- **`velocityTrend`** - Average days between reviews

**Why this matters:** Current trajectory matters. A learner improving rapidly needs different intervals than someone plateauing.

### 7. Momentum Features (4 features)
Learning acceleration and consistency:

- **`learningMomentum`** - Recent vs overall success (acceleration)
- **`streakStrength`** - Streak normalized by experience
- **`performanceAcceleration`** - Rate of performance change
- **`masteryLevel`** - Success × consistency score

**Why this matters:** Captures whether learning is accelerating, decelerating, or stable.

### 8. Retention Prediction Features (5 features)
Cognitive science-based predictions:

- **`stability`** - How well-learned (log(streak) × log(strength))
- **`retrievability`** - Current recall ease (forgetting curve × difficulty)
- **`learningEfficiency`** - Success per review attempt
- **`retentionProbability`** - Estimated P(recall now)
- **`optimalIntervalEstimate`** - Days until 90% retention

**Why this matters:** Provides the model with expert-derived features based on memory research, acting as a "warm start" for learning.

## Usage

### Training with Advanced Features

```javascript
const IntervalPredictionModel = require('./ml/model');

const model = new IntervalPredictionModel();
await model.train(trainingData, 0.2, 100);

// Feature importance analysis
const importance = await model.getFeatureImportance(testData, 20);
console.log('Top features:', importance.topFeatures.slice(0, 10));
```

### Prediction with Advanced Features

```javascript
// Basic prediction (review history optional but recommended)
const interval = model.predict(questionFeatures, reviewHistory);

// Detailed prediction with feature breakdown
const details = model.predictWithDetails(questionFeatures, reviewHistory);
console.log('Predicted:', details.predictedInterval);
console.log('Features:', details.advancedFeatures);
```

### Testing Advanced Features

```bash
# Run the demonstration script
node scripts/test-advanced-features.js
```

## Expected Improvements

### 1. Better Accuracy
- More features = more information
- Non-linear features capture complex patterns
- Cognitive science features provide expert knowledge

### 2. Faster Training
- Pre-engineered features reduce need for deep layers
- Model can focus on combining features vs discovering them

### 3. Better Generalization
- Polynomial features prevent overfitting to linear patterns
- Interaction features capture real-world complexity
- Moving averages smooth out noise

### 4. Interpretability
- Feature importance analysis shows what matters
- Retention predictions provide explanations
- Forgetting curve features align with theory

## Feature Engineering Principles Applied

### 1. Domain Knowledge Integration
- Forgetting curves from memory research (Ebbinghaus)
- Retention predictions from cognitive science
- Time encoding based on circadian patterns

### 2. Automated Pattern Discovery
- Interaction features (all 2-way combinations of important features)
- Polynomial features (capturing non-linearity)
- Moving averages (temporal patterns)

### 3. Scale and Representation
- Log transforms for exponential relationships
- Normalization for consistent ranges
- Sinusoidal encoding for cyclical patterns

### 4. Redundancy vs Information
- Some features are correlated (by design)
- Neural networks can handle redundancy
- Regularization (dropout, batch norm) prevents overfitting

## Performance Monitoring

The training script now shows:
- Feature importance rankings
- Visual bars showing relative importance
- Model parameter count
- Training time comparisons

Example output:
```
📊 Top 10 Most Important Features:
   1. retentionProbability       ████████████████████░░░ 15.23%
   2. forgettingCurve            ███████████████░░░░░░░░ 12.45%
   3. memoryStrength             ██████████████░░░░░░░░░ 10.87%
   4. difficultyRating           ████████████░░░░░░░░░░░  9.34%
   ...
```

## Next Steps

Consider these enhancements:
1. **LSTM layers** - Model temporal sequences directly
2. **Attention mechanisms** - Learn feature importance dynamically
3. **Custom loss functions** - Optimize for specific goals (e.g., prefer over-estimation)
4. **Ensemble models** - Combine multiple architectures

## References

- Ebbinghaus, H. (1885). Memory: A Contribution to Experimental Psychology
- Wozniak, P. (1990). SuperMemo Algorithm SM-2
- Reddy, S. et al. (2016). A Memory Model for Machine Teaching
- Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model

## Files Changed

- `ml/advanced-features.js` - Feature engineering functions (new)
- `ml/model.js` - Updated to use 51 features
- `scripts/extract-training-data.js` - Include review history
- `scripts/train-model.js` - Feature importance analysis
- `scripts/test-advanced-features.js` - Demonstration script (new)

## API Changes

### Model.predict()
```javascript
// Old (8 features)
predict(questionFeatures)

// New (51 features, with review history)
predict(questionFeatures, reviewHistory = null)
```

### New Methods
```javascript
// Feature importance analysis
getFeatureImportance(testData, numSamples = 20)

// Detailed prediction
predictWithDetails(questionFeatures, reviewHistory = null)
```

## Backward Compatibility

⚠️ **Breaking Changes:**
- Models trained with 8 features won't work with new code
- Need to retrain with advanced features
- Training data must include review history

To upgrade:
1. Run `node scripts/extract-training-data.js` (includes review history)
2. Run `node scripts/train-model.js` (trains with 51 features)
3. Update any prediction code to pass review history

## Summary

The advanced feature engineering upgrade provides:
- ✅ 6.4x more features (8 → 51)
- ✅ Cognitive science-based features
- ✅ Non-linear relationship modeling
- ✅ Temporal pattern capture
- ✅ Feature importance analysis
- ✅ Better interpretability
- ✅ Expected accuracy improvements

This represents a significant enhancement to the ML model's capability to learn complex patterns in spaced repetition learning.
