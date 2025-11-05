'use strict';

const bcrypt = require('bcryptjs');
const createQuestions = require('./questions');

const users = [
  {
    firstName: 'Demo',
    lastName: 'User',
    username: 'demo',
    password: '$2a$10$qLXLVD4FvqHYZLVY9XjDy.Y.qzTb5eqQGqC1nh/QqVBZQvBrUPvyS', // 'password'
    questions: createQuestions(),
    head: 0,
    settings: {
      algorithmMode: 'baseline',
      useMLAlgorithm: false,
      dailyGoal: 10
    },
    stats: {
      totalReviews: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null
    }
  }
];

module.exports = users;
