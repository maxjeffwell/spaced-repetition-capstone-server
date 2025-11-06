#!/usr/bin/env node
'use strict';

/**
 * Generate realistic training data with proper time intervals and forgetting curve
 *
 * This script creates multiple simulated users with different learning profiles
 * and spreads reviews over realistic time periods (days/weeks).
 *
 * Usage:
 *   node scripts/simulate-realistic-reviews.js [options]
 *
 * Options:
 *   --users=N          Number of simulated users (default: 3)
 *   --sessions=N       Study sessions per user (default: 10)
 *   --reviews=N        Reviews per session (default: 5)
 *   --days=N           Days to spread simulation over (default: 30)
 *   --mode=MODE        'fast' (seconds) or 'realistic' (days) (default: realistic)
 *   --algorithm=ALGO   'baseline' or 'ml' (default: baseline)
 *
 * Examples:
 *   # Quick test (seconds between reviews)
 *   node scripts/simulate-realistic-reviews.js --mode=fast --users=1 --sessions=5
 *
 *   # Realistic training data with baseline (days between reviews)
 *   node scripts/simulate-realistic-reviews.js --users=5 --sessions=15 --days=60
 *
 *   # Generate ML predictions (requires trained model)
 *   node scripts/simulate-realistic-reviews.js --users=3 --sessions=10 --algorithm=ml
 */

const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');

// Learning profiles for different simulated users
const LEARNING_PROFILES = {
  FAST_LEARNER: {
    name: 'Fast Learner',
    baseAccuracy: 0.85,
    responseTimeMultiplier: 0.7,
    retentionBonus: 0.15
  },
  AVERAGE_LEARNER: {
    name: 'Average Learner',
    baseAccuracy: 0.70,
    responseTimeMultiplier: 1.0,
    retentionBonus: 0.0
  },
  SLOW_LEARNER: {
    name: 'Slow Learner',
    baseAccuracy: 0.55,
    responseTimeMultiplier: 1.5,
    retentionBonus: -0.10
  },
  INCONSISTENT: {
    name: 'Inconsistent Learner',
    baseAccuracy: 0.65,
    responseTimeMultiplier: 1.2,
    retentionBonus: 0.0,
    variability: 0.3  // High variance
  },
  MOTIVATED: {
    name: 'Motivated Learner',
    baseAccuracy: 0.75,
    responseTimeMultiplier: 0.9,
    retentionBonus: 0.10,
    improvementRate: 0.02  // Gets better over time
  }
};

/**
 * Calculate recall probability based on forgetting curve (Ebbinghaus)
 * R(t) = e^(-t/S) where t = time since review, S = memory strength
 */
function calculateRecallProbability(daysSinceReview, memoryStrength, profile) {
  // Base forgetting curve
  const decayRate = daysSinceReview / Math.max(memoryStrength, 0.5);
  const baseProbability = Math.exp(-decayRate);

  // Adjust for learner profile
  const adjusted = baseProbability + profile.retentionBonus;

  // Add some randomness for inconsistent learners
  const variability = profile.variability || 0.1;
  const noise = (Math.random() - 0.5) * variability;

  return Math.max(0, Math.min(1, adjusted + noise));
}

/**
 * Calculate realistic response time based on difficulty and profile
 */
function calculateResponseTime(difficultyRating, profile, isCorrect) {
  // Base time: 2-8 seconds (harder = slower)
  const baseTime = 2000 + (difficultyRating * 6000);

  // Profile multiplier
  const profileAdjusted = baseTime * profile.responseTimeMultiplier;

  // Wrong answers take longer (hesitation)
  const hesitation = isCorrect ? 1.0 : 1.3;

  // Add realistic variation (±20%)
  const variation = 0.8 + (Math.random() * 0.4);

  return Math.floor(profileAdjusted * hesitation * variation);
}

/**
 * Get timestamp with realistic spacing
 */
