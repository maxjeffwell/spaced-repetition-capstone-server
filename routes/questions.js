'use strict';
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');

const User = require('../models/user');
const { getNextQuestion } = require('../utils/question-helpers');
const { processAnswer, getAlgorithmComparison, checkMLReadiness } = require('../algorithms/algorithm-manager');
const mlService = require('../ml/ml-service');

const router = express.Router();

// Protect all routes with JWT authentication
const jwtAuth = passport.authenticate('jwt', { session: false });

/* ========== GET NEXT QUESTION ========== */
router.get('/next', jwtAuth, (req, res, next) => {
  const userId = req.user.id;

  User.findById(userId)
    .then(user => {
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        return next(err);
      }

      const nextQuestion = getNextQuestion(user);

      if (!nextQuestion) {
        return res.json({
          message: 'No questions available',
          question: null
        });
      }

      // Calculate performance-based features
      const totalReviews = (nextQuestion.timesCorrect || 0) + (nextQuestion.timesIncorrect || 0);
      const successRate = totalReviews > 0
        ? nextQuestion.timesCorrect / totalReviews
        : 0;

      // Calculate memoryStrength based on performance, not just database value
      const baseInterval = nextQuestion.memoryStrength || 1;
      const performanceMultiplier = 1 + (successRate * 0.5); // Up to 1.5x for perfect performance
      const experienceBonus = Math.min(2, 1 + Math.log(totalReviews + 1) * 0.1); // Gradual increase
      const calculatedMemoryStrength = Math.max(1, Math.min(90, baseInterval * performanceMultiplier * experienceBonus));

      // Return question without answer, including features for client-side ML prediction
      res.json({
        question: nextQuestion.question,
        questionId: user.head,
        totalQuestions: user.questions.length,
        stats: {
          totalReviews: user.stats?.totalReviews || 0,
          correctAnswers: user.stats?.correctAnswers || 0,
          currentStreak: user.stats?.currentStreak || 0
        },
        // Question features for client-side prediction
        questionFeatures: {
          memoryStrength: calculatedMemoryStrength, // Use calculated value
          difficultyRating: nextQuestion.difficultyRating || 0.5,
          timeSinceLastReview: nextQuestion.lastReviewDate
            ? (Date.now() - new Date(nextQuestion.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24)
            : 0,
          successRate,
          averageResponseTime: nextQuestion.averageResponseTime || 0,
          totalReviews,
          consecutiveCorrect: nextQuestion.consecutiveCorrect || 0,
          timeOfDay: new Date().getHours() / 24
        },
        // Include review history for advanced features
        reviewHistory: nextQuestion.reviewHistory || []
      });
    })
    .catch(err => next(err));
});

/* ========== POST ANSWER ========== */
router.post('/answer', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const { answer, responseTime, predictedInterval, predictionTime } = req.body;

  /***** Validate input *****/
  if (!answer) {
    const err = new Error('Missing answer in request body');
    err.status = 400;
    return next(err);
  }

  if (typeof responseTime !== 'number' || responseTime < 0) {
    const err = new Error('Invalid responseTime');
    err.status = 400;
    return next(err);
  }

  // Validate client-predicted interval if provided
  if (predictedInterval !== null && predictedInterval !== undefined) {
    if (typeof predictedInterval !== 'number' || predictedInterval < 1 || predictedInterval > 365) {
      const err = new Error('Invalid predicted interval (must be 1-365 days)');
      err.status = 400;
      return next(err);
    }
  }

  User.findById(userId)
    .then(async user => {
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
      }

      const questionIndex = user.head;
      const question = user.questions[questionIndex];

      if (!question) {
        const err = new Error('No question found at head');
        err.status = 404;
        throw err;
      }

      // Check if answer is correct (case-insensitive)
      const userAnswer = answer.trim().toLowerCase();
      const correctAnswer = question.answer.trim().toLowerCase();
      const isCorrect = userAnswer === correctAnswer;

      // Use client-predicted interval if provided, otherwise calculate server-side
      let result;
      if (predictedInterval !== null && predictedInterval !== undefined) {
        console.log(`✅ Using client WebGPU prediction: ${predictedInterval} days (${predictionTime?.toFixed(2) || 'N/A'}ms)`);

        // Process answer with client-predicted interval
        result = await processAnswer(
          user,
          questionIndex,
          isCorrect,
          responseTime,
          null, // No server ML model needed
          predictedInterval // Use client prediction
        );
      } else {
        console.log('⚠️  No client prediction, using server-side ML/baseline');

        // Get ML model if available
        const mlModel = mlService.getModel();

        // Process answer with algorithm manager (with optional ML model)
        result = await processAnswer(user, questionIndex, isCorrect, responseTime, mlModel);
      }

      // Save updated user (user object was modified in-place by processAnswer)
      // Skip validation since data is already validated by processAnswer
      return result.user.save({ validateBeforeSave: false })
        .then(updatedUser => {
          res.json({
            correct: isCorrect,
            correctAnswer: question.answer,
            feedback: result.feedback,
            nextQuestion: getNextQuestion(updatedUser)?.question || null,
            stats: {
              totalReviews: updatedUser.stats?.totalReviews || 0,
              correctAnswers: updatedUser.stats?.correctAnswers || 0,
              currentStreak: updatedUser.stats?.currentStreak || 0
            }
          });
        });
    })
    .catch(err => next(err));
});

/* ========== GET ALGORITHM COMPARISON STATS ========== */
router.get('/stats/comparison', jwtAuth, (req, res, next) => {
  const userId = req.user.id;

  User.findById(userId)
    .then(user => {
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        return next(err);
      }

      const comparison = getAlgorithmComparison(user);
      const mlReadiness = checkMLReadiness(user);

      res.json({
        comparison,
        mlReadiness,
        currentMode: user.settings?.algorithmMode || 'baseline'
      });
    })
    .catch(err => next(err));
});

/* ========== GET USER PROGRESS ========== */
router.get('/progress', jwtAuth, (req, res, next) => {
  const userId = req.user.id;

  User.findById(userId)
    .then(user => {
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        return next(err);
      }

      // Calculate progress statistics
      const cardStats = user.questions.map(q => ({
        question: q.question,
        timesCorrect: q.timesCorrect,
        timesIncorrect: q.timesIncorrect,
        successRate: q.timesCorrect / Math.max(1, q.timesCorrect + q.timesIncorrect),
        consecutiveCorrect: q.consecutiveCorrect,
        memoryStrength: q.memoryStrength,
        lastReviewed: q.lastReviewed
      }));

      res.json({
        stats: user.stats,
        cards: cardStats,
        totalCards: user.questions.length,
        masteredCards: user.questions.filter(q => q.consecutiveCorrect >= 3).length
      });
    })
    .catch(err => next(err));
});

/* ========== UPDATE USER SETTINGS ========== */
router.patch('/settings', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const { algorithmMode, dailyGoal } = req.body;

  const updateFields = {};

  if (algorithmMode && ['baseline', 'ml', 'ab-test'].includes(algorithmMode)) {
    updateFields['settings.algorithmMode'] = algorithmMode;
    updateFields['settings.useMLAlgorithm'] = algorithmMode !== 'baseline';
  }

  if (typeof dailyGoal === 'number' && dailyGoal > 0) {
    updateFields['settings.dailyGoal'] = dailyGoal;
  }

  User.findByIdAndUpdate(userId, updateFields, { new: true })
    .then(user => {
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        return next(err);
      }

      res.json({
        message: 'Settings updated',
        settings: user.settings
      });
    })
    .catch(err => next(err));
});

module.exports = router;