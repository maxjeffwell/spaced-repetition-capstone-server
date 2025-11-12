'use strict';

/**
 * Advanced Feature Engineering for Spaced Repetition ML Model
 *
 * Implements sophisticated features including:
 * - Forgetting curve modeling (Ebbinghaus)
 * - Interaction features
 * - Polynomial features
 * - Cyclical time encoding
 * - Moving averages and momentum
 * - Retention prediction features
 */

/**
 * Calculate forgetting curve features based on Ebbinghaus model
 * R(t) = e^(-t/S) where t = time since review, S = memory strength
 */
function calculateForgettingCurveFeatures(memoryStrength, timeSinceLastReview, successRate) {
  // Exponential decay feature
  const decayRate = timeSinceLastReview / Math.max(memoryStrength, 0.1);
  const forgettingCurve = Math.exp(-decayRate);

  // Adjusted decay based on past performance
  const learnerStrength = successRate * 2; // Scale 0-1 to 0-2
  const adjustedDecay = Math.exp(-decayRate / Math.max(learnerStrength, 0.1));

  // Log-transformed time features (better for neural networks)
  const logTimeDecay = Math.log1p(decayRate); // log(1 + x) to avoid log(0)
  const logMemoryStrength = Math.log1p(memoryStrength);

  return {
    forgettingCurve,          // Predicted retention based on forgetting curve
    adjustedDecay,            // Adjusted for learner performance
    logTimeDecay,             // Log-transformed decay rate
    logMemoryStrength,        // Log-transformed memory strength
    decayRate                 // Raw decay rate
  };
}

/**
 * Create interaction features (products of important features)
 * These capture non-linear relationships between features
 */
function calculateInteractionFeatures(features) {
  const {
    memoryStrength,
    difficultyRating,
    timeSinceLastReview,
    successRate,
    averageResponseTime,
    totalReviews,
    consecutiveCorrect
  } = features;

  return {
    // Difficulty × Time interactions
    difficultyTimeProduct: difficultyRating * timeSinceLastReview,
    difficultyMemoryProduct: difficultyRating * memoryStrength,

    // Success rate interactions
    successMemoryProduct: successRate * memoryStrength,
    successTimeProduct: successRate * timeSinceLastReview,

    // Response time interactions
    responseTimeDifficultyProduct: (averageResponseTime / 1000) * difficultyRating,
    responseTimeMemoryProduct: (averageResponseTime / 1000) * memoryStrength,

    // Consecutive correct interactions
    consecutiveMemoryProduct: consecutiveCorrect * memoryStrength,
    consecutiveDifficultyRatio: difficultyRating > 0 ? consecutiveCorrect / difficultyRating : consecutiveCorrect,

    // Experience-based interactions
    experienceSuccessProduct: totalReviews * successRate,
    experienceDifficultyRatio: difficultyRating > 0 ? totalReviews / (difficultyRating + 1) : totalReviews
  };
}

/**
 * Create polynomial features (squares and higher-order terms)
 * Captures non-linear relationships
 * MUST MATCH Python training script exactly!
 */
function calculatePolynomialFeatures(features) {
  const {
    memoryStrength,
    difficultyRating,
    timeSinceLastReview,
    successRate,
    totalReviews
  } = features;

  return {
    // Squared features
    memoryStrengthSquared: memoryStrength * memoryStrength,
    difficultySquared: difficultyRating * difficultyRating,
    timeSquared: timeSinceLastReview * timeSinceLastReview,
    successRateSquared: successRate * successRate,

    // Cubic features
    memoryStrengthCubed: Math.pow(memoryStrength, 3),
    timeCubed: Math.pow(timeSinceLastReview, 3),

    // Square root features
    sqrtMemoryStrength: Math.sqrt(Math.max(memoryStrength, 0)),
    sqrtTime: Math.sqrt(Math.max(timeSinceLastReview, 0)),
    sqrtTotalReviews: Math.sqrt(Math.max(totalReviews, 0))
  };
}

/**
 * Encode time of day with sinusoidal features
 * MUST MATCH Python training script exactly!
 */
function encodeCyclicalTime(timeOfDay) {
  // timeOfDay is 0-1 (0 = midnight, 0.5 = noon, 1 = midnight)
  const radians = timeOfDay * 2 * Math.PI;

  return {
    timeSin: Math.sin(radians),
    timeCos: Math.cos(radians),
    timeSin2: Math.sin(2 * radians),
    timeCos2: Math.cos(2 * radians),
    timePhase: Math.atan2(Math.sin(radians), Math.cos(radians))
  };
}

/**
 * Calculate moving average features
 * MUST MATCH Python training script exactly!
 * Simplified version - no history required
 */
function calculateMovingAverageFeatures(baseFeatures) {
  const {
    difficultyRating,
    averageResponseTime,
    successRate,
    timeSinceLastReview,
    totalReviews
  } = baseFeatures;

  // Simplified moving averages (no history in clean data)
  return {
    maDifficulty: difficultyRating,
    maResponseTime: averageResponseTime / 1000, // Convert to seconds
    maSuccessRate: successRate,
    maInterval: timeSinceLastReview,
    reviewFrequency: totalReviews / Math.max(timeSinceLastReview, 1)
  };
}

/**
 * Calculate momentum features
 * MUST MATCH Python training script exactly!
 */
function calculateMomentumFeatures(baseFeatures) {
  const {
    memoryStrength,
    successRate,
    consecutiveCorrect,
    totalReviews
  } = baseFeatures;

  const learningVelocity = consecutiveCorrect / Math.max(totalReviews, 1);
  const difficultyTrend = 0; // Would calculate from history
  const performanceAcceleration = successRate - 0.5; // Baseline at 0.5
  const masteryMomentum = learningVelocity * memoryStrength;

  return {
    learningVelocity,
    difficultyTrend,
    performanceAcceleration,
    masteryMomentum
  };
}

/**
 * Calculate retention prediction features
 * MUST MATCH Python training script exactly!
 */
function calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures) {
  const {
    memoryStrength,
    difficultyRating,
    timeSinceLastReview,
    successRate,
    averageResponseTime
  } = baseFeatures;

  const predictedRetention = forgettingCurveFeatures.forgettingCurve * successRate;
  const confidenceScore = successRate * (1 - difficultyRating);
  const stabilityIndex = memoryStrength / Math.max(timeSinceLastReview, 0.1);
  const learningEfficiency = successRate / Math.max(averageResponseTime / 1000, 0.1);
  const optimalIntervalEstimate = memoryStrength * (1 + successRate);

  return {
    predictedRetention,
    confidenceScore,
    stabilityIndex,
    learningEfficiency,
    optimalIntervalEstimate
  };
}

/**
 * Master function to create all advanced features
 * MUST MATCH Python training script exactly!
 * Expands 8 base features to 51 total features
 */
function createAdvancedFeatureVector(baseFeatures, reviewHistory = null, currentIndex = null) {
  // 1. Forgetting curve features (5 features)
  const forgettingCurveFeatures = calculateForgettingCurveFeatures(
    baseFeatures.memoryStrength,
    baseFeatures.timeSinceLastReview,
    baseFeatures.successRate
  );

  // 2. Interaction features (10 features)
  const interactionFeatures = calculateInteractionFeatures(baseFeatures);

  // 3. Polynomial features (9 features)
  const polynomialFeatures = calculatePolynomialFeatures(baseFeatures);

  // 4. Cyclical time encoding (5 features)
  const timeFeatures = encodeCyclicalTime(baseFeatures.timeOfDay);

  // 5. Moving average features (5 features) - simplified, no history needed
  const movingAvgFeatures = calculateMovingAverageFeatures(baseFeatures);

  // 6. Momentum features (4 features)
  const momentumFeatures = calculateMomentumFeatures(baseFeatures);

  // 7. Retention prediction features (5 features)
  const retentionFeatures = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

  // Combine all features (8 base + 43 advanced = 51 total features)
  return {
    // Base features (8)
    memoryStrength: baseFeatures.memoryStrength,
    difficultyRating: baseFeatures.difficultyRating,
    timeSinceLastReview: baseFeatures.timeSinceLastReview,
    successRate: baseFeatures.successRate,
    averageResponseTime: baseFeatures.averageResponseTime / 1000, // Convert to seconds
    totalReviews: baseFeatures.totalReviews,
    consecutiveCorrect: baseFeatures.consecutiveCorrect,
    timeOfDay: baseFeatures.timeOfDay,

    // Forgetting curve features (5)
    ...forgettingCurveFeatures,

    // Interaction features (10)
    ...interactionFeatures,

    // Polynomial features (9)
    ...polynomialFeatures,

    // Cyclical time features (5)
    ...timeFeatures,

    // Moving average features (5)
    ...movingAvgFeatures,

    // Momentum features (4)
    ...momentumFeatures,

    // Retention prediction features (5)
    ...retentionFeatures
  };
}

/**
 * Get feature vector as array in consistent order
 * MUST MATCH Python training script exactly!
 * Returns 51-dimensional feature vector
 */
