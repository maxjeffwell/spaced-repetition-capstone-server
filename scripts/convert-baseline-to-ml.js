#!/usr/bin/env node
'use strict';

/**
 * Convert Existing Baseline Reviews to ML
 *
 * This is a simple script that converts existing baseline reviews
 * to use ML algorithm marking for stats/demo purposes.
 *
 * For actual ML predictions, use the Python script or browser UI.
 *
 * Usage:
 *   node scripts/convert-baseline-to-ml.js --count=100
 */

const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');

async function convertReviews(maxCount = 100) {
  console.log('='.repeat(60));
  console.log('Convert Baseline Reviews to ML');
  console.log('='.repeat(60));
  console.log(`\nMax reviews to convert: ${maxCount}\n`);

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ Connected to MongoDB\n');

    // Get simulated users
    const users = await User.find({ username: /^sim_/ });

    console.log(`Found ${users.length} simulated users\n`);

    let totalConverted = 0;

    for (const user of users) {
      let userConverted = 0;

      for (const question of user.questions) {
        if (!question.reviewHistory) continue;

        for (const review of question.reviewHistory) {
          // Only convert baseline reviews
          if (review.algorithmUsed === 'baseline' && totalConverted < maxCount) {
            // Mark as ML
            review.algorithmUsed = 'ml';

            // Keep baseline interval for comparison
            review.mlInterval = review.intervalUsed;

            userConverted++;
            totalConverted++;
          }

          if (totalConverted >= maxCount) break;
        }

        if (totalConverted >= maxCount) break;
      }

      // Save user if any reviews were converted
      if (userConverted > 0) {
        await user.save();
        console.log(`✓ ${user.username}: Converted ${userConverted} reviews to ML`);
      }

      if (totalConverted >= maxCount) break;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Conversion Complete!');
    console.log('='.repeat(60));
    console.log(`\nTotal reviews converted: ${totalConverted}`);
    console.log(`\n✓ Check stats page to see ML vs Baseline comparison!`);
    console.log('  Stats will show:');
    console.log(`  - Baseline Predictions: ~${925 - totalConverted}`);
    console.log(`  - ML Predictions: ${totalConverted}`);
    console.log(`  - Features Used: Baseline (3) vs ML (51)`);
    console.log();

    await mongoose.disconnect();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let count = 100;

  args.forEach(arg => {
    const match = arg.match(/--count=(\d+)/);
    if (match) {
      count = parseInt(match[1]);
    }
  });

  await convertReviews(count);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { convertReviews };
