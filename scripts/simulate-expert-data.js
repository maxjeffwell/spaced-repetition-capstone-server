#!/usr/bin/env node
'use strict';

/**
 * Generate EXPERT training data with proper time intervals to fix the "1-day interval" bias.
 *
 * This script simulates:
 * 1. Long-term usage (365+ days)
 * 2. High retention rates (90%+)
 * 3. Correctly increasing intervals (1 -> 3 -> 7 -> 16 -> 35 -> 70...)
 *
 * Usage:
 *   node scripts/simulate-expert-data.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const User = require('../models/user');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spaced-repetition';

// Profile for an "Expert" user who learns well
const EXPERT_PROFILE = {
    name: 'Expert User',
    baseAccuracy: 0.95,
    responseTimeMultiplier: 0.5, // Fast answers
    retentionBonus: 0.30,         // Strong memory
    improvementRate: 0.05
};

// Vocabulary list
const VOCABULARY = [
    { q: 'casa', a: 'house' }, { q: 'perro', a: 'dog' }, { q: 'gato', a: 'cat' },
    { q: 'agua', a: 'water' }, { q: 'comida', a: 'food' }, { q: 'libro', a: 'book' },
    { q: 'escuela', a: 'school' }, { q: 'amigo', a: 'friend' }, { q: 'familia', a: 'family' },
    { q: 'tiempo', a: 'time' }, { q: 'día', a: 'day' }, { q: 'noche', a: 'night' },
    { q: 'sol', a: 'sun' }, { q: 'luna', a: 'moon' }, { q: 'estrella', a: 'star' },
    { q: 'mar', a: 'sea' }, { q: 'montaña', a: 'mountain' }, { q: 'río', a: 'river' },
    { q: 'árbol', a: 'tree' }, { q: 'flor', a: 'flower' }
];

/**
 * Calculate response time (fast for experts)
 */
function calculateResponseTime(difficulty, isCorrect) {
    const baseTime = 1000 + (difficulty * 2000); // 1-3 seconds
    const hesitation = isCorrect ? 1.0 : 1.5;
    const variation = 0.9 + (Math.random() * 0.2);
    return Math.floor(baseTime * hesitation * variation);
}

/**
 * Custom simulation of an IDEAL spaced repetition schedule
 * We force the simulation to follow a "perfect" path to generate the training signal we want.
 */
async function simulateIdealPath(user, numCards = 20, daysHistory = 365) {
    console.log(`\n📚 Simulating IDEAL expert path for ${user.username}...`);

    let totalReviews = 0;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysHistory);

    // Initialize cards
    user.questions = VOCABULARY.slice(0, numCards).map((v, idx) => ({
        _id: new mongoose.Types.ObjectId(),
        question: v.q,
        answer: v.a,
        memoryStrength: 1,
        next: (idx + 1) % numCards,
        repetitions: 0,
        easeFactor: 2.5,
        difficultyRating: 0.3, // Starts somewhat easy
        reviewHistory: [],
        timesCorrect: 0,
        timesIncorrect: 0,
        consecutiveCorrect: 0,
        averageResponseTime: 0
    }));

    // Iterate through each card and simulate its history
    for (let i = 0; i < user.questions.length; i++) {
        const question = user.questions[i];
        let currentDate = new Date(startDate);
        
        // Stagger start dates slightly so not all cards start on day 0
        currentDate.setDate(currentDate.getDate() + (i % 5));

        // The ideal interval sequence we WANT the model to learn
        // 1 -> 3 -> 7 -> 15 -> 30 -> 60 -> 120 -> 240
        const idealIntervals = [1, 3, 7, 15, 30, 60, 120, 240];
        let step = 0;

        while (currentDate < new Date() && step < idealIntervals.length) {
            const currentInterval = idealIntervals[step];
            
            // Simulate 95% chance of getting it right (Expert)
            const isCorrect = Math.random() < 0.95;
            
            // If they fail, we don't advance the interval step (reset to 0 in real app, but here we just retry soon)
            if (!isCorrect) {
                step = 0; // Reset progress
            }

            const responseTime = calculateResponseTime(question.difficultyRating, isCorrect);
            
            // SM-2 style ease update
            let quality = isCorrect ? (responseTime < 2000 ? 5 : 4) : 2;
            
            const review = {
                timestamp: new Date(currentDate),
                recalled: isCorrect,
                responseTime: responseTime,
                intervalUsed: currentInterval, // Crucial: This becomes the label y
                algorithmUsed: 'baseline',
                baselineInterval: currentInterval,
                difficulty: isCorrect ? 3 : 5
            };

            // Add to history
            question.reviewHistory.push(review);
            
            // Update question stats
            question.lastReviewed = review.timestamp;
            question.memoryStrength = currentInterval; // This becomes a feature for NEXT prediction
            
            if (isCorrect) {
                question.timesCorrect++;
                question.consecutiveCorrect++;
                question.difficultyRating = Math.max(0.1, question.difficultyRating - 0.05);
                
                // Prepare date for NEXT review
                const nextInterval = idealIntervals[step + 1] || (currentInterval * 2.5);
                currentDate.setDate(currentDate.getDate() + nextInterval);
                step++;
            } else {
                question.timesIncorrect++;
                question.consecutiveCorrect = 0;
                question.difficultyRating = Math.min(1.0, question.difficultyRating + 0.2);
                currentDate.setDate(currentDate.getDate() + 1); // Retry next day
            }
            
            // Update average response time
            const allTimes = question.reviewHistory.map(r => r.responseTime);
            question.averageResponseTime = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;

            totalReviews++;
        }
    }

    await user.save();
    console.log(`  ✓ Generated ${totalReviews} expert reviews for ${user.username}`);
    return totalReviews;
}

async function main() {
    console.log('='.repeat(60));
    console.log('EXPERT Training Data Generator');
    console.log('='.repeat(60));
    console.log('Generating data to fix "1-day interval" bias...\n');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        // Create 50 expert users to overwhelm bias
        const NUM_EXPERTS = 50;
        let grandTotalReviews = 0;

        for (let i = 1; i <= NUM_EXPERTS; i++) {
            const username = `expert_user_${i}`;
            
            // Delete if exists to ensure fresh perfect data
            await User.deleteOne({ username });

            const hashedPassword = await User.hashPassword('password123');
            const user = new User({
                firstName: 'Expert',
                lastName: `${i}`,
                username,
                password: hashedPassword,
                questions: [],
                settings: { algorithmMode: 'baseline' }
            });

            grandTotalReviews += await simulateIdealPath(user);
        }

        console.log('\n' + '='.repeat(60));
        console.log('Simulation Complete!');
        console.log('='.repeat(60));
        console.log(`\nGenerated ${grandTotalReviews} high-quality expert reviews across ${NUM_EXPERTS} users.`);
        console.log(`\nNEXT STEPS:`);
        console.log(`1. Extract this new data:`);
        console.log(`   node scripts/extract-training-data.js`);
        console.log(`2. Train the model:`);
        console.log(`   python3 scripts/train-model-advanced.py`);
        
        await mongoose.disconnect();

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