function getFeatureArray(advancedFeatures) {
  return [
    // Base features (8)
    advancedFeatures.memoryStrength,
    advancedFeatures.difficultyRating,
    advancedFeatures.timeSinceLastReview,
    advancedFeatures.successRate,
    advancedFeatures.averageResponseTime, // Already in seconds
    advancedFeatures.totalReviews,
    advancedFeatures.consecutiveCorrect,
    advancedFeatures.timeOfDay,

    // Forgetting curve features (5)
    advancedFeatures.forgettingCurve,
    advancedFeatures.adjustedDecay,
    advancedFeatures.logTimeDecay,
    advancedFeatures.logMemoryStrength,
    advancedFeatures.decayRate,

    // Interaction features (10)
    advancedFeatures.difficultyTimeProduct,
    advancedFeatures.difficultyMemoryProduct,
    advancedFeatures.successMemoryProduct,
    advancedFeatures.successTimeProduct,
    advancedFeatures.responseTimeDifficultyProduct,
    advancedFeatures.responseTimeMemoryProduct,
    advancedFeatures.consecutiveMemoryProduct,
    advancedFeatures.consecutiveDifficultyRatio,
    advancedFeatures.experienceSuccessProduct,
    advancedFeatures.experienceDifficultyRatio,

    // Polynomial features (9)
    advancedFeatures.memoryStrengthSquared,
    advancedFeatures.difficultySquared,
    advancedFeatures.timeSquared,
    advancedFeatures.successRateSquared,
    advancedFeatures.memoryStrengthCubed,
    advancedFeatures.timeCubed,
    advancedFeatures.sqrtMemoryStrength,
    advancedFeatures.sqrtTime,
    advancedFeatures.sqrtTotalReviews,

    // Cyclical time features (5)
    advancedFeatures.timeSin,
    advancedFeatures.timeCos,
    advancedFeatures.timeSin2,
    advancedFeatures.timeCos2,
    advancedFeatures.timePhase,

    // Moving average features (5)
    advancedFeatures.maDifficulty,
    advancedFeatures.maResponseTime, // Already in seconds
    advancedFeatures.maSuccessRate,
    advancedFeatures.maInterval,
    advancedFeatures.reviewFrequency,

    // Momentum features (4)
    advancedFeatures.learningVelocity,
    advancedFeatures.difficultyTrend,
    advancedFeatures.performanceAcceleration,
    advancedFeatures.masteryMomentum,

    // Retention prediction features (5)
    advancedFeatures.predictedRetention,
    advancedFeatures.confidenceScore,
    advancedFeatures.stabilityIndex,
    advancedFeatures.learningEfficiency,
    advancedFeatures.optimalIntervalEstimate
  ];
}

/**
 * Get feature names in order (for debugging and interpretability)
 * MUST MATCH Python training script exactly!
 */
function getFeatureNames() {
  return [
    // Base features (8)
    'memoryStrength', 'difficultyRating', 'timeSinceLastReview', 'successRate',
    'averageResponseTime', 'totalReviews', 'consecutiveCorrect', 'timeOfDay',

    // Forgetting curve features (5)
    'forgettingCurve', 'adjustedDecay', 'logTimeDecay', 'logMemoryStrength', 'decayRate',

    // Interaction features (10)
    'difficultyTimeProduct', 'difficultyMemoryProduct', 'successMemoryProduct', 'successTimeProduct',
    'responseTimeDifficultyProduct', 'responseTimeMemoryProduct', 'consecutiveMemoryProduct',
    'consecutiveDifficultyRatio', 'experienceSuccessProduct', 'experienceDifficultyRatio',

    // Polynomial features (9)
    'memoryStrengthSquared', 'difficultySquared', 'timeSquared', 'successRateSquared',
    'memoryStrengthCubed', 'timeCubed', 'sqrtMemoryStrength', 'sqrtTime', 'sqrtTotalReviews',

    // Cyclical time features (5)
    'timeSin', 'timeCos', 'timeSin2', 'timeCos2', 'timePhase',

    // Moving average features (5)
    'maDifficulty', 'maResponseTime', 'maSuccessRate', 'maInterval', 'reviewFrequency',

    // Momentum features (4)
    'learningVelocity', 'difficultyTrend', 'performanceAcceleration', 'masteryMomentum',

    // Retention prediction features (5)
    'predictedRetention', 'confidenceScore', 'stabilityIndex', 'learningEfficiency',
    'optimalIntervalEstimate'
  ];
}

module.exports = {
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames,
  calculateForgettingCurveFeatures,
  calculateInteractionFeatures,
  calculatePolynomialFeatures,
  encodeCyclicalTime,
  calculateMovingAverageFeatures,
  calculateMomentumFeatures,
  calculateRetentionFeatures
};