function getReviewTimestamp(baseDate, mode, sessionIndex, reviewIndex) {
  const timestamp = new Date(baseDate);

  if (mode === 'fast') {
    // Fast mode: seconds apart (for quick testing)
    const secondsOffset = (sessionIndex * 100) + (reviewIndex * 5);
    timestamp.setSeconds(timestamp.getSeconds() + secondsOffset);
  } else {
    // Realistic mode: days apart
    // Sessions spread over time (not every day)
    const daysOffset = Math.floor(sessionIndex * 2.5);  // ~2.5 days between sessions
    const hoursVariation = Math.floor(Math.random() * 12) - 6;  // ±6 hours

    timestamp.setDate(timestamp.getDate() + daysOffset);
    timestamp.setHours(timestamp.getHours() + hoursVariation);

    // Add time-of-day variation (people study at different times)
    const hourOfDay = 8 + Math.floor(Math.random() * 14);  // 8am - 10pm
    timestamp.setHours(hourOfDay);
  }

  return timestamp;
}

/**
 * Calculate SM-2 interval (for baseline comparison)
 */
function calculateSM2Interval(easeFactor, repetitions, quality) {
  if (repetitions === 0) return 1;
  if (repetitions === 1) return 6;

  const previousInterval = calculateSM2Interval(easeFactor, repetitions - 1, quality);
  return Math.round(previousInterval * easeFactor);
}

/**
 * Simulate a single review with realistic parameters
 */
async function simulateReview(user, question, profile, timestamp, sessionNumber, options = {}) {
  const useML = options.useML || false;
  const mlModel = options.mlModel || null;
  const reviewHistory = question.reviewHistory || [];
  const lastReview = reviewHistory.length > 0 ? reviewHistory[reviewHistory.length - 1] : null;

  // Calculate days since last review
  const daysSinceReview = lastReview
    ? (timestamp - lastReview.timestamp) / (1000 * 60 * 60 * 24)
    : 0;

  // Calculate difficulty based on past performance
  const totalReviews = reviewHistory.length;
  const correctCount = reviewHistory.filter(r => r.recalled).length;
  const difficultyRating = totalReviews > 0 ? 1 - (correctCount / totalReviews) : 0.5;

  // Determine if answer is recalled using forgetting curve
  const recallProbability = calculateRecallProbability(
    daysSinceReview,
    question.memoryStrength || 1,
    profile
  );

  // Add improvement over time for motivated learners
  const sessionBonus = profile.improvementRate
    ? profile.improvementRate * sessionNumber
    : 0;

  const finalProbability = Math.min(1, recallProbability + sessionBonus);
  const recalled = Math.random() < finalProbability;

  // Calculate response time
  const responseTime = calculateResponseTime(difficultyRating, profile, recalled);

  // SM-2 calculations
  const quality = recalled ? 4 : 2;  // 4 = good recall, 2 = failed
  let newEaseFactor = question.easeFactor || 2.5;

  if (recalled) {
    newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  } else {
    newEaseFactor = Math.max(1.3, newEaseFactor - 0.2);
  }

  const newRepetitions = recalled ? (question.repetitions || 0) + 1 : 0;
  const baselineInterval = calculateSM2Interval(newEaseFactor, newRepetitions, quality);

  // Use ML prediction if enabled
  let mlInterval = null;
  let intervalUsed = baselineInterval;
  let algorithmUsed = 'baseline';

  if (useML && mlModel) {
    try {
      // Calculate stats for ML prediction
      const totalReviews = reviewHistory.length;
      const correctCount = reviewHistory.filter(r => r.recalled).length;
      const successRate = totalReviews > 0 ? correctCount / totalReviews : 0;

      mlInterval = mlModel.predict({
        memoryStrength: question.memoryStrength || 1,
        difficultyRating: difficultyRating,
        timeSinceLastReview: daysSinceReview,
        successRate: successRate,
        averageResponseTime: question.averageResponseTime || 2000,
        totalReviews: totalReviews,
        consecutiveCorrect: question.consecutiveCorrect || 0,
        timeOfDay: timestamp.getHours() / 24
      }, reviewHistory);

      intervalUsed = mlInterval;
      algorithmUsed = 'ml';
    } catch (error) {
      console.warn('ML prediction failed, falling back to baseline:', error.message);
      intervalUsed = baselineInterval;
      algorithmUsed = 'baseline';
    }
  }

  // Create review record
  const review = {
    timestamp,
    recalled,
    responseTime,
    intervalUsed,
    algorithmUsed,
    baselineInterval,
    mlInterval,
    difficulty: Math.round(difficultyRating * 5)  // 0-5 scale
  };

  // Update question stats
  question.reviewHistory = question.reviewHistory || [];
  question.reviewHistory.push(review);
  question.memoryStrength = intervalUsed;
  question.easeFactor = newEaseFactor;
  question.repetitions = newRepetitions;
  question.lastReviewed = timestamp;
  question.difficultyRating = difficultyRating;

  if (recalled) {
    question.timesCorrect = (question.timesCorrect || 0) + 1;
    question.consecutiveCorrect = (question.consecutiveCorrect || 0) + 1;
  } else {
    question.timesIncorrect = (question.timesIncorrect || 0) + 1;
    question.consecutiveCorrect = 0;
  }

  // Update average response time
  const allResponseTimes = question.reviewHistory.map(r => r.responseTime);
  question.averageResponseTime = Math.floor(
    allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
  );

  return { recalled, responseTime, interval: intervalUsed, difficulty: difficultyRating };
}

