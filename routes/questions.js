'use strict';
const express = require('express');

const User = require('../models/user');
const { getNextQuestion } = require('../utils/question-helpers');
const { processAnswer, getAlgorithmComparison, checkMLReadiness } = require('../algorithms/algorithm-manager');
const mlService = require('../ml/ml-service');
const logger = require('../utils/logger').child('Questions');
const { validate } = require('../middleware/validation');
const { NotFoundError } = require('../utils/errors');
const { requireAuth } = require('../middleware/cookie-auth');
const mongoose = require('mongoose');
const config = require('../config');
const { BadRequestError } = require('../utils/errors');
const qdrantService = require('../ml/qdrant-service');

const router = express.Router();

// Force server-side predictions (Triton/ML) instead of client WebGPU
const forceServerPrediction = process.env.USE_SERVER_PREDICTION === 'true';

/* ========== GET NEXT QUESTION ========== */
router.get('/next', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
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

    // memoryStrength as stored: updateLinkedList() already applied the performance and
    // experience multipliers when it was written. (Until 2026-10-06 this re-applied both
    // multipliers on top, so the browser saw up to 3x the value the server-side model
    // used; the v2 model is trained on the stored scale, so send it as is.)
    const calculatedMemoryStrength = Math.max(1, Math.min(90, nextQuestion.memoryStrength || 1));

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
  } catch (err) {
    next(err);
  }
});

/* ========== POST ANSWER ========== */
router.post('/answer', requireAuth, validate('answer'), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { answer, responseTime, predictedInterval, predictedIntervals, predictionTime } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const questionIndex = user.head;
    const question = user.questions[questionIndex];

    if (!question) {
      throw new NotFoundError('No question found at head');
    }

    // Check if answer is correct (case-insensitive)
    const userAnswer = answer.trim().toLowerCase();
    const correctAnswer = question.answer.trim().toLowerCase();
    const isCorrect = userAnswer === correctAnswer;

    // v2: the client predicts BOTH outcomes before grading ({ ifCorrect, ifIncorrect });
    // the branch matching the graded answer is applied. A v1 single `predictedInterval`
    // (computed before grading) is ignored -- it cannot depend on correctness.
    let result;
    const hasClientBranches = predictedIntervals
      && typeof predictedIntervals.ifCorrect === 'number'
      && typeof predictedIntervals.ifIncorrect === 'number';
    const useClientPrediction = !forceServerPrediction && hasClientBranches;

    if (useClientPrediction) {
      logger.debug('Using client WebGPU prediction (outcome-aware)', {
        predictedIntervals,
        applied: isCorrect ? predictedIntervals.ifCorrect : predictedIntervals.ifIncorrect,
        predictionTimeMs: predictionTime?.toFixed(2)
      });

      // Process answer with client-predicted intervals
      result = await processAnswer(
        user,
        questionIndex,
        isCorrect,
        responseTime,
        null, // No server ML model needed
        predictedIntervals
      );
    } else {
      if (predictedInterval !== null && predictedInterval !== undefined) {
        logger.debug('Ignoring legacy single client prediction (not outcome-aware); using server-side ML', { predictedInterval });
      } else {
        logger.debug('No client prediction, using server-side ML/baseline');
      }

      // Get ML model if available
      const mlModel = mlService.getModel();

      // Process answer with algorithm manager (with optional ML model)
      result = await processAnswer(user, questionIndex, isCorrect, responseTime, mlModel);
    }

    // Save updated user (user object was modified in-place by processAnswer)
    // Skip validation since data is already validated by processAnswer
    const updatedUser = await result.user.save({ validateBeforeSave: false });

    const response = {
      correct: isCorrect,
      correctAnswer: question.answer,
      feedback: result.feedback,
      nextQuestion: getNextQuestion(updatedUser)?.question || null,
      stats: {
        totalReviews: updatedUser.stats?.totalReviews || 0,
        correctAnswers: updatedUser.stats?.correctAnswers || 0,
        currentStreak: updatedUser.stats?.currentStreak || 0
      }
    };

    logger.debug('Answer processed', { correct: isCorrect, totalReviews: response.stats.totalReviews });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/* ========== GET ALGORITHM COMPARISON STATS ========== */
router.get('/stats/comparison', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const comparison = getAlgorithmComparison(user);
    const mlReadiness = checkMLReadiness(user);

    res.json({
      comparison,
      mlReadiness,
      currentMode: user.settings?.algorithmMode || 'baseline'
    });
  } catch (err) {
    next(err);
  }
});

/* ========== GET USER PROGRESS ========== */
router.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Calculate progress statistics
    const cardStats = user.questions.map(q => {
      const timesCorrect = q.timesCorrect || 0;
      const timesIncorrect = q.timesIncorrect || 0;
      const totalReviews = timesCorrect + timesIncorrect;

      return {
        question: q.question,
        timesCorrect,
        timesIncorrect,
        totalReviews,
        successRate: totalReviews > 0 ? timesCorrect / totalReviews : 0,
        consecutiveCorrect: q.consecutiveCorrect || 0,
        memoryStrength: q.memoryStrength || 1,
        lastReviewed: q.lastReviewed
      };
    });

    // Calculate overall statistics
    const totalReviews = user.stats?.totalReviews || 0;
    const correctAnswers = user.stats?.correctAnswers || 0;
    const successRate = totalReviews > 0 ? correctAnswers / totalReviews : 0;

    res.json({
      stats: user.stats,
      cards: cardStats,
      totalCards: user.questions.length,
      totalReviews,
      successRate,
      masteredCards: user.questions.filter(q => q.consecutiveCorrect >= 3).length
    });
  } catch (err) {
    next(err);
  }
});

/* ========== UPDATE USER SETTINGS ========== */
router.patch('/settings', requireAuth, async (req, res, next) => {
  try {
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

    const user = await User.findByIdAndUpdate(userId, updateFields, { new: true });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      message: 'Settings updated',
      settings: user.settings
    });
  } catch (err) {
    next(err);
  }
});

/* ========== GET RELATED CARDS ========== */
router.get('/:id/related', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cardId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(cardId)) {
      throw new BadRequestError('The card `id` is not valid');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const card = user.questions.id(cardId);
    if (!card) {
      throw new NotFoundError('Card not found');
    }

    if (!qdrantService.enabled) {
      return res.json({ related: [] });
    }

    const requestedK = parseInt(req.query.k, 10);
    const k = Math.min(
      Number.isInteger(requestedK) && requestedK > 0 ? requestedK : config.RELATED_K_DEFAULT,
      config.RELATED_K_MAX
    );

    let related = [];
    try {
      related = await qdrantService.related(cardId, userId, k, config.RELATED_MIN_SCORE);
    } catch (err) {
      logger.warn('Related lookup failed (returning empty)', { cardId, error: err.message });
      related = [];
    }

    res.json({ related });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
