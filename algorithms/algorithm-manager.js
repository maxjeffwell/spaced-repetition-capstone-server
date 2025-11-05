'use strict';

/**
 * Algorithm Manager
 *
 * Coordinates between baseline SM-2 and ML-enhanced algorithms
 * Handles A/B testing and performance tracking
 */

const { applySM2Algorithm, predictSM2Interval } = require('./sm2');
const {
  updateQuestionStats,
  addReviewToHistory,
  updateLinkedList
} = require('../utils/question-helpers');

/**
 * Process answer and update question with appropriate algorithm
 *
 * @param {Object} user - User object
 * @param {number} questionIndex - Index of question being answered
 * @param {boolean} isCorrect - Was answer correct?
 * @param {number} responseTime - Time to answer in milliseconds
 * @param {Object} mlModel - Optional ML model for predictions
 * @returns {Object} Result with updated user and feedback
 */
async function processAnswer(user, questionIndex, isCorrect, responseTime, mlModel = null) {
  const question = user.questions[questionIndex];

  // Determine which algorithm to use
  const algorithmMode = user.settings?.algorithmMode || 'baseline';
  let algorithmUsed = algorithmMode;

  // For A/B testing, randomly assign algorithm per card
  if (algorithmMode === 'ab-test') {
    // Use question ID to deterministically assign algorithm (consistent per card)
    algorithmUsed = question._id.toString().charCodeAt(0) % 2 === 0 ? 'baseline' : 'ml';
  }

  // Always calculate baseline prediction
  const baselineResult = applySM2Algorithm(question, isCorrect, responseTime);
  const baselineInterval = baselineResult.interval;

  // Calculate ML prediction if available and needed
  let mlInterval = null;
  let mlPrediction = null;

  if (mlModel && (algorithmUsed === 'ml' || algorithmMode === 'ab-test')) {
    try {
      mlPrediction = await predictMLInterval(question, mlModel);
      mlInterval = mlPrediction.interval;
    } catch (error) {
      console.error('ML prediction failed, falling back to baseline:', error.message);
      algorithmUsed = 'baseline';
      mlInterval = baselineInterval;
    }
  }

  // Determine which interval to use
  let intervalUsed;
  if (algorithmUsed === 'ml' && mlInterval !== null) {
    intervalUsed = mlInterval;
    // Update question with ML interval
    question.memoryStrength = mlInterval;
    question.mlRecommendedInterval = mlInterval;
    if (mlPrediction?.confidence) {
      question.predictedRetention = mlPrediction.confidence;
    }
  } else {
    intervalUsed = baselineInterval;
    // Baseline result already applied to question
  }

  // Update question statistics
  updateQuestionStats(question, isCorrect, responseTime);

  // Add to review history
  addReviewToHistory(question, {
    recalled: isCorrect,
    responseTime,
    intervalUsed,
    algorithmUsed,
    baselineInterval,
    mlInterval,
    difficulty: 3 // Could be user-provided later
  });

  // Update linked list position
  updateLinkedList(user, questionIndex, intervalUsed);

  // Update user stats
  updateUserStats(user, isCorrect);

  // Prepare feedback
  const feedback = {
    correct: isCorrect,
    intervalUsed,
    algorithmUsed,
    baselineInterval,
    mlInterval,
    nextReviewDate: calculateNextReviewDate(intervalUsed),
    quality: baselineResult.quality,
    stats: {
      consecutiveCorrect: question.consecutiveCorrect,
      successRate: question.timesCorrect / (question.timesCorrect + question.timesIncorrect),
      totalReviews: question.timesCorrect + question.timesIncorrect
    }
  };

  return {
    user,
    feedback
  };
}

/**
 * Predict interval using ML model
 *
 * @param {Object} question - Question to predict for
 * @param {Object} mlModel - Trained ML model instance
 * @returns {Object} Prediction with interval
 */
async function predictMLInterval(question, mlModel) {
  const { createFeatureVector } = require('../utils/question-helpers');

  // Create feature vector from question
  const features = createFeatureVector(question);

  // Predict optimal interval
  const interval = mlModel.predict(features);

  return {
    interval,
    confidence: null // Could add confidence intervals in future
  };
}

