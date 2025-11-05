'use strict';

// Local definition of what a user is so we can tell Mongoose what a model is and how it should handle it

const mongoose = require('mongoose');
const { Schema } = mongoose; // Schema tells Mongoose about particular fields model will have

const bcrypt = require('bcryptjs');

// Review History Schema - tracks each answer attempt for ML training
const reviewHistorySchema = new Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  recalled: {
    type: Boolean,
    required: true
  },
  responseTime: {
    type: Number, // milliseconds
    required: true
  },
  intervalUsed: {
    type: Number, // days until next review
    required: true
  },
  algorithmUsed: {
    type: String,
    enum: ['baseline', 'ml'],
    required: true
  },
  baselineInterval: {
    type: Number, // what baseline algorithm predicted
    required: true
  },
  mlInterval: {
    type: Number, // what ML algorithm predicted (if available)
    default: null
  },
  difficulty: {
    type: Number, // user's perceived difficulty (1-5)
    default: 3
  }
}, { _id: false });

// Question Schema with ML tracking
const questionSchema = new Schema({
  _id: mongoose.Schema.Types.ObjectId,
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  },

  // Baseline SR algorithm fields
  memoryStrength: {
    type: Number,
    default: 1, // interval in days
    required: true
  },
  next: {
    type: Number, // pointer to next question in linked list
    required: true
  },

  // SM-2 specific fields
  repetitions: {
    type: Number,
    default: 0 // number of consecutive correct answers
  },
  easeFactor: {
    type: Number,
    default: 2.5 // SM-2 ease factor (1.3 - 2.5+)
  },

  // ML-enhanced fields
  difficultyRating: {
    type: Number,
    default: 0.5, // 0-1 scale
    min: 0,
    max: 1
  },
  reviewHistory: [reviewHistorySchema],

  // Statistics
  lastReviewed: {
    type: Date,
    default: null
  },
  timesCorrect: {
    type: Number,
    default: 0
  },
  timesIncorrect: {
    type: Number,
    default: 0
  },
  averageResponseTime: {
    type: Number, // milliseconds
    default: 0
  },
  consecutiveCorrect: {
    type: Number,
    default: 0
  },

  // ML predictions
  mlRecommendedInterval: {
    type: Number,
    default: null
  },
  predictedRetention: {
    type: Number, // 0-1 probability
    default: null
  }
}, { _id: false });

const userSchema = new Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  questions: [questionSchema],
  head: {
    type: Number,
    default: 0
  },

  // User settings for algorithm selection
  settings: {
    algorithmMode: {
      type: String,
      enum: ['baseline', 'ml', 'ab-test'],
      default: 'baseline'
    },
    useMLAlgorithm: {
      type: Boolean,
      default: false
    },
    dailyGoal: {
      type: Number,
      default: 10 // cards per day
    }
  },

  // User statistics
  stats: {
    totalReviews: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    incorrectAnswers: {
      type: Number,
      default: 0
    },
    currentStreak: {
      type: Number,
      default: 0
    },
    longestStreak: {
      type: Number,
      default: 0
    },
    lastStudyDate: {
      type: Date,
      default: null
    }
  }
});

userSchema.set('toObject', {
  virtuals: true,
  transform: (doc, result) => {
    delete result._id;
    delete result.__v;
    delete result.password;
  }
});

userSchema.methods.validatePassword = function (pwd) {
  const currentUser = this;
  return bcrypt.compare(pwd, currentUser.password);
};

userSchema.statics.hashPassword = function (pwd) {
  return bcrypt.hash(pwd, 10);
};

const UserClass = mongoose.model('user', userSchema);

module.exports = UserClass;
