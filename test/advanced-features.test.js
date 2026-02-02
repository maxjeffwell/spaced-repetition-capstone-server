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

    it('should handle negative values with sqrt safely', function() {
      const negativeFeatures = { ...baseFeatures, memoryStrength: -1, timeSinceLastReview: -1 };
      const features = calculatePolynomialFeatures(negativeFeatures);

      // Should use Math.max(value, 0) to avoid NaN from sqrt of negative
      expect(features.sqrtMemoryStrength).to.equal(0);
      expect(features.sqrtTime).to.equal(0);
      expect(isNaN(features.sqrtMemoryStrength)).to.be.false;
    });

    it('should handle zero values safely', function() {
      const zeroFeatures = { ...baseFeatures, memoryStrength: 0, timeSinceLastReview: 0, totalReviews: 0 };
      const features = calculatePolynomialFeatures(zeroFeatures);

      expect(features.sqrtMemoryStrength).to.equal(0);
      expect(features.sqrtTime).to.equal(0);
      expect(features.sqrtTotalReviews).to.equal(0);
      expect(isNaN(features.memoryStrengthSquared)).to.be.false;
    });
  });

  describe('Cyclical Time Encoding', function() {
    it('should encode time as sine and cosine', function() {
      const features = encodeCyclicalTime(0.5); // Noon

      expect(features.timeSin).to.be.a('number');
      expect(features.timeCos).to.be.a('number');
      expect(features.timeSin).to.be.within(-1, 1);
      expect(features.timeCos).to.be.within(-1, 1);
    });

    it('should make midnight and 11:59 PM similar', function() {
      const midnight = encodeCyclicalTime(0);
      const lateNight = encodeCyclicalTime(0.99);

      // Both should have similar sine/cosine values
      const distance = Math.sqrt(
        Math.pow(midnight.timeSin - lateNight.timeSin, 2) +
        Math.pow(midnight.timeCos - lateNight.timeCos, 2)
      );

      expect(distance).to.be.lessThan(0.3); // Close together on circle
    });

    it('should include higher harmonics and phase', function() {
      const features = encodeCyclicalTime(0.5); // Noon

      expect(features.timeSin2).to.be.a('number');
      expect(features.timeCos2).to.be.a('number');
      expect(features.timePhase).to.be.a('number');
    });
  });

  describe('Moving Average Features', function() {
    it('should calculate moving average success rate', function() {
      const features = calculateMovingAverageFeatures(baseFeatures);

      expect(features.maSuccessRate).to.be.at.least(0);
      expect(features.maSuccessRate).to.be.at.most(1);
    });

    it('should calculate all moving average features', function() {
      const features = calculateMovingAverageFeatures(baseFeatures);

      expect(features.maDifficulty).to.be.a('number');
      expect(features.maResponseTime).to.be.a('number');
      expect(features.maInterval).to.be.a('number');
      expect(features.reviewFrequency).to.be.a('number');
    });

    it('should convert response time to seconds', function() {
      const features = calculateMovingAverageFeatures(baseFeatures);

      // baseFeatures.averageResponseTime is 3500ms, should be 3.5s
      expect(features.maResponseTime).to.equal(3.5);
    });

    it('should calculate review frequency', function() {
      const features = calculateMovingAverageFeatures(baseFeatures);

      // totalReviews / timeSinceLastReview = 8 / 2.5 = 3.2
      expect(features.reviewFrequency).to.be.approximately(3.2, 0.01);
    });
  });

  describe('Momentum Features', function() {
    it('should calculate learning velocity', function() {
      const features = calculateMomentumFeatures(baseFeatures);

      expect(features.learningVelocity).to.be.a('number');
      // consecutiveCorrect / totalReviews = 3 / 8 = 0.375
      expect(features.learningVelocity).to.be.approximately(0.375, 0.01);
    });

    it('should calculate performance acceleration', function() {
      const features = calculateMomentumFeatures(baseFeatures);

      expect(features.performanceAcceleration).to.be.a('number');
      // successRate - 0.5 = 0.75 - 0.5 = 0.25
      expect(features.performanceAcceleration).to.be.approximately(0.25, 0.01);
    });

    it('should calculate mastery momentum', function() {
      const features = calculateMomentumFeatures(baseFeatures);

      expect(features.masteryMomentum).to.be.a('number');
      // learningVelocity * memoryStrength = 0.375 * 3 = 1.125
      expect(features.masteryMomentum).to.be.approximately(1.125, 0.01);
    });

    it('should show higher momentum for better performers', function() {
      const highPerformer = {
        ...baseFeatures,
        successRate: 0.95,
        consecutiveCorrect: 10,
        totalReviews: 20,
        memoryStrength: 10
      };

      const features = calculateMomentumFeatures(highPerformer);

      // Higher consecutive correct and memory strength = higher momentum
      expect(features.masteryMomentum).to.be.greaterThan(1);
    });
  });

  describe('Retention Prediction Features', function() {
    const forgettingCurveFeatures = calculateForgettingCurveFeatures(3, 2.5, 0.75);

    it('should calculate stability index', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.stabilityIndex).to.be.at.least(0);
      // memoryStrength / timeSinceLastReview = 3 / 2.5 = 1.2
      expect(features.stabilityIndex).to.be.approximately(1.2, 0.01);
    });

    it('should calculate predicted retention between 0 and 1', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.predictedRetention).to.be.at.least(0);
      expect(features.predictedRetention).to.be.at.most(1);
    });

    it('should calculate confidence score', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.confidenceScore).to.be.a('number');
      // successRate * (1 - difficultyRating) = 0.75 * (1 - 0.4) = 0.45
      expect(features.confidenceScore).to.be.approximately(0.45, 0.01);
    });

    it('should provide optimal interval estimate', function() {
      const features = calculateRetentionFeatures(baseFeatures, forgettingCurveFeatures);

      expect(features.optimalIntervalEstimate).to.be.at.least(1);
      // memoryStrength * (1 + successRate) = 3 * (1 + 0.75) = 5.25
      expect(features.optimalIntervalEstimate).to.be.approximately(5.25, 0.01);
    });

    it('should show higher stability for stronger memory', function() {
      const weak = { ...baseFeatures, memoryStrength: 1 };
      const strong = { ...baseFeatures, memoryStrength: 10 };

      const weakFeatures = calculateRetentionFeatures(weak, forgettingCurveFeatures);
      const strongFeatures = calculateRetentionFeatures(strong, forgettingCurveFeatures);

      expect(strongFeatures.stabilityIndex).to.be.greaterThan(weakFeatures.stabilityIndex);
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
      expect(features.learningVelocity).to.be.a('number');
      expect(features.masteryMomentum).to.be.a('number');
    });

    it('should handle perfect success rate', function() {
      const perfectSuccess = {
        ...baseFeatures,
        successRate: 1.0,
        consecutiveCorrect: 10
      };

      const features = createAdvancedFeatureVector(perfectSuccess, reviewHistory);

      expect(features.successRate).to.equal(1.0);
      expect(features.performanceAcceleration).to.equal(0.5); // 1.0 - 0.5 baseline
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
