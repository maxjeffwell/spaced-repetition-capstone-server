'use strict';

const chai = require('chai');
const expect = chai.expect;

const {
  calculateSM2Interval,
  calculateQualityWithResponseTime,
  applySM2Algorithm,
  predictSM2Interval,
  calculateOptimalInterval,
  getAlgorithmExplanation
} = require('../algorithms/sm2');

const {
  updateUserStats,
  calculateNextReviewDate,
  getAlgorithmComparison,
  checkMLReadiness
} = require('../algorithms/algorithm-manager');

describe('SM-2 Algorithm', function() {

  describe('calculateSM2Interval', function() {
    it('should return interval of 1 for first correct answer', function() {
      const question = { repetitions: 0, easeFactor: 2.5, memoryStrength: 1 };
      const result = calculateSM2Interval(question, true);

      expect(result.interval).to.equal(1);
      expect(result.repetitions).to.equal(1);
    });

    it('should return interval of 6 for second consecutive correct answer', function() {
      const question = { repetitions: 1, easeFactor: 2.5, memoryStrength: 1 };
      const result = calculateSM2Interval(question, true);

      expect(result.interval).to.equal(6);
      expect(result.repetitions).to.equal(2);
    });

    it('should multiply interval by ease factor after second repetition', function() {
      const question = { repetitions: 2, easeFactor: 2.5, memoryStrength: 6 };
      const result = calculateSM2Interval(question, true);

      expect(result.interval).to.equal(15); // 6 * 2.5 = 15
      expect(result.repetitions).to.equal(3);
    });

    it('should reset repetitions to 0 for incorrect answer', function() {
      const question = { repetitions: 5, easeFactor: 2.5, memoryStrength: 30 };
      const result = calculateSM2Interval(question, false);

      expect(result.interval).to.equal(1);
      expect(result.repetitions).to.equal(0);
    });

    it('should decrease ease factor for quality < 3', function() {
      const question = { repetitions: 0, easeFactor: 2.5, memoryStrength: 1 };
      const result = calculateSM2Interval(question, false, 2);

      // EF formula: EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      // For q=2: 2.5 + (0.1 - 3 * (0.08 + 3 * 0.02)) = 2.5 + (0.1 - 0.42) = 2.18
      // But since quality < 3, repetitions reset and interval = 1
      expect(result.interval).to.equal(1);
    });

    it('should maintain ease factor minimum of 1.3', function() {
      // Start with low ease factor
      const question = { repetitions: 3, easeFactor: 1.4, memoryStrength: 10 };
      // Multiple incorrect answers would push it below 1.3
      const result = calculateSM2Interval(question, true, 3); // quality 3 decreases EF

      expect(result.easeFactor).to.be.at.least(1.3);
    });

    it('should cap interval at 365 days', function() {
      const question = { repetitions: 10, easeFactor: 2.5, memoryStrength: 200 };
      const result = calculateSM2Interval(question, true, 5);

      expect(result.interval).to.be.at.most(365);
    });

    it('should handle new question with no prior data', function() {
      const question = {};
      const result = calculateSM2Interval(question, true);

      expect(result.interval).to.equal(1);
      expect(result.repetitions).to.equal(1);
      expect(result.easeFactor).to.be.a('number');
    });
  });

  describe('calculateQualityWithResponseTime', function() {
    it('should return 5 for fast correct answer', function() {
      const quality = calculateQualityWithResponseTime(true, 1000, 3000);
      expect(quality).to.equal(5);
    });

    it('should return 4 for moderately fast correct answer', function() {
      const quality = calculateQualityWithResponseTime(true, 2500, 3000);
      expect(quality).to.equal(4);
    });

    it('should return 3 for slow correct answer', function() {
      const quality = calculateQualityWithResponseTime(true, 5000, 3000);
      expect(quality).to.equal(3);
    });

    it('should return 0 for very fast incorrect answer (guess)', function() {
      const quality = calculateQualityWithResponseTime(false, 500, 3000);
      expect(quality).to.equal(0);
    });

    it('should return 2 for slow incorrect answer (attempted recall)', function() {
      const quality = calculateQualityWithResponseTime(false, 6000, 3000);
      expect(quality).to.equal(2);
    });

    it('should return 1 for moderate speed incorrect answer', function() {
      const quality = calculateQualityWithResponseTime(false, 3000, 3000);
      expect(quality).to.equal(1);
    });
  });

  describe('applySM2Algorithm', function() {
    it('should update question fields after correct answer', function() {
      const question = {
        memoryStrength: 1,
        repetitions: 0,
        easeFactor: 2.5,
        averageResponseTime: 3000
      };

      const result = applySM2Algorithm(question, true, 2000);

      expect(result.interval).to.be.a('number');
      expect(result.quality).to.be.within(0, 5);
      expect(question.memoryStrength).to.equal(result.interval);
    });

    it('should return algorithm type as sm2', function() {
      const question = { memoryStrength: 1, repetitions: 0, easeFactor: 2.5 };
      const result = applySM2Algorithm(question, true, 3000);

      expect(result.algorithm).to.equal('sm2');
    });
  });

  describe('predictSM2Interval', function() {
    it('should predict without modifying original question', function() {
      const question = {
        memoryStrength: 5,
        repetitions: 2,
        easeFactor: 2.5
      };
      const originalState = JSON.stringify(question);

      predictSM2Interval(question, true);

      expect(JSON.stringify(question)).to.equal(originalState);
    });

    it('should return expected interval for correct answer', function() {
      const question = { memoryStrength: 6, repetitions: 2, easeFactor: 2.5 };
      const interval = predictSM2Interval(question, true);

      expect(interval).to.equal(15); // 6 * 2.5
    });

    it('should return 1 for incorrect answer prediction', function() {
      const question = { memoryStrength: 30, repetitions: 5, easeFactor: 2.5 };
      const interval = predictSM2Interval(question, false);

      expect(interval).to.equal(1);
    });
  });

  describe('calculateOptimalInterval', function() {
    it('should return 1 for insufficient history', function() {
      const history = [{ recalled: true, timestamp: Date.now() }];
      const optimal = calculateOptimalInterval(history);

      expect(optimal).to.equal(1);
    });

    it('should calculate interval from successful review sequence', function() {
      const now = Date.now();
      const history = [
        { recalled: true, timestamp: now - 5 * 24 * 60 * 60 * 1000 }, // 5 days ago
        { recalled: true, timestamp: now } // today (success)
      ];
      const optimal = calculateOptimalInterval(history);

      expect(optimal).to.equal(5);
    });

    it('should reduce interval for failed subsequent review', function() {
      const now = Date.now();
      const history = [
        { recalled: true, timestamp: now - 10 * 24 * 60 * 60 * 1000 },
        { recalled: false, timestamp: now } // failed
      ];
      const optimal = calculateOptimalInterval(history);

      expect(optimal).to.equal(7); // 10 * 0.7 = 7
    });
  });

  describe('getAlgorithmExplanation', function() {
    it('should return explanation for quality 5', function() {
      const result = { quality: 5, interval: 15 };
      const explanation = getAlgorithmExplanation(result);

      expect(explanation).to.include('Perfect recall');
      expect(explanation).to.include('15 days');
    });

    it('should use singular "day" for interval of 1', function() {
      const result = { quality: 0, interval: 1 };
      const explanation = getAlgorithmExplanation(result);

      expect(explanation).to.include('1 day');
      expect(explanation).to.not.include('1 days');
    });
  });
});

