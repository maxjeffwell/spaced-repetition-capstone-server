'use strict';

const express = require('express');
const crypto = require('crypto');
const passport = require('passport');

const User = require('../models/user');
const RefreshToken = require('../models/refresh-token');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry
} = require('../lib/auth/jwt');
const { setAuthCookies, clearAuthCookies } = require('../lib/auth/cookies');
const { requireAuth } = require('../middleware/cookie-auth');
const logger = require('../utils/logger');

const router = express.Router();

// Hash refresh token for storage (never store raw tokens)
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const localAuth = passport.authenticate('local', { session: false, failWithError: true });

// POST /auth/login - Authenticate and set httpOnly cookies
router.post('/auth/login', localAuth, async (req, res) => {
  try {
    const user = req.user;

    // Generate dual tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token hash in database for revocation capability
    await RefreshToken.create({
      userId: user._id || user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: getRefreshTokenExpiry()
    });

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Return user info (client can't decode httpOnly cookie)
    res.json({
      user: {
        id: user._id || user.id,
        username: user.username
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/refresh - Refresh access token using refresh cookie
router.post('/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token signature and expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid refresh token', code: error.code });
    }

    // Check token exists in database (not revoked)
    const validToken = await RefreshToken.findOne({
      userId: decoded.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: { $gt: new Date() }
    });

    if (!validToken) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    // Get fresh user data
    const user = await User.findById(decoded.id).select('_id username');

    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token only (refresh token stays the same)
    const accessToken = generateAccessToken(user);

    // Update only the access token cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/'
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Refresh error', { error: error.message });
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// POST /auth/logout - Clear cookies and revoke refresh tokens
router.post('/auth/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        // Delete all refresh tokens for this user (logout from all devices)
        await RefreshToken.deleteMany({ userId: decoded.id });
      } catch (e) {
        // Token invalid, still clear cookies
      }
    }

    clearAuthCookies(res);
    res.json({ success: true });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    clearAuthCookies(res);
    res.json({ success: true });
  }
});

// GET /auth/me - Get current user info (protected)
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('_id username firstName lastName');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    logger.error('Get user error', { error: error.message });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
