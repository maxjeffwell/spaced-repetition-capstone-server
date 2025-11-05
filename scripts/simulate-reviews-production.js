#!/usr/bin/env node
'use strict';

/**
 * Simulate review sessions on production to collect training data
 *
 * Usage: node scripts/simulate-reviews-production.js [number_of_reviews]
 */

const axios = require('axios');

const API_BASE = 'https://spaced-repetition-capstone-server.onrender.com/api';
const USERNAME = 'demo';
const PASSWORD = 'password';

// Spanish vocabulary answers for auto-completion
const ANSWERS = {
  'casa': 'house',
  'perro': 'dog',
  'gato': 'cat',
  'agua': 'water',
  'comida': 'food',
  'libro': 'book',
  'escuela': 'school',
  'amigo': 'friend',
  'familia': 'family',
  'tiempo': 'time',
  'día': 'day',
  'noche': 'night',
  'sol': 'sun',
  'luna': 'moon',
  'estrella': 'star',
  'mar': 'sea',
  'montaña': 'mountain',
  'río': 'river',
  'árbol': 'tree',
  'flor': 'flower',
  'mesa': 'table',
  'silla': 'chair',
  'puerta': 'door',
  'ventana': 'window',
  'calle': 'street',
  'ciudad': 'city',
  'país': 'country',
  'mundo': 'world',
  'vida': 'life',
  'amor': 'love'
};

async function login() {
  const response = await axios.post(`${API_BASE}/auth/login`, {
    username: USERNAME,
    password: PASSWORD
  });
  return response.data.authToken;
}

async function getNextQuestion(token) {
  const response = await axios.get(`${API_BASE}/questions/next`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

async function submitAnswer(token, answer, responseTime) {
  const response = await axios.post(
    `${API_BASE}/questions/answer`,
    { answer, responseTime },
    { headers: { Authorization: `Bearer ${token}` }}
  );
  return response.data;
}

async function simulateReview(token, correctRate = 0.8) {
  const questionData = await getNextQuestion(token);

  if (!questionData.question) {
    console.log('No questions available');
    return null;
  }

  const question = questionData.question;
  const correctAnswer = ANSWERS[question];

  // Simulate response time (1-5 seconds)
  const responseTime = Math.floor(Math.random() * 4000) + 1000;

  // Randomly get answer correct based on correctRate
  const isCorrect = Math.random() < correctRate;
  const answer = isCorrect ? correctAnswer : 'wrong';

  const result = await submitAnswer(token, answer, responseTime);

  return {
    question,
    correctAnswer,
    userAnswer: answer,
    correct: result.correct,
    responseTime,
    feedback: result.feedback
  };
}

async function main() {
  const numReviews = parseInt(process.argv[2]) || 10;

  console.log(`Simulating ${numReviews} review(s) on production server...\n`);
  console.log(`API: ${API_BASE}\n`);

  try {
    const token = await login();
    console.log('✓ Logged in as demo user\n');

    let totalCorrect = 0;

    for (let i = 0; i < numReviews; i++) {
      const result = await simulateReview(token, 0.75);

      if (!result) break;

      if (result.correct) totalCorrect++;

      const status = result.correct ? '✓' : '✗';
      console.log(`${i + 1}. ${status} ${result.question} → ${result.userAnswer}`);
      console.log(`   Interval: ${result.feedback.intervalUsed} days (${result.feedback.algorithmUsed})`);
      console.log(`   Stats: ${result.feedback.stats.totalReviews} reviews, ${result.feedback.stats.consecutiveCorrect} streak\n`);

      // Delay between reviews to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✓ Completed ${numReviews} reviews`);
    console.log(`  Accuracy: ${Math.round(totalCorrect / numReviews * 100)}%`);

  } catch (error) {
    console.error('Error:', error.response?.data?.message || error.message);
    process.exit(1);
  }
}

main();
