#!/usr/bin/env node
'use strict';

/**
 * Fix corrupted questions with unrealistic memoryStrength values
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');

async function fixCorruptedQuestions() {
  console.log('🔧 Fixing corrupted questions...\n');

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  // Find all users
  const users = await User.find({});
  console.log(`Found ${users.length} users\n`);

  let totalFixed = 0;

  for (const user of users) {
    let userFixed = 0;

    for (const question of user.questions) {
      // Check for unrealistic values (> 365 days = 1 year)
      if (question.memoryStrength > 365) {
        console.log(`  Fixing question "${question.question}"`);
        console.log(`    memoryStrength: ${question.memoryStrength} → 1`);

        question.memoryStrength = 1;
        question.mlRecommendedInterval = null;
        userFixed++;
        totalFixed++;
      }

      if (question.mlRecommendedInterval > 365) {
        console.log(`    mlRecommendedInterval: ${question.mlRecommendedInterval} → null`);
        question.mlRecommendedInterval = null;
      }
    }

    if (userFixed > 0) {
      await user.save();
      console.log(`  ✓ Fixed ${userFixed} questions for ${user.username}\n`);
    }
  }

  console.log(`\n✓ Fixed ${totalFixed} corrupted questions total`);

  await mongoose.disconnect();
}

fixCorruptedQuestions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
