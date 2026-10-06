'use strict';

/**
 * Feature Engineering for the Spaced Repetition interval model -- VERSION 2
 *
 * Why v2 (2026-10-06): the v1 model always returned ~2 days. Its label was the
 * observed gap to the next review (x1.2), and 13 of its 51 features were
 * `timeSinceLastReview` in disguise (decay rates, time polynomials, maInterval,
 * reviewFrequency, stabilityIndex, ...). The network learned
 * "interval = time since last review", which in a working app equals the
 * previous interval -- so the schedule could never grow. v1 also predicted
 * BEFORE the answer was graded, so a wrong answer got the same interval as a
 * right one.
 *
 * v2 inputs describe the card's STATE plus the OUTCOME of the current answer,
 * and nothing derived from elapsed time:
 *   - memoryStrength is the card's current interval scale (the state SM-2 also
 *     keeps); growth is expressed relative to it.
 *   - recalled (0/1) is the graded outcome. Clients that must predict before
 *     grading call the model twice (recalled=1 and recalled=0) and the server
 *     picks the branch that matches the graded answer.
 *
 * MUST MATCH the Python training script and the client copy exactly
 * (scripts/build-training-matrix.js uses THIS file, so the training matrix is
 * produced by the production feature code).
 */

const FEATURE_VERSION = 2;

/**
 * Memory-strength transforms (3)
 */
function calculateMemoryFeatures(memoryStrength) {
  const m = Math.max(memoryStrength, 0);
  return {
    logMemoryStrength: Math.log1p(m),
    sqrtMemoryStrength: Math.sqrt(m),
    memoryStrengthSquared: m * m
  };
}

/**
 * Interaction features (8) -- products of state variables, no elapsed time
 */
function calculateInteractionFeatures(features) {
  const {
    memoryStrength,
    difficultyRating,
    successRate,
    averageResponseTime,
    totalReviews,
    consecutiveCorrect,
    recalled
  } = features;

  return {
    difficultyMemoryProduct: difficultyRating * memoryStrength,
    successMemoryProduct: successRate * memoryStrength,
    consecutiveMemoryProduct: consecutiveCorrect * memoryStrength,
    recalledMemoryProduct: recalled * memoryStrength,
    recalledConsecutive: recalled * consecutiveCorrect,
    experienceSuccessProduct: totalReviews * successRate,
    experienceDifficultyRatio: difficultyRating > 0 ? totalReviews / (difficultyRating + 1) : totalReviews,
    responseTimeDifficultyProduct: (averageResponseTime / 1000) * difficultyRating
  };
}

/**
 * Cyclical time-of-day encoding (2). timeOfDay is 0-1 (0 = midnight).
 */
function encodeCyclicalTime(timeOfDay) {
  const radians = timeOfDay * 2 * Math.PI;
  return {
    timeSin: Math.sin(radians),
    timeCos: Math.cos(radians)
  };
}

/**
 * Momentum / confidence features (3)
 */
function calculateMomentumFeatures(features) {
  const { difficultyRating, successRate, consecutiveCorrect, totalReviews } = features;
  return {
    learningVelocity: consecutiveCorrect / Math.max(totalReviews, 1),
    performanceAcceleration: successRate - 0.5,
    confidenceScore: successRate * (1 - difficultyRating)
  };
}

/**
 * Master function: 8 base features -> 24-dimensional feature object.
 *
 * baseFeatures: { memoryStrength, difficultyRating, successRate,
 *                 averageResponseTime (ms), totalReviews, consecutiveCorrect,
 *                 timeOfDay (0-1), recalled (true/false or 0/1) }
 *
 * reviewHistory is accepted for API compatibility with v1 callers; v2 does not
 * read it (v1's history features were elapsed-time proxies).
 */
function createAdvancedFeatureVector(baseFeatures, reviewHistory = null) { // eslint-disable-line no-unused-vars
  const recalled = baseFeatures.recalled === undefined || baseFeatures.recalled === null
    ? 1
    : (baseFeatures.recalled ? 1 : 0);

  const base = {
    memoryStrength: Number(baseFeatures.memoryStrength) || 0,
    difficultyRating: Number(baseFeatures.difficultyRating) || 0,
    successRate: Number(baseFeatures.successRate) || 0,
    averageResponseTime: Number(baseFeatures.averageResponseTime) || 0, // ms in, seconds out below
    totalReviews: Number(baseFeatures.totalReviews) || 0,
    consecutiveCorrect: Number(baseFeatures.consecutiveCorrect) || 0,
    timeOfDay: Number(baseFeatures.timeOfDay) || 0,
    recalled
  };

  return {
    // Base features (8)
    memoryStrength: base.memoryStrength,
    difficultyRating: base.difficultyRating,
    successRate: base.successRate,
    averageResponseTime: base.averageResponseTime / 1000, // seconds
    totalReviews: base.totalReviews,
    consecutiveCorrect: base.consecutiveCorrect,
    timeOfDay: base.timeOfDay,
    recalled: base.recalled,

    // Memory transforms (3)
    ...calculateMemoryFeatures(base.memoryStrength),

    // Interactions (8)
    ...calculateInteractionFeatures(base),

    // Cyclical time (2)
    ...encodeCyclicalTime(base.timeOfDay),

    // Momentum / confidence (3)
    ...calculateMomentumFeatures(base)
  };
}

/**
 * Feature vector as an array, in the order the model was trained on.
 */
function getFeatureArray(f) {
  return [
    f.memoryStrength,
    f.difficultyRating,
    f.successRate,
    f.averageResponseTime,
    f.totalReviews,
    f.consecutiveCorrect,
    f.timeOfDay,
    f.recalled,

    f.logMemoryStrength,
    f.sqrtMemoryStrength,
    f.memoryStrengthSquared,

    f.difficultyMemoryProduct,
    f.successMemoryProduct,
    f.consecutiveMemoryProduct,
    f.recalledMemoryProduct,
    f.recalledConsecutive,
    f.experienceSuccessProduct,
    f.experienceDifficultyRatio,
    f.responseTimeDifficultyProduct,

    f.timeSin,
    f.timeCos,

    f.learningVelocity,
    f.performanceAcceleration,
    f.confidenceScore
  ];
}

function getFeatureNames() {
  return [
    'memoryStrength', 'difficultyRating', 'successRate', 'averageResponseTime',
    'totalReviews', 'consecutiveCorrect', 'timeOfDay', 'recalled',
    'logMemoryStrength', 'sqrtMemoryStrength', 'memoryStrengthSquared',
    'difficultyMemoryProduct', 'successMemoryProduct', 'consecutiveMemoryProduct',
    'recalledMemoryProduct', 'recalledConsecutive', 'experienceSuccessProduct',
    'experienceDifficultyRatio', 'responseTimeDifficultyProduct',
    'timeSin', 'timeCos',
    'learningVelocity', 'performanceAcceleration', 'confidenceScore'
  ];
}

const FEATURE_COUNT = getFeatureNames().length;

module.exports = {
  FEATURE_VERSION,
  FEATURE_COUNT,
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames,
  calculateMemoryFeatures,
  calculateInteractionFeatures,
  encodeCyclicalTime,
  calculateMomentumFeatures
};
