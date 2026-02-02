'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const refreshTokenSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
    // TTL index defined below handles indexing
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// TTL index to auto-delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient lookups
refreshTokenSchema.index({ userId: 1, tokenHash: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
