#!/usr/bin/env node
'use strict';

/**
 * Extract training data from review history
 *
 * Usage: node scripts/extract-training-data.js [output_file.json]
 */

const mongoose = require('mongoose');
const fs = require('fs');
const { MONGODB_URI } = require('../config');
const User = require('../models/user');
const { createFeatureVector } = require('../utils/question-helpers');

async function extractTrainingData() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  console.log('Extracting training data...\n');

  const users = await User.find({});
  const trainingData = [];
  let totalReviews = 0;

  users.forEach(user => {
    user.questions.forEach(question => {
      if (!question.reviewHistory || question.reviewHistory.length < 2) {
        return; // Need at least 2 reviews to create training sample
      }

      // For each review (except the last), create a training sample
      for (let i = 0; i < question.reviewHistory.length - 1; i++) {
        const currentReview = question.reviewHistory[i];
        const nextReview = question.reviewHistory[i + 1];

        // Calculate days between reviews
        const timeDiff = nextReview.timestamp - currentReview.timestamp;
        const daysBetween = timeDiff / (1000 * 60 * 60 * 24);

        // Calculate stats at time of review
        const reviewsUpToNow = question.reviewHistory.slice(0, i + 1);
        const correctUpToNow = reviewsUpToNow.filter(r => r.recalled).length;
        const successRate = correctUpToNow / reviewsUpToNow.length;

        // Feature vector at time of current review
        const features = {
          memoryStrength: currentReview.intervalUsed || 1,
          difficultyRating: 1 - successRate,
          timeSinceLastReview: i > 0 ?
            (currentReview.timestamp - reviewsUpToNow[i - 1].timestamp) / (1000 * 60 * 60 * 24) : 0,
          successRate: successRate,
          averageResponseTime: reviewsUpToNow.reduce((sum, r) => sum + r.responseTime, 0) / reviewsUpToNow.length,
          totalReviews: reviewsUpToNow.length,
          consecutiveCorrect: currentReview.recalled ?
            (reviewsUpToNow.slice(0, i).reverse().findIndex(r => !r.recalled) + 1) : 0,
          timeOfDay: new Date(currentReview.timestamp).getHours() / 24
        };

        // Label: Was next review successful? And what interval would have been optimal?
        const label = {
          recalled: nextReview.recalled,
          actualInterval: daysBetween,
          optimalInterval: nextReview.recalled ?
            Math.ceil(daysBetween * 1.2) : // Could have waited longer
            Math.max(1, Math.floor(daysBetween * 0.7)) // Should have reviewed sooner
        };

        trainingData.push({
          features,
          label,
          metadata: {
            userId: user.id,
            question: question.question,
            reviewIndex: i,
            timestamp: currentReview.timestamp
          }
        });

        totalReviews++;
      }
    });
  });

  console.log(`✓ Extracted ${trainingData.length} training samples`);
  console.log(`  From ${totalReviews} total reviews`);
  console.log(`  Across ${users.length} user(s)\n`);

  // Calculate statistics
  const recalled = trainingData.filter(d => d.label.recalled).length;
  const retentionRate = recalled / trainingData.length;

  console.log(`Training Data Statistics:`);
  console.log(`  Retention Rate: ${(retentionRate * 100).toFixed(1)}%`);
  console.log(`  Average Interval: ${(trainingData.reduce((sum, d) => sum + d.label.actualInterval, 0) / trainingData.length).toFixed(2)} days`);
  console.log(`  Average Response Time: ${(trainingData.reduce((sum, d) => sum + d.features.averageResponseTime, 0) / trainingData.length).toFixed(0)}ms\n`);

  return trainingData;
}

async function main() {
  const outputFile = process.argv[2] || 'training-data.json';

  try {
    const trainingData = await extractTrainingData();

    if (trainingData.length < 50) {
      console.log(`⚠️  Warning: Only ${trainingData.length} training samples available.`);
      console.log(`   Recommended minimum: 100 samples for effective ML training.\n`);
    }

    // Save to file
    fs.writeFileSync(outputFile, JSON.stringify(trainingData, null, 2));
    console.log(`✓ Saved training data to ${outputFile}`);

    await mongoose.disconnect();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractTrainingData };
