#!/usr/bin/env node
'use strict';

/**
 * Test ML predictions vs baseline
 *
 * Usage: node scripts/test-ml-predictions.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:8080/api';

async function login() {
  const response = await axios.post(`${API_BASE}/auth/login`, {
    username: 'demo',
    password: 'password'
  });
  return response.data.authToken;
}

async function setAlgorithmMode(token, mode) {
  const response = await axios.patch(
    `${API_BASE}/questions/settings`,
    { algorithmMode: mode },
    { headers: { Authorization: `Bearer ${token}` }}
  );
  return response.data;
}

async function runReview(token) {
  // Get next question
  const questionRes = await axios.get(`${API_BASE}/questions/next`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const question = questionRes.data.question;

  // Submit correct answer with realistic response time
  const answerRes = await axios.post(
    `${API_BASE}/questions/answer`,
    {
      answer: question === 'casa' ? 'house' :
              question === 'perro' ? 'dog' :
              question === 'gato' ? 'cat' : 'correct',
      responseTime: Math.floor(Math.random() * 3000) + 1000
    },
    { headers: { Authorization: `Bearer ${token}` }}
  );

  return answerRes.data;
}

async function getComparison(token) {
  const response = await axios.get(`${API_BASE}/questions/stats/comparison`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

async function main() {
  console.log('='.repeat(60));
  console.log('ML Prediction Testing');
  console.log('='.repeat(60));

  try {
    const token = await login();
    console.log('\n✓ Logged in\n');

    // Test baseline mode
    console.log('📊 Testing BASELINE mode...');
    await setAlgorithmMode(token, 'baseline');

    const baselineResults = [];
    for (let i = 0; i < 5; i++) {
      const result = await runReview(token);
      baselineResults.push(result.feedback);
      console.log(`   Review ${i + 1}: ${result.feedback.algorithmUsed} → ${result.feedback.intervalUsed} days`);
    }

    // Test ML mode
    console.log('\n🤖 Testing ML mode...');
    await setAlgorithmMode(token, 'ml');

    const mlResults = [];
    for (let i = 0; i < 5; i++) {
      const result = await runReview(token);
      mlResults.push(result.feedback);
      console.log(`   Review ${i + 1}: ${result.feedback.algorithmUsed} → ${result.feedback.intervalUsed} days (ML: ${result.feedback.mlInterval}, Baseline: ${result.feedback.baselineInterval})`);
    }

    // Get comparison stats
    console.log('\n📈 Getting comparison statistics...');
    const comparison = await getComparison(token);

    console.log('\nML Readiness:');
    console.log(`   Ready: ${comparison.mlReadiness.ready}`);
    console.log(`   Total Reviews: ${comparison.mlReadiness.totalReviews}`);
    console.log(`   Cards with History: ${comparison.mlReadiness.cardsWithHistory}`);

    console.log('\nAlgorithm Comparison:');
    console.log(`   Baseline: ${comparison.comparison.baseline.totalReviews} reviews, ${(comparison.comparison.baseline.retentionRate * 100).toFixed(1)}% retention`);
    console.log(`   ML: ${comparison.comparison.ml.totalReviews} reviews, ${(comparison.comparison.ml.retentionRate * 100).toFixed(1)}% retention`);

    if (comparison.comparison.ml.totalReviews > 0) {
      console.log(`\n✓ ML algorithm is working!`);
    } else {
      console.log(`\n⚠️  ML algorithm not recording reviews - check implementation`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ Testing Complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