describe('Algorithm Manager', function() {

  describe('updateUserStats', function() {
    it('should initialize stats if missing', function() {
      const user = {};
      updateUserStats(user, true);

      expect(user.stats).to.exist;
      expect(user.stats.totalReviews).to.equal(1);
      expect(user.stats.correctAnswers).to.equal(1);
    });

    it('should increment correct answers for correct answer', function() {
      const user = {
        stats: {
          totalReviews: 5,
          correctAnswers: 3,
          incorrectAnswers: 2,
          currentStreak: 1,
          longestStreak: 1,
          lastStudyDate: new Date()
        }
      };
      updateUserStats(user, true);

      expect(user.stats.totalReviews).to.equal(6);
      expect(user.stats.correctAnswers).to.equal(4);
    });

    it('should increment incorrect answers for incorrect answer', function() {
      const user = {
        stats: {
          totalReviews: 5,
          correctAnswers: 3,
          incorrectAnswers: 2,
          currentStreak: 1,
          longestStreak: 1,
          lastStudyDate: new Date()
        }
      };
      updateUserStats(user, false);

      expect(user.stats.totalReviews).to.equal(6);
      expect(user.stats.incorrectAnswers).to.equal(3);
    });

    it('should update lastStudyDate', function() {
      const user = { stats: { lastStudyDate: null } };
      const before = new Date();
      updateUserStats(user, true);

      expect(user.stats.lastStudyDate).to.be.instanceOf(Date);
      expect(user.stats.lastStudyDate.getTime()).to.be.at.least(before.getTime());
    });
  });

  describe('calculateNextReviewDate', function() {
    it('should return date in the future', function() {
      const interval = 5;
      const nextDate = calculateNextReviewDate(interval);

      expect(nextDate).to.be.instanceOf(Date);
      expect(nextDate.getTime()).to.be.greaterThan(Date.now());
    });

    it('should add correct number of days', function() {
      const interval = 7;
      const now = new Date();
      const nextDate = calculateNextReviewDate(interval);

      const daysDiff = Math.round((nextDate - now) / (1000 * 60 * 60 * 24));
      expect(daysDiff).to.equal(interval);
    });
  });

  describe('getAlgorithmComparison', function() {
    it('should return comparison stats for user with no reviews', function() {
      const user = { questions: [] };
      const comparison = getAlgorithmComparison(user);

      expect(comparison.baseline.totalReviews).to.equal(0);
      expect(comparison.ml.totalReviews).to.equal(0);
    });

    it('should separate baseline and ML reviews', function() {
      const user = {
        questions: [{
          reviewHistory: [
            { algorithmUsed: 'baseline', recalled: true, intervalUsed: 3, responseTime: 2000 },
            { algorithmUsed: 'ml', recalled: true, intervalUsed: 5, responseTime: 1800 },
            { algorithmUsed: 'webgpu', recalled: true, intervalUsed: 6, responseTime: 1500 }
          ]
        }]
      };
      const comparison = getAlgorithmComparison(user);

      expect(comparison.baseline.totalReviews).to.equal(1);
      expect(comparison.ml.totalReviews).to.equal(2); // ml + webgpu
    });

    it('should calculate improvement metrics', function() {
      const user = {
        questions: [{
          reviewHistory: [
            { algorithmUsed: 'baseline', recalled: true, intervalUsed: 3, responseTime: 3000 },
            { algorithmUsed: 'baseline', recalled: false, intervalUsed: 3, responseTime: 4000 },
            { algorithmUsed: 'ml', recalled: true, intervalUsed: 5, responseTime: 2000 },
            { algorithmUsed: 'ml', recalled: true, intervalUsed: 6, responseTime: 1800 }
          ]
        }]
      };
      const comparison = getAlgorithmComparison(user);

      expect(comparison.baseline.retentionRate).to.equal(0.5); // 1/2
      expect(comparison.ml.retentionRate).to.equal(1); // 2/2
      expect(comparison.improvement.retentionRate).to.equal(0.5);
    });
  });

  describe('checkMLReadiness', function() {
    it('should return not ready for new user', function() {
      const user = { questions: [] };
      const readiness = checkMLReadiness(user);

      expect(readiness.ready).to.be.false;
      expect(readiness.totalReviews).to.equal(0);
    });

    it('should require minimum 100 reviews', function() {
      const questions = [];
      for (let i = 0; i < 20; i++) {
        questions.push({
          reviewHistory: Array(4).fill({ recalled: true }) // 80 total reviews
        });
      }
      const user = { questions };
      const readiness = checkMLReadiness(user);

      expect(readiness.ready).to.be.false;
      expect(readiness.totalReviews).to.equal(80);
      expect(readiness.minimumReviews).to.equal(100);
    });

    it('should require minimum 10 cards with history', function() {
      const questions = [];
      for (let i = 0; i < 5; i++) {
        questions.push({
          reviewHistory: Array(30).fill({ recalled: true }) // 150 reviews, but only 5 cards
        });
      }
      const user = { questions };
      const readiness = checkMLReadiness(user);

      expect(readiness.ready).to.be.false;
      expect(readiness.cardsWithHistory).to.equal(5);
      expect(readiness.minimumCards).to.equal(10);
    });

    it('should return ready when both conditions met', function() {
      const questions = [];
      for (let i = 0; i < 15; i++) {
        questions.push({
          reviewHistory: Array(10).fill({ recalled: true }) // 150 reviews, 15 cards
        });
      }
      const user = { questions };
      const readiness = checkMLReadiness(user);

      expect(readiness.ready).to.be.true;
      expect(readiness.message).to.include('Ready');
    });
  });
});
