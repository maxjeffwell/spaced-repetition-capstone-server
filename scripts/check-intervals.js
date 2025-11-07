#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');

async function checkQuestion() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const demo = await User.findOne({ username: 'demo' });

  if (!demo) {
    console.log('Demo user not found');
    await mongoose.disconnect();
    return;
  }

  // Find questions with very high memory strength
  const highIntervalQuestions = demo.questions.filter(q =>
    q.memoryStrength > 100
  ).sort((a, b) => b.memoryStrength - a.memoryStrength);

  console.log('Questions with high intervals:\n');
  highIntervalQuestions.slice(0, 10).forEach(q => {
    console.log(`Question: "${q.question}"`);
    console.log(`  Memory Strength: ${q.memoryStrength} days`);
    console.log(`  Repetitions: ${q.repetitions}`);
    console.log(`  Ease Factor: ${q.easeFactor.toFixed(2)}`);
    console.log(`  Reviews: ${q.reviewHistory ? q.reviewHistory.length : 0}`);
    console.log(`  Consecutive Correct: ${q.consecutiveCorrect}`);
    console.log();
  });

  await mongoose.disconnect();
}

checkQuestion().catch(console.error);
