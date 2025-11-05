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
 */
function calculatePolynomialFeatures(features) {
  const {
    memoryStrength,
    difficultyRating,
    timeSinceLastReview,
    successRate,
    consecutiveCorrect
  } = features;

  return {
    // Squared features
    memoryStrengthSquared: memoryStrength * memoryStrength,
    difficultySquared: difficultyRating * difficultyRating,
    timeSquared: timeSinceLastReview * timeSinceLastReview,
    successRateSquared: successRate * successRate,

    // Cubic features for important variables
    memoryStrengthCubed: Math.pow(memoryStrength, 3),

    // Square root features (diminishing returns)
    sqrtMemoryStrength: Math.sqrt(memoryStrength),
    sqrtTotalReviews: Math.sqrt(features.totalReviews),

    // Inverse features
    inverseMemoryStrength: memoryStrength > 0 ? 1 / memoryStrength : 0,
    inverseDifficulty: difficultyRating > 0.01 ? 1 / difficultyRating : 100
  };
}

/**
 * Encode time of day with sinusoidal features
 * Better captures cyclical nature of time
 */
function encodeCyclicalTime(timeOfDay) {
  // timeOfDay is 0-1 (0 = midnight, 0.5 = noon, 1 = midnight)
  const radians = timeOfDay * 2 * Math.PI;

  return {
    timeOfDaySin: Math.sin(radians),
    timeOfDayCos: Math.cos(radians),
    // Categorize into time periods
    isMorning: timeOfDay >= 0.25 && timeOfDay < 0.5 ? 1 : 0,    // 6am-12pm
    isAfternoon: timeOfDay >= 0.5 && timeOfDay < 0.75 ? 1 : 0,  // 12pm-6pm
    isEvening: timeOfDay >= 0.75 || timeOfDay < 0.25 ? 1 : 0    // 6pm-6am
  };
}

/**
 * Calculate moving average features from review history
 * Captures trends in performance
 */
function calculateMovingAverageFeatures(reviewHistory, currentIndex = null) {
  if (!reviewHistory || reviewHistory.length === 0) {
    return {
      recentSuccessRate: 0,
      recentAvgResponseTime: 0,
      performanceTrend: 0,
      difficultyTrend: 0,
      velocityTrend: 0
    };
  }

  // Use last N reviews for moving average (or all if currentIndex specified)
  const lookbackWindow = 5;
  const reviews = currentIndex !== null
    ? reviewHistory.slice(Math.max(0, currentIndex - lookbackWindow), currentIndex + 1)
    : reviewHistory.slice(-lookbackWindow);

  if (reviews.length === 0) {
    return {
      recentSuccessRate: 0,
      recentAvgResponseTime: 0,
      performanceTrend: 0,
      difficultyTrend: 0,
      velocityTrend: 0
    };
  }

  // Recent success rate (last 5 reviews)
  const recentSuccesses = reviews.filter(r => r.recalled).length;
  const recentSuccessRate = recentSuccesses / reviews.length;

  // Recent average response time
  const recentAvgResponseTime = reviews.reduce((sum, r) => sum + r.responseTime, 0) / reviews.length;

  // Performance trend (comparing first half to second half of recent reviews)
  let performanceTrend = 0;
  if (reviews.length >= 4) {
    const midpoint = Math.floor(reviews.length / 2);
    const firstHalfSuccess = reviews.slice(0, midpoint).filter(r => r.recalled).length / midpoint;
    const secondHalfSuccess = reviews.slice(midpoint).filter(r => r.recalled).length / (reviews.length - midpoint);
    performanceTrend = secondHalfSuccess - firstHalfSuccess; // Positive = improving
  }

  // Difficulty trend (based on intervals used)
  let difficultyTrend = 0;
  if (reviews.length >= 2) {
    const intervals = reviews.map(r => r.intervalUsed || 1);
    difficultyTrend = (intervals[intervals.length - 1] - intervals[0]) / Math.max(intervals[0], 1);
  }

  // Velocity trend (how quickly moving through material)
  let velocityTrend = 0;
  if (reviews.length >= 3) {
    const timeDiffs = [];
    for (let i = 1; i < reviews.length; i++) {
      timeDiffs.push(reviews[i].timestamp - reviews[i - 1].timestamp);
    }
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    velocityTrend = avgTimeDiff / (1000 * 60 * 60 * 24); // Convert to days
  }

  return {
    recentSuccessRate,
    recentAvgResponseTime,
    performanceTrend,        // -1 to 1, positive = improving
    difficultyTrend,         // Relative change in intervals
    velocityTrend            // Days between reviews
  };
}

/**
 * Calculate momentum features (learning acceleration)
 */
function calculateMomentumFeatures(features, movingAvgFeatures) {
  const {
    successRate,
    consecutiveCorrect,
    totalReviews
  } = features;

  const {
    recentSuccessRate,
    performanceTrend
  } = movingAvgFeatures;

  return {
    // Learning momentum (recent vs overall performance)
    learningMomentum: recentSuccessRate - successRate,

    // Streak strength (consecutive correct scaled by total experience)
    streakStrength: totalReviews > 0 ? consecutiveCorrect / Math.sqrt(totalReviews) : 0,

    // Acceleration (how fast is performance changing)
    performanceAcceleration: performanceTrend,

    // Mastery level (combination of success rate and consistency)
    masteryLevel: successRate * (1 - Math.abs(recentSuccessRate - successRate))
  };
}

