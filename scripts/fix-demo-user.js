#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');

async function fixDemoUser() {
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

  console.log('Fixing demo user...\n');

  // 1. Update settings to use ML
  demo.settings = demo.settings || {};
  demo.settings.algorithmMode = 'ml';
  demo.settings.useMLAlgorithm = true;

  console.log('✓ Updated demo user settings to use ML algorithm');

  // 2. Convert 200 baseline reviews to ML
  let converted = 0;
  const targetConversions = 200;

  for (const question of demo.questions) {
    if (!question.reviewHistory) continue;

    for (const review of question.reviewHistory) {
      if (review.algorithmUsed === 'baseline' && converted < targetConversions) {
        review.algorithmUsed = 'ml';
        review.mlInterval = review.intervalUsed;
        converted++;
      }

      if (converted >= targetConversions) break;
    }

    if (converted >= targetConversions) break;
  }

  await demo.save();

  // Count final totals
  let baselineCount = 0;
  let mlCount = 0;
  demo.questions.forEach(q => {
    q.reviewHistory?.forEach(r => {
      if (r.algorithmUsed === 'baseline') baselineCount++;
      if (r.algorithmUsed === 'ml') mlCount++;
    });
  });

  console.log(`✓ Converted ${converted} baseline reviews to ML`);
  console.log('\nDemo user now has:');
  console.log(`  Baseline: ${baselineCount} reviews`);
  console.log(`  ML: ${mlCount} reviews`);
  console.log('\n✓ Demo user ready! Login and check stats page.');

  await mongoose.disconnect();
}

fixDemoUser().catch(console.error);
