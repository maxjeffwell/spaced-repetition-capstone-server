'use strict';

/**
 * Helper utilities for working with the enhanced question model
 */

/**
 * Calculate derived statistics from review history
 */
function calculateQuestionStats(question) {
  if (!question.reviewHistory || question.reviewHistory.length === 0) {
    return {
      successRate: 0,
      totalReviews: 0,
      averageResponseTime: 0,
      daysSinceLastReview: null
    };
  }

  const totalReviews = question.reviewHistory.length;
  const correctReviews = question.reviewHistory.filter(r => r.recalled).length;
  const successRate = correctReviews / totalReviews;

  const totalResponseTime = question.reviewHistory.reduce((sum, r) => sum + r.responseTime, 0);
  const averageResponseTime = totalResponseTime / totalReviews;

  const daysSinceLastReview = question.lastReviewed
    ? (Date.now() - question.lastReviewed.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  return {
    successRate,
    totalReviews,
    averageResponseTime,
    daysSinceLastReview
  };
}

/**
 * Create feature vector for ML model from question data
 */
function createFeatureVector(question) {
  const stats = calculateQuestionStats(question);

  return {
    memoryStrength: question.memoryStrength || 1,
    difficultyRating: question.difficultyRating || 0.5,
    timeSinceLastReview: stats.daysSinceLastReview || 0,
    successRate: stats.successRate || 0,
    averageResponseTime: stats.averageResponseTime || 0,
    totalReviews: stats.totalReviews || 0,
    consecutiveCorrect: question.consecutiveCorrect || 0,
    timeOfDay: new Date().getHours() / 24
  };
}

/**
 * Update question statistics after a review
 */
function updateQuestionStats(question, isCorrect, responseTime) {
  // Update counts
  if (isCorrect) {
    question.timesCorrect = (question.timesCorrect || 0) + 1;
    question.consecutiveCorrect = (question.consecutiveCorrect || 0) + 1;
  } else {
    question.timesIncorrect = (question.timesIncorrect || 0) + 1;
    question.consecutiveCorrect = 0;
  }

  // Update last reviewed
  question.lastReviewed = new Date();

  // Update average response time (rolling average)
  const currentAvg = question.averageResponseTime || 0;
  const currentCount = (question.timesCorrect || 0) + (question.timesIncorrect || 0);
  question.averageResponseTime = ((currentAvg * (currentCount - 1)) + responseTime) / currentCount;

  // Update difficulty rating based on performance
  // More failures = higher difficulty (0-1 scale)
  const totalAttempts = question.timesCorrect + question.timesIncorrect;
  if (totalAttempts > 0) {
    question.difficultyRating = question.timesIncorrect / totalAttempts;
  }

  return question;
}

/**
 * Add review to history
 */
function addReviewToHistory(question, reviewData) {
  if (!question.reviewHistory) {
    question.reviewHistory = [];
  }

  question.reviewHistory.push({
    timestamp: new Date(),
    recalled: reviewData.recalled,
    responseTime: reviewData.responseTime,
    intervalUsed: reviewData.intervalUsed,
    algorithmUsed: reviewData.algorithmUsed,
    baselineInterval: reviewData.baselineInterval,
    mlInterval: reviewData.mlInterval || null,
    difficulty: reviewData.difficulty || 3
  });

  // Keep only last 100 reviews to manage document size
  if (question.reviewHistory.length > 100) {
    question.reviewHistory = question.reviewHistory.slice(-100);
  }

  return question;
}

/**
 * Get next question in linked list
 */
function getNextQuestion(user) {
  if (!user.questions || user.questions.length === 0) {
    return null;
  }

  const headIndex = user.head || 0;
  if (headIndex >= user.questions.length) {
    return null;
  }

  return user.questions[headIndex];
}

/**
 * Move question in linked list based on interval
 */
function updateLinkedList(user, questionIndex, interval) {
  const questions = user.questions;
  const n = questions.length;

  if (questionIndex >= n || interval < 1) {
    return user;
  }

  // Calculate new position (interval steps ahead)
  let newPosition = (questionIndex + interval) % n;
  if (newPosition <= questionIndex) {
    newPosition = (questionIndex + interval) % n + 1;
  }

  // Update the next pointer
  questions[questionIndex].next = newPosition;

  // Update head to next question
  user.head = questions[questionIndex].next;

  // Calculate memoryStrength based on performance, not just interval
  // This combines: consecutive successes, success rate, and review count
  // to better represent actual memory consolidation
  const question = questions[questionIndex];
  const stats = calculateQuestionStats(question);
  const baseStrength = interval; // Start with the interval
  const performanceMultiplier = 1 + (stats.successRate * 0.5); // Up to 1.5x for perfect performance
  const experienceBonus = Math.min(2, 1 + Math.log(stats.totalReviews + 1) * 0.1); // Gradual increase

  questions[questionIndex].memoryStrength = Math.max(
    1,
    Math.min(90, baseStrength * performanceMultiplier * experienceBonus)
  );

  return user;
}

/**
 * Initialize question with default values
 */
function initializeQuestion(questionData, index) {
  return {
    ...questionData,
    memoryStrength: 1,
    next: (index + 1) % (questionData.total || index + 1),
    repetitions: 0,
    easeFactor: 2.5,
    difficultyRating: 0.5,
    reviewHistory: [],
    lastReviewed: null,
    timesCorrect: 0,
    timesIncorrect: 0,
    averageResponseTime: 0,
    consecutiveCorrect: 0,
    mlRecommendedInterval: null,
    predictedRetention: null
  };
}

/**
 * Get training data from all users (for ML model)
 */
function extractTrainingData(users) {
  const trainingData = [];

  users.forEach(user => {
    user.questions.forEach(question => {
      if (!question.reviewHistory || question.reviewHistory.length < 2) {
        return; // Need at least 2 reviews to have an outcome
      }

      // For each review, create a training example
      for (let i = 0; i < question.reviewHistory.length - 1; i++) {
        const review = question.reviewHistory[i];
        const nextReview = question.reviewHistory[i + 1];

        // Calculate actual retention
        const daysBetween = (nextReview.timestamp - review.timestamp) / (1000 * 60 * 60 * 24);
        const wasRetained = nextReview.recalled;

        // Calculate stats at time of review
        const reviewsUpToNow = question.reviewHistory.slice(0, i + 1);
        const correctUpToNow = reviewsUpToNow.filter(r => r.recalled).length;
        const successRate = correctUpToNow / reviewsUpToNow.length;

        const avgResponseTime = reviewsUpToNow.reduce((sum, r) => sum + r.responseTime, 0) / reviewsUpToNow.length;

        trainingData.push({
          // Features
          memoryStrength: review.intervalUsed,
          difficultyRating: question.difficultyRating,
          timeSinceLastReview: daysBetween,
          successRate: successRate,
          averageResponseTime: avgResponseTime,
          totalReviews: i + 1,
          consecutiveCorrect: calculateConsecutiveCorrect(reviewsUpToNow, i),
          timeOfDay: review.timestamp.getHours() / 24,

          // Label (what we're trying to predict)
          optimalInterval: wasRetained ? daysBetween : Math.max(1, daysBetween * 0.5),
          wasRetained: wasRetained
        });
      }
    });
  });

  return trainingData;
}

function calculateConsecutiveCorrect(reviews, upToIndex) {
  let consecutive = 0;
  for (let i = upToIndex; i >= 0; i--) {
    if (reviews[i].recalled) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

module.exports = {
  calculateQuestionStats,
  createFeatureVector,
  updateQuestionStats,
  addReviewToHistory,
  getNextQuestion,
  updateLinkedList,
  initializeQuestion,
  extractTrainingData
};