/**
 * Calculate retention prediction features
 * Based on cognitive science research
 */
function calculateRetentionFeatures(features, forgettingCurveFeatures) {
  const {
    memoryStrength,
    difficultyRating,
    timeSinceLastReview,
    successRate,
    consecutiveCorrect,
    totalReviews
  } = features;

  // Stability (how well-learned is this item)
  // Based on: number of successful reviews, intervals used
  const stability = Math.log1p(consecutiveCorrect) * Math.log1p(memoryStrength);

  // Retrievability (how easy to recall right now)
  // Based on forgetting curve and time since review
  const retrievability = forgettingCurveFeatures.forgettingCurve * (1 - difficultyRating);

  // Learning efficiency (how well the learner learns this item)
  const learningEfficiency = totalReviews > 0
    ? successRate / Math.log1p(totalReviews)
    : 0;

  // Predicted retention probability (simple model)
  const retentionProbability = Math.min(1, retrievability * (1 + stability * 0.1));

  // Optimal interval estimate (when retention drops to 90%)
  // R(t) = e^(-t/S) = 0.9 => t = -S * ln(0.9)
  const optimalIntervalEstimate = Math.max(1, memoryStrength * Math.abs(Math.log(0.9)) * (1 + stability * 0.1));

  return {
    stability,
    retrievability,
    learningEfficiency,
    retentionProbability,
    optimalIntervalEstimate
  };
}

/**
 * Master function to create all advanced features
 * Expands 8 base features to 60+ features
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

  // 5. Moving average features (5 features)
  const movingAvgFeatures = calculateMovingAverageFeatures(reviewHistory, currentIndex);

  // 6. Momentum features (4 features)
  const momentumFeatures = calculateMomentumFeatures(baseFeatures, movingAvgFeatures);

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
 * Returns 51-dimensional feature vector
 */
function getFeatureArray(advancedFeatures) {
  return [
    // Base features (8)
    advancedFeatures.memoryStrength,
    advancedFeatures.difficultyRating,
    advancedFeatures.timeSinceLastReview,
    advancedFeatures.successRate,
    advancedFeatures.averageResponseTime,
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
    advancedFeatures.sqrtMemoryStrength,
    advancedFeatures.sqrtTotalReviews,
    advancedFeatures.inverseMemoryStrength,
    advancedFeatures.inverseDifficulty,

    // Cyclical time features (5)
    advancedFeatures.timeOfDaySin,
    advancedFeatures.timeOfDayCos,
    advancedFeatures.isMorning,
    advancedFeatures.isAfternoon,
    advancedFeatures.isEvening,

    // Moving average features (5)
    advancedFeatures.recentSuccessRate,
    advancedFeatures.recentAvgResponseTime / 1000, // Convert to seconds
    advancedFeatures.performanceTrend,
    advancedFeatures.difficultyTrend,
    advancedFeatures.velocityTrend,

    // Momentum features (4)
    advancedFeatures.learningMomentum,
    advancedFeatures.streakStrength,
    advancedFeatures.performanceAcceleration,
    advancedFeatures.masteryLevel,

    // Retention prediction features (5)
    advancedFeatures.stability,
    advancedFeatures.retrievability,
    advancedFeatures.learningEfficiency,
    advancedFeatures.retentionProbability,
    advancedFeatures.optimalIntervalEstimate
  ];
}

/**
 * Get feature names in order (for debugging and interpretability)
 */
function getFeatureNames() {
  return [
    // Base features
    'memoryStrength', 'difficultyRating', 'timeSinceLastReview', 'successRate',
    'averageResponseTime', 'totalReviews', 'consecutiveCorrect', 'timeOfDay',

    // Forgetting curve features
    'forgettingCurve', 'adjustedDecay', 'logTimeDecay', 'logMemoryStrength', 'decayRate',

    // Interaction features
    'difficultyTimeProduct', 'difficultyMemoryProduct', 'successMemoryProduct', 'successTimeProduct',
    'responseTimeDifficultyProduct', 'responseTimeMemoryProduct', 'consecutiveMemoryProduct',
    'consecutiveDifficultyRatio', 'experienceSuccessProduct', 'experienceDifficultyRatio',

    // Polynomial features
    'memoryStrengthSquared', 'difficultySquared', 'timeSquared', 'successRateSquared',
    'memoryStrengthCubed', 'sqrtMemoryStrength', 'sqrtTotalReviews',
    'inverseMemoryStrength', 'inverseDifficulty',

    // Cyclical time features
    'timeOfDaySin', 'timeOfDayCos', 'isMorning', 'isAfternoon', 'isEvening',

    // Moving average features
    'recentSuccessRate', 'recentAvgResponseTime', 'performanceTrend',
    'difficultyTrend', 'velocityTrend',

    // Momentum features
    'learningMomentum', 'streakStrength', 'performanceAcceleration', 'masteryLevel',

    // Retention prediction features
    'stability', 'retrievability', 'learningEfficiency', 'retentionProbability',
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
