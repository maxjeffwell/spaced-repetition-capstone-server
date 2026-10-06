'use strict';

const chai = require('chai');
const expect = chai.expect;

const {
  FEATURE_VERSION,
  FEATURE_COUNT,
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames,
  calculateMemoryFeatures,
  calculateInteractionFeatures,
  encodeCyclicalTime,
  calculateMomentumFeatures
} = require('../ml/advanced-features');

describe('Advanced Feature Engineering (v2)', function() {

  const baseFeatures = {
    memoryStrength: 3,
    difficultyRating: 0.4,
    successRate: 0.75,
    averageResponseTime: 3500,
    totalReviews: 8,
    consecutiveCorrect: 3,
    timeOfDay: 0.58,
    recalled: true
  };

  const reviewHistory = [
    { timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 3000, intervalUsed: 1 },
    { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, recalled: true, responseTime: 2800, intervalUsed: 2 }
  ];

  describe('Feature Vector Creation', function() {
    it('is version 2 with 24 features', function() {
      expect(FEATURE_VERSION).to.equal(2);
      expect(FEATURE_COUNT).to.equal(24);
    });

    it('should create a 24-dimensional feature vector', function() {
      const featureArray = getFeatureArray(createAdvancedFeatureVector(baseFeatures, reviewHistory));
      expect(featureArray).to.be.an('array');
      expect(featureArray).to.have.lengthOf(FEATURE_COUNT);
    });

    it('should return feature names matching array length', function() {
      expect(getFeatureNames()).to.have.lengthOf(FEATURE_COUNT);
    });

    it('should include all base features, with response time in seconds', function() {
      const features = createAdvancedFeatureVector(baseFeatures, reviewHistory);
      expect(features.memoryStrength).to.equal(3);
      expect(features.difficultyRating).to.equal(0.4);
      expect(features.successRate).to.equal(0.75);
      expect(features.totalReviews).to.equal(8);
      expect(features.averageResponseTime).to.equal(3.5);
      expect(features.recalled).to.equal(1);
    });

    it('should encode a wrong answer as recalled = 0', function() {
      const features = createAdvancedFeatureVector({ ...baseFeatures, recalled: false });
      expect(features.recalled).to.equal(0);
      expect(features.recalledMemoryProduct).to.equal(0);
      expect(features.recalledConsecutive).to.equal(0);
    });

    it('should default recalled to 1 when the outcome is not supplied', function() {
      const { recalled, ...withoutOutcome } = baseFeatures; // eslint-disable-line no-unused-vars
      expect(createAdvancedFeatureVector(withoutOutcome).recalled).to.equal(1);
    });

    it('must not contain any elapsed-time feature (the v1 leak)', function() {
      const names = getFeatureNames();
      const leaky = names.filter(n => /time(Since|Squared|Cubed)|sqrtTime|decay|forgetting|maInterval|reviewFrequency|stabilityIndex|predictedRetention/i.test(n));
      expect(leaky).to.deep.equal([]);
      expect(names).to.not.include('timeSinceLastReview');
    });

    it('should produce finite numeric values for all features', function() {
      const featureArray = getFeatureArray(createAdvancedFeatureVector(baseFeatures, reviewHistory));
      featureArray.forEach((value, idx) => {
        expect(value).to.be.a('number', `Feature at index ${idx} should be a number`);
        expect(isFinite(value), `Feature ${getFeatureNames()[idx]} finite`).to.be.true;
      });
    });

    it('ignores review history (no history-derived features in v2)', function() {
      const a = getFeatureArray(createAdvancedFeatureVector(baseFeatures, reviewHistory));
      const b = getFeatureArray(createAdvancedFeatureVector(baseFeatures, null));
      expect(a).to.deep.equal(b);
    });
  });

  describe('Memory Features', function() {
    it('should calculate log, sqrt and square', function() {
      const f = calculateMemoryFeatures(3);
      expect(f.logMemoryStrength).to.be.approximately(Math.log1p(3), 0.0001);
      expect(f.sqrtMemoryStrength).to.be.approximately(Math.sqrt(3), 0.0001);
      expect(f.memoryStrengthSquared).to.equal(9);
    });

    it('should handle zero and negative safely', function() {
      const f = calculateMemoryFeatures(-1);
      expect(f.sqrtMemoryStrength).to.equal(0);
      expect(isNaN(f.logMemoryStrength)).to.be.false;
    });
  });

  describe('Interaction Features', function() {
    const base = { ...baseFeatures, recalled: 1 };

    it('should calculate products correctly', function() {
      const f = calculateInteractionFeatures(base);
      expect(f.successMemoryProduct).to.equal(0.75 * 3);
      expect(f.experienceSuccessProduct).to.equal(8 * 0.75);
      expect(f.recalledMemoryProduct).to.equal(3);
      expect(f.recalledConsecutive).to.equal(3);
      expect(f.responseTimeDifficultyProduct).to.be.approximately(3.5 * 0.4, 0.0001);
    });

    it('should handle ratios with zero denominators', function() {
      const f = calculateInteractionFeatures({ ...base, difficultyRating: 0 });
      expect(isFinite(f.experienceDifficultyRatio)).to.be.true;
    });
  });

  describe('Cyclical Time Encoding', function() {
    it('should make midnight and 11:59 PM similar', function() {
      const a = encodeCyclicalTime(0);
      const b = encodeCyclicalTime(0.99);
      const distance = Math.hypot(a.timeSin - b.timeSin, a.timeCos - b.timeCos);
      expect(distance).to.be.lessThan(0.3);
    });
  });

  describe('Momentum Features', function() {
    it('should calculate velocity, acceleration and confidence', function() {
      const f = calculateMomentumFeatures(baseFeatures);
      expect(f.learningVelocity).to.be.approximately(0.375, 0.01);
      expect(f.performanceAcceleration).to.be.approximately(0.25, 0.01);
      expect(f.confidenceScore).to.be.approximately(0.45, 0.01);
    });
  });

  describe('Edge Cases', function() {
    it('should handle very large values', function() {
      const featureArray = getFeatureArray(createAdvancedFeatureVector({ ...baseFeatures, memoryStrength: 1000, totalReviews: 10000 }));
      featureArray.forEach(value => expect(isFinite(value)).to.be.true);
    });

    it('should handle zero success rate', function() {
      const f = createAdvancedFeatureVector({ ...baseFeatures, successRate: 0, consecutiveCorrect: 0 });
      expect(f.successRate).to.equal(0);
      expect(f.learningVelocity).to.equal(0);
    });

    it('should be deterministic and ordered', function() {
      const names = getFeatureNames();
      const arr1 = getFeatureArray(createAdvancedFeatureVector(baseFeatures));
      const arr2 = getFeatureArray(createAdvancedFeatureVector(baseFeatures));
      expect(arr1).to.deep.equal(arr2);
      expect(names[0]).to.equal('memoryStrength');
      expect(arr1[0]).to.equal(baseFeatures.memoryStrength);
      expect(names[7]).to.equal('recalled');
      expect(arr1[7]).to.equal(1);
    });
  });
});