/**
 * Create a simulated user with a learning profile
 */
async function createSimulatedUser(profileKey, userIndex) {
  const profile = LEARNING_PROFILES[profileKey];
  const username = `sim_${profileKey.toLowerCase()}_${userIndex}`;

  // Check if user exists
  let user = await User.findOne({ username });

  if (user) {
    console.log(`  Using existing user: ${username}`);
    return { user, profile, isNew: false };
  }

  // Create new user
  const hashedPassword = await User.hashPassword('simulated');

  user = new User({
    firstName: profile.name,
    lastName: `User ${userIndex}`,
    username,
    password: hashedPassword,
    questions: [],
    settings: {
      algorithmMode: 'baseline',
      useMLAlgorithm: false
    }
  });

  // Initialize Spanish vocabulary questions
  const vocabulary = [
    { q: 'casa', a: 'house' },
    { q: 'perro', a: 'dog' },
    { q: 'gato', a: 'cat' },
    { q: 'agua', a: 'water' },
    { q: 'comida', a: 'food' },
    { q: 'libro', a: 'book' },
    { q: 'escuela', a: 'school' },
    { q: 'amigo', a: 'friend' },
    { q: 'familia', a: 'family' },
    { q: 'tiempo', a: 'time' },
    { q: 'día', a: 'day' },
    { q: 'noche', a: 'night' },
    { q: 'sol', a: 'sun' },
    { q: 'luna', a: 'moon' },
    { q: 'estrella', a: 'star' },
    { q: 'mar', a: 'sea' },
    { q: 'montaña', a: 'mountain' },
    { q: 'río', a: 'river' },
    { q: 'árbol', a: 'tree' },
    { q: 'flor', a: 'flower' },
    { q: 'mesa', a: 'table' },
    { q: 'silla', a: 'chair' },
    { q: 'puerta', a: 'door' },
    { q: 'ventana', a: 'window' },
    { q: 'calle', a: 'street' },
    { q: 'ciudad', a: 'city' },
    { q: 'país', a: 'country' },
    { q: 'mundo', a: 'world' },
    { q: 'vida', a: 'life' },
    { q: 'amor', a: 'love'
}
  ];

  user.questions = vocabulary.map((v, idx) => ({
    _id: new mongoose.Types.ObjectId(),
    question: v.q,
    answer: v.a,
    memoryStrength: 1,
    next: (idx + 1) % vocabulary.length,
    repetitions: 0,
    easeFactor: 2.5,
    difficultyRating: 0.5,
    reviewHistory: [],
    timesCorrect: 0,
    timesIncorrect: 0,
    consecutiveCorrect: 0,
    averageResponseTime: 0
  }));

  user.head = 0;

  await user.save();
  console.log(`  Created new user: ${username}`);

  return { user, profile, isNew: true };
}

/**
 * Simulate study sessions for a user
 */
