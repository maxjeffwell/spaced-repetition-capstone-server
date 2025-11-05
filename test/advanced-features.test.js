'use strict';

const chai = require('chai');
const expect = chai.expect;

const {
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
} = require('../ml/advanced-features');

describe('Advanced Feature Engineering', function() {

  // Sample base features for testing
  const baseFeatures = {
    memoryStrength: 3,
    difficultyRating: 0.4,
    timeSinceLastReview: 2.5,
    successRate: 0.75,
    averageResponseTime: 3500,
    totalReviews: 8,
    consecutiveCorrect: 3,
    timeOfDay: 0.58
  };

  const reviewHistory = [
    { timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 3000, intervalUsed: 1 },
    { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2800, intervalUsed: 2 },
    { timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000, recalled: false, responseTime: 5000, intervalUsed: 2 },
    { timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 3200, intervalUsed: 1 },
    { timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2900, intervalUsed: 2 }
  ];

  describe('Feature Vector Creation', function() {
    it('should create a 51-dimensional feature vector', function() {
      const features = createAdvancedFeatureVector(baseFeatures, reviewHistory);
      const featureArray = getFeatureArray(features);

      expect(featureArray).to.be.an('array');
      expect(featureArray).to.have.lengthOf(51);
    });

    it('should return feature names matching array length', function() {
      const featureNames = getFeatureNames();

      expect(featureNames).to.be.an('array');
      expect(featureNames).to.have.lengthOf(51);
    });

    it('should include all base features', function() {
      const features = createAdvancedFeatureVector(baseFeatures, reviewHistory);

      expect(features.memoryStrength).to.equal(3);
      expect(features.difficultyRating).to.equal(0.4);
      expect(features.successRate).to.equal(0.75);
      expect(features.totalReviews).to.equal(8);
    });

    it('should produce numeric values for all features', function() {
      const features = createAdvancedFeatureVector(baseFeatures, reviewHistory);
      const featureArray = getFeatureArray(features);

      featureArray.forEach((value, idx) => {
        expect(value).to.be.a('number', `Feature at index ${idx} should be a number`);
        expect(isNaN(value)).to.be.false;
        expect(isFinite(value)).to.be.true;
      });
    });
  });

  describe('Forgetting Curve Features', function() {
    it('should calculate forgetting curve between 0 and 1', function() {
      const features = calculateForgettingCurveFeatures(3, 2.5, 0.75);

      expect(features.forgettingCurve).to.be.at.least(0);
      expect(features.forgettingCurve).to.be.at.most(1);
    });

    it('should show higher retention for shorter time periods', function() {
      const shortTime = calculateForgettingCurveFeatures(5, 1, 0.75);
      const longTime = calculateForgettingCurveFeatures(5, 10, 0.75);

      expect(shortTime.forgettingCurve).to.be.greaterThan(longTime.forgettingCurve);
    });

    it('should show higher retention for stronger memory', function() {
      const weak = calculateForgettingCurveFeatures(1, 2, 0.75);
      const strong = calculateForgettingCurveFeatures(10, 2, 0.75);

      expect(strong.forgettingCurve).to.be.greaterThan(weak.forgettingCurve);
    });

    it('should calculate log transforms correctly', function() {
      const features = calculateForgettingCurveFeatures(3, 2.5, 0.75);

      expect(features.logMemoryStrength).to.be.approximately(Math.log1p(3), 0.0001);
      expect(features.logTimeDecay).to.be.greaterThan(0);
    });
  });

  describe('Interaction Features', function() {
    it('should calculate all interaction features', function() {
      const features = calculateInteractionFeatures(baseFeatures);

      expect(features).to.have.property('difficultyTimeProduct');
      expect(features).to.have.property('successMemoryProduct');
      expect(features).to.have.property('responseTimeDifficultyProduct');
      expect(features).to.have.property('consecutiveMemoryProduct');
      expect(features).to.have.property('experienceSuccessProduct');
    });

    it('should calculate products correctly', function() {
      const features = calculateInteractionFeatures(baseFeatures);

      expect(features.difficultyTimeProduct).to.equal(0.4 * 2.5);
      expect(features.successMemoryProduct).to.equal(0.75 * 3);
      expect(features.experienceSuccessProduct).to.equal(8 * 0.75);
    });

    it('should handle ratios with zero denominators', function() {
      const zeroFeatures = { ...baseFeatures, difficultyRating: 0 };
      const features = calculateInteractionFeatures(zeroFeatures);

      expect(features.consecutiveDifficultyRatio).to.be.a('number');
      expect(isFinite(features.consecutiveDifficultyRatio)).to.be.true;
    });
  });

  describe('Polynomial Features', function() {
    it('should calculate squared features', function() {
      const features = calculatePolynomialFeatures(baseFeatures);

      expect(features.memoryStrengthSquared).to.equal(9);
      expect(features.difficultySquared).to.be.approximately(0.16, 0.00001);
      expect(features.timeSquared).to.equal(6.25);
    });

    it('should calculate cubic features', function() {
      const features = calculatePolynomialFeatures(baseFeatures);

      expect(features.memoryStrengthCubed).to.equal(27);
    });

    it('should calculate square root features', function() {
      const features = calculatePolynomialFeatures(baseFeatures);

      expect(features.sqrtMemoryStrength).to.be.approximately(Math.sqrt(3), 0.0001);
      expect(features.sqrtTotalReviews).to.be.approximately(Math.sqrt(8), 0.0001);
    });

    it('should handle inverse features without division by zero', function() {
      const features = calculatePolynomialFeatures(baseFeatures);

      expect(features.inverseMemoryStrength).to.be.approximately(1/3, 0.0001);
      expect(features.inverseDifficulty).to.be.finite;
    });

    it('should handle zero memory strength safely', function() {
      const zeroFeatures = { ...baseFeatures, memoryStrength: 0 };
      const features = calculatePolynomialFeatures(zeroFeatures);

      expect(features.inverseMemoryStrength).to.equal(0);
      expect(isNaN(features.inverseMemoryStrength)).to.be.false;
    });
  });

  describe('Cyclical Time Encoding', function() {
    it('should encode time as sine and cosine', function() {
      const features = encodeCyclicalTime(0.5); // Noon

      expect(features.timeOfDaySin).to.be.a('number');
      expect(features.timeOfDayCos).to.be.a('number');
      expect(features.timeOfDaySin).to.be.within(-1, 1);
      expect(features.timeOfDayCos).to.be.within(-1, 1);
    });

    it('should make midnight and 11:59 PM similar', function() {
      const midnight = encodeCyclicalTime(0);
      const lateNight = encodeCyclicalTime(0.99);

      // Both should have similar sine/cosine values
      const distance = Math.sqrt(
        Math.pow(midnight.timeOfDaySin - lateNight.timeOfDaySin, 2) +
        Math.pow(midnight.timeOfDayCos - lateNight.timeOfDayCos, 2)
      );

      expect(distance).to.be.lessThan(0.3); // Close together on circle
    });

    it('should categorize time periods correctly', function() {
      const morning = encodeCyclicalTime(0.375); // 9 AM
      const afternoon = encodeCyclicalTime(0.625); // 3 PM
      const evening = encodeCyclicalTime(0.875); // 9 PM

      expect(morning.isMorning).to.equal(1);
      expect(morning.isAfternoon).to.equal(0);

      expect(afternoon.isAfternoon).to.equal(1);
      expect(afternoon.isMorning).to.equal(0);

      expect(evening.isEvening).to.equal(1);
      expect(evening.isAfternoon).to.equal(0);
    });
  });

  describe('Moving Average Features', function() {
    it('should calculate recent success rate', function() {
      const features = calculateMovingAverageFeatures(reviewHistory);

      expect(features.recentSuccessRate).to.be.at.least(0);
      expect(features.recentSuccessRate).to.be.at.most(1);
    });

    it('should calculate performance trends', function() {
      const features = calculateMovingAverageFeatures(reviewHistory);

      expect(features.performanceTrend).to.be.a('number');
      expect(features.difficultyTrend).to.be.a('number');
      expect(features.velocityTrend).to.be.a('number');
    });

    it('should handle empty review history', function() {
      const features = calculateMovingAverageFeatures(null);

      expect(features.recentSuccessRate).to.equal(0);
      expect(features.recentAvgResponseTime).to.equal(0);
      expect(features.performanceTrend).to.equal(0);
    });

    it('should handle short review history', function() {
      const shortHistory = reviewHistory.slice(0, 2);
      const features = calculateMovingAverageFeatures(shortHistory);

      expect(features.recentSuccessRate).to.be.a('number');
      expect(features.recentAvgResponseTime).to.be.a('number');
    });
  });

  describe('Momentum Features', function() {
    const movingAvgFeatures = calculateMovingAverageFeatures(reviewHistory);

    it('should calculate learning momentum', function() {
      const features = calculateMomentumFeatures(baseFeatures, movingAvgFeatures);

      expect(features.learningMomentum).to.be.a('number');
      expect(features.learningMomentum).to.be.within(-1, 1);
    });

    it('should calculate streak strength', function() {
      const features = calculateMomentumFeatures(baseFeatures, movingAvgFeatures);

      expect(features.streakStrength).to.be.at.least(0);
    });

    it('should calculate mastery level between 0 and 1', function() {
      const features = calculateMomentumFeatures(baseFeatures, movingAvgFeatures);

      expect(features.masteryLevel).to.be.at.least(0);
      expect(features.masteryLevel).to.be.at.most(1);
    });

    it('should show higher mastery for consistent high performers', function() {
      const highPerformer = {
        ...baseFeatures,
        successRate: 0.95,
        totalReviews: 20
      };
      const movingAvg = { ...movingAvgFeatures, recentSuccessRate: 0.95 };

      const features = calculateMomentumFeatures(highPerformer, movingAvg);

      expect(features.masteryLevel).to.be.greaterThan(0.8);
    });
  });

  describe('Retention Prediction Features', function() {
    const forgettingCurveFeatures = calculateForgettingCurveFeatures(3, 2.5, 0.75);

    it('should calculate stability', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.stability).to.be.at.least(0);
    });

    it('should calculate retrievability between 0 and 1', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.retrievability).to.be.at.least(0);
      expect(features.retrievability).to.be.at.most(1);
    });

    it('should calculate retention probability', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.retentionProbability).to.be.at.least(0);
      expect(features.retentionProbability).to.be.at.most(1);
    });

    it('should provide optimal interval estimate', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.optimalIntervalEstimate).to.be.at.least(1);
    });

    it('should show higher stability for more experienced learners', function() {
      const novice = { ...baseFeatures, consecutiveCorrect: 1, totalReviews: 2 };
      const expert = { ...baseFeatures, consecutiveCorrect: 20, totalReviews: 50 };

      const noviceFeatures = calculateRetentionFeatures(novice, forgettingCurveFeatures);
      const expertFeatures = calculateRetentionFeatures(expert, forgettingCurveFeatures);

      expect(expertFeatures.stability).to.be.greaterThan(noviceFeatures.stability);
    });
  });

  describe('Edge Cases and Error Handling', function() {
    it('should handle negative values gracefully', function() {
      const negativeFeatures = {
        ...baseFeatures,
        timeSinceLastReview: -1 // Invalid but should not crash
      };

      expect(() => {
        createAdvancedFeatureVector(negativeFeatures, reviewHistory);
      }).to.not.throw();
    });

    it('should handle very large values', function() {
      const largeFeatures = {
        ...baseFeatures,
        memoryStrength: 1000,
        totalReviews: 10000
      };

      const features = createAdvancedFeatureVector(largeFeatures, reviewHistory);
      const featureArray = getFeatureArray(features);

      featureArray.forEach(value => {
        expect(isFinite(value)).to.be.true;
      });
    });

    it('should handle zero success rate', function() {
      const zeroSuccess = {
        ...baseFeatures,
        successRate: 0,
        consecutiveCorrect: 0
      };

      const features = createAdvancedFeatureVector(zeroSuccess, reviewHistory);

      expect(features.successRate).to.equal(0);
      expect(features.learningMomentum).to.be.a('number');
    });

    it('should handle perfect success rate', function() {
      const perfectSuccess = {
        ...baseFeatures,
        successRate: 1.0,
        consecutiveCorrect: 10
      };

      const features = createAdvancedFeatureVector(perfectSuccess, reviewHistory);

      expect(features.successRate).to.equal(1.0);
      expect(features.masteryLevel).to.be.at.least(0.8);
    });

    it('should handle missing review history', function() {
      const features = createAdvancedFeatureVector(baseFeatures, null);
      const featureArray = getFeatureArray(features);

      expect(featureArray).to.have.lengthOf(51);
      featureArray.forEach(value => {
        expect(isNaN(value)).to.be.false;
        expect(isFinite(value)).to.be.true;
      });
    });
  });

  describe('Feature Consistency', function() {
    it('should produce deterministic results', function() {
      const features1 = createAdvancedFeatureVector(baseFeatures, reviewHistory);
      const features2 = createAdvancedFeatureVector(baseFeatures, reviewHistory);

      const array1 = getFeatureArray(features1);
      const array2 = getFeatureArray(features2);

      array1.forEach((value, idx) => {
        expect(value).to.equal(array2[idx]);
      });
    });

    it('should maintain feature order', function() {
      const featureNames = getFeatureNames();
      const features = createAdvancedFeatureVector(baseFeatures, reviewHistory);
      const featureArray = getFeatureArray(features);

      // Check that base features are first
      expect(featureNames[0]).to.equal('memoryStrength');
      expect(featureArray[0]).to.equal(baseFeatures.memoryStrength);

      expect(featureNames[7]).to.equal('timeOfDay');
      expect(featureArray[7]).to.equal(baseFeatures.timeOfDay);
    });
  });
});