/**
 * Update user-level statistics
 *
 * @param {Object} user - User object
 * @param {boolean} isCorrect - Was answer correct?
 */
function updateUserStats(user, isCorrect) {
  if (!user.stats) {
    user.stats = {
      totalReviews: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null
    };
  }

  user.stats.totalReviews++;

  if (isCorrect) {
    user.stats.correctAnswers++;
  } else {
    user.stats.incorrectAnswers++;
  }

  // Update study streak
  const today = new Date().setHours(0, 0, 0, 0);
  const lastStudy = user.stats.lastStudyDate ?
    new Date(user.stats.lastStudyDate).setHours(0, 0, 0, 0) : null;

  if (lastStudy === today) {
    // Same day, streak continues
  } else if (lastStudy === today - 86400000) {
    // Yesterday, increment streak
    user.stats.currentStreak++;
  } else {
    // Streak broken, reset
    user.stats.currentStreak = 1;
  }

  // Update longest streak
  if (user.stats.currentStreak > user.stats.longestStreak) {
    user.stats.longestStreak = user.stats.currentStreak;
  }

  user.stats.lastStudyDate = new Date();
}

/**
 * Calculate next review date
 *
 * @param {number} interval - Days until next review
 * @returns {Date} Next review date
 */
function calculateNextReviewDate(interval) {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  return nextDate;
}

/**
 * Get algorithm comparison stats for user
 * Shows performance difference between baseline and ML
 *
 * @param {Object} user - User object
 * @returns {Object} Comparison statistics
 */
function getAlgorithmComparison(user) {
  const baselineReviews = [];
  const mlReviews = [];

  user.questions.forEach(question => {
    if (!question.reviewHistory) return;

    question.reviewHistory.forEach(review => {
      if (review.algorithmUsed === 'baseline') {
        baselineReviews.push(review);
      } else if (review.algorithmUsed === 'ml') {
        mlReviews.push(review);
      }
    });
  });

  const baselineStats = calculateAlgorithmStats(baselineReviews);
  const mlStats = calculateAlgorithmStats(mlReviews);

  return {
    baseline: baselineStats,
    ml: mlStats,
    improvement: {
      retentionRate: mlStats.retentionRate - baselineStats.retentionRate,
      avgInterval: mlStats.avgInterval - baselineStats.avgInterval,
      reviewsNeeded: baselineStats.totalReviews - mlStats.totalReviews
    }
  };
}

/**
 * Calculate statistics for algorithm performance
 *
 * @param {Array} reviews - Array of review objects
 * @returns {Object} Statistics
 */
function calculateAlgorithmStats(reviews) {
  if (reviews.length === 0) {
    return {
      totalReviews: 0,
      retentionRate: 0,
      avgInterval: 0,
      avgResponseTime: 0
    };
  }

  const recalled = reviews.filter(r => r.recalled).length;
  const totalInterval = reviews.reduce((sum, r) => sum + r.intervalUsed, 0);
  const totalResponseTime = reviews.reduce((sum, r) => sum + r.responseTime, 0);

  return {
    totalReviews: reviews.length,
    retentionRate: recalled / reviews.length,
    avgInterval: totalInterval / reviews.length,
    avgResponseTime: totalResponseTime / reviews.length
  };
}

/**
 * Check if user has enough data to train ML model
 *
 * @param {Object} user - User object
 * @returns {Object} Readiness status and recommendation
 */
function checkMLReadiness(user) {
  let totalReviews = 0;
  let cardsWithHistory = 0;

  user.questions.forEach(question => {
    const reviewCount = question.reviewHistory?.length || 0;
    totalReviews += reviewCount;
    if (reviewCount >= 2) {
      cardsWithHistory++;
    }
  });

  const ready = totalReviews >= 100 && cardsWithHistory >= 10;

  return {
    ready,
    totalReviews,
    cardsWithHistory,
    minimumReviews: 100,
    minimumCards: 10,
    message: ready ?
      'Ready to train ML model!' :
      `Complete ${100 - totalReviews} more reviews to enable ML predictions`
  };
}

module.exports = {
  processAnswer,
  predictMLInterval,
  updateUserStats,
  calculateNextReviewDate,
  getAlgorithmComparison,
  checkMLReadiness
};