async function simulateUserSessions(user, profile, numSessions, reviewsPerSession, mode, startDate, options = {}) {
  console.log(`\n📚 Simulating ${numSessions} sessions for ${user.username}...`);

  let totalReviews = 0;
  let totalCorrect = 0;

  for (let sessionIdx = 0; sessionIdx < numSessions; sessionIdx++) {
    const sessionDate = getReviewTimestamp(startDate, mode, sessionIdx, 0);

    for (let reviewIdx = 0; reviewIdx < reviewsPerSession; reviewIdx++) {
      // Select question (simple round-robin for simulation)
      const questionIndex = (totalReviews % user.questions.length);
      const question = user.questions[questionIndex];

      // Get timestamp for this review
      const reviewTimestamp = getReviewTimestamp(startDate, mode, sessionIdx, reviewIdx);

      // Simulate the review
      const result = await simulateReview(user, question, profile, reviewTimestamp, sessionIdx, options);

      if (result.recalled) totalCorrect++;
      totalReviews++;

      // Progress indicator (every 10 reviews)
      if (totalReviews % 10 === 0) {
        const accuracy = Math.round((totalCorrect / totalReviews) * 100);
        process.stdout.write(`  ${totalReviews} reviews (${accuracy}% accuracy)...\r`);
      }
    }

    // Save after each session
    await user.save();
  }

  const finalAccuracy = Math.round((totalCorrect / totalReviews) * 100);
  console.log(`  ✓ Completed ${totalReviews} reviews (${finalAccuracy}% accuracy)`);

  return { totalReviews, totalCorrect, accuracy: finalAccuracy };
}

/**
 * Main simulation function
 */
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const options = {
    users: 3,
    sessions: 10,
    reviews: 5,
    days: 30,
    mode: 'realistic',
    algorithm: 'baseline'  // 'baseline' or 'ml'
  };

  args.forEach(arg => {
    const match = arg.match(/--(\w+)=(.+)/);
    if (match) {
      const [, key, value] = match;
      options[key] = isNaN(value) ? value : parseInt(value);
    }
  });

  console.log('='.repeat(60));
  console.log('Realistic Training Data Simulation');
  console.log('='.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  Users: ${options.users}`);
  console.log(`  Sessions per user: ${options.sessions}`);
  console.log(`  Reviews per session: ${options.reviews}`);
  console.log(`  Time mode: ${options.mode}`);
  console.log(`  Time span: ${options.days} days`);
  console.log(`  Algorithm: ${options.algorithm}\n`);

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ Connected to MongoDB\n');

    // Load ML model if using ML algorithm
    let mlModel = null;
    if (options.algorithm === 'ml') {
      console.log('Loading ML model...');
      const IntervalPredictionModel = require('../ml/model');
      mlModel = new IntervalPredictionModel();
      await mlModel.load('ml/saved-model');
      console.log('✓ ML model loaded\n');
    }

    // Create users with different profiles
    const profileKeys = Object.keys(LEARNING_PROFILES);
    const users = [];

    console.log(`Creating ${options.users} simulated users...\n`);

    for (let i = 0; i < options.users; i++) {
      const profileKey = profileKeys[i % profileKeys.length];
      const userObj = await createSimulatedUser(profileKey, i + 1);
      users.push(userObj);
    }

    // Simulate sessions for each user
    const startDate = options.mode === 'fast'
      ? new Date()  // Start now for fast mode
      : new Date(Date.now() - (options.days * 24 * 60 * 60 * 1000));  // Start N days ago

    const results = [];

    for (const { user, profile } of users) {
      const result = await simulateUserSessions(
        user,
        profile,
        options.sessions,
        options.reviews,
        options.mode,
        startDate,
        {
          useML: options.algorithm === 'ml',
          mlModel: mlModel
        }
      );

      results.push({ username: user.username, ...result });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Simulation Complete!');
    console.log('='.repeat(60));
    console.log('\nResults by User:');

    results.forEach(r => {
      console.log(`  ${r.username}: ${r.totalReviews} reviews, ${r.accuracy}% accuracy`);
    });

    const totalReviews = results.reduce((sum, r) => sum + r.totalReviews, 0);
    const totalCorrect = results.reduce((sum, r) => sum + r.totalCorrect, 0);
    const avgAccuracy = Math.round((totalCorrect / totalReviews) * 100);

    console.log(`\nTotals:`);
    console.log(`  ${totalReviews} total reviews`);
    console.log(`  ${avgAccuracy}% overall accuracy`);
    console.log(`  ${results.length} users with review history`);

    console.log(`\n✓ Training data ready for extraction:`);
    console.log(`  node scripts/extract-training-data.js training-data.json`);

    await mongoose.disconnect();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  LEARNING_PROFILES,
  calculateRecallProbability,
  calculateResponseTime,
  simulateReview
};
