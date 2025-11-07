'use strict';

/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on the SuperMemo SM-2 algorithm developed by Piotr Wozniak
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 *
 * This is the baseline algorithm that will be compared against ML-enhanced predictions
 */

/**
 * Calculate next review interval using SM-2 algorithm
 *
 * @param {Object} question - Question object with current state
 * @param {boolean} isCorrect - Was the answer correct?
 * @param {number} userQuality - Optional user quality rating (0-5), defaults based on isCorrect
 * @returns {Object} Updated interval data
 */
function calculateSM2Interval(question, isCorrect, userQuality = null) {
  // Convert boolean to quality rating if not provided
  // Quality scale (0-5):
  // 0 - Complete blackout
  // 1 - Incorrect, but recognized on seeing answer
  // 2 - Incorrect, seemed easy on seeing answer
  // 3 - Correct, but required significant difficulty
  // 4 - Correct, with some hesitation
  // 5 - Perfect, immediate recall

  let quality = userQuality;
  if (quality === null) {
    // Simple mapping: correct = 4, incorrect = 2
    // Can be enhanced with response time later
    quality = isCorrect ? 4 : 2;
  }

  // Get current values or defaults
  let repetitions = question.repetitions || 0;
  let easeFactor = question.easeFactor || 2.5;
  let interval = question.memoryStrength || 1;

  // If quality < 3, reset repetitions
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    // Calculate new ease factor
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // Ease factor shouldn't be less than 1.3
    if (easeFactor < 1.3) {
      easeFactor = 1.3;
    }

    // Calculate interval based on repetition number
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }

    // Cap maximum interval at 365 days (1 year)
    // Prevents exponential growth from creating absurd intervals
    if (interval > 365) {
      interval = 365;
    }

    repetitions++;
  }

  return {
    interval,
    repetitions,
    easeFactor,
    quality
  };
}

/**
 * Enhanced quality calculation based on response time
 * Faster responses indicate better retention
 *
 * @param {boolean} isCorrect - Was answer correct?
 * @param {number} responseTime - Time to answer in milliseconds
 * @param {number} averageResponseTime - Historical average response time
 * @returns {number} Quality rating (0-5)
 */
function calculateQualityWithResponseTime(isCorrect, responseTime, averageResponseTime = 3000) {
  if (!isCorrect) {
    // For incorrect answers
    // Very fast wrong answer (< 1s) = 0 (complete guess)
    // Slow wrong answer (> 5s) = 2 (tried to recall)
    if (responseTime < 1000) {
      return 0;
    } else if (responseTime > 5000) {
      return 2;
    } else {
      return 1;
    }
  } else {
    // For correct answers, use response time relative to average
    const ratio = responseTime / averageResponseTime;

    if (ratio < 0.5) {
      // Very fast (< 50% of average) = perfect recall
      return 5;
    } else if (ratio < 1.0) {
      // Fast (50-100% of average) = good recall with slight hesitation
      return 4;
    } else {
      // Slow (> 100% of average) = correct but difficult
      return 3;
    }
  }
}

/**
 * Apply SM-2 algorithm to a question after review
 * Updates all relevant fields on the question object
 *
 * @param {Object} question - Question object to update
 * @param {boolean} isCorrect - Was answer correct?
 * @param {number} responseTime - Time to answer in milliseconds
 * @returns {Object} Updated question with new interval data
 */
function applySM2Algorithm(question, isCorrect, responseTime) {
  // Calculate quality with response time consideration
  const avgResponseTime = question.averageResponseTime || 3000;
  const quality = calculateQualityWithResponseTime(isCorrect, responseTime, avgResponseTime);

  // Calculate new interval using SM-2
  const sm2Result = calculateSM2Interval(question, isCorrect, quality);

  // Update question fields
  question.memoryStrength = sm2Result.interval;
  question.repetitions = sm2Result.repetitions;
  question.easeFactor = sm2Result.easeFactor;

  return {
    question,
    interval: sm2Result.interval,
    quality: sm2Result.quality,
    algorithm: 'sm2'
  };
}

/**
 * Predict next interval without modifying question
 * Used for comparison with ML predictions
 *
 * @param {Object} question - Question object
 * @param {boolean} isCorrect - Hypothetical answer correctness
 * @returns {number} Predicted interval in days
 */
function predictSM2Interval(question, isCorrect) {
  const quality = isCorrect ? 4 : 2;
  const result = calculateSM2Interval(question, isCorrect, quality);
  return result.interval;
}

/**
 * Calculate optimal interval for current question state
 * This is used to generate training data labels
 *
 * @param {Object} reviewHistory - Array of review attempts
 * @returns {number} Optimal interval that would have been best
 */
function calculateOptimalInterval(reviewHistory) {
  if (reviewHistory.length < 2) {
    return 1;
  }

  // Find the last successful review and time to next review
  for (let i = reviewHistory.length - 2; i >= 0; i--) {
    if (reviewHistory[i].recalled && reviewHistory[i + 1]) {
      const timeDiff = reviewHistory[i + 1].timestamp - reviewHistory[i].timestamp;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      // If next review was successful, this interval worked
      if (reviewHistory[i + 1].recalled) {
        return Math.ceil(daysDiff);
      } else {
        // Failed next review, optimal would be shorter
        return Math.max(1, Math.ceil(daysDiff * 0.7));
      }
    }
  }

  return 1;
}

/**
 * Get algorithm explanation for display
 *
 * @param {Object} sm2Result - Result from SM-2 calculation
 * @returns {string} Human-readable explanation
 */
function getAlgorithmExplanation(sm2Result) {
  const messages = {
    0: 'Completely forgot - starting over with daily reviews',
    1: 'Incorrect answer - resetting to daily reviews',
    2: 'Incorrect but recognized - back to daily reviews',
    3: 'Correct with difficulty - moderate interval increase',
    4: 'Good recall - standard interval increase',
    5: 'Perfect recall - maximum interval increase'
  };

  const baseMessage = messages[sm2Result.quality] || 'Review scheduled';

  return `${baseMessage}. Next review in ${sm2Result.interval} ${sm2Result.interval === 1 ? 'day' : 'days'}.`;
}

module.exports = {
  calculateSM2Interval,
  calculateQualityWithResponseTime,
  applySM2Algorithm,
  predictSM2Interval,
  calculateOptimalInterval,
  getAlgorithmExplanation
};
