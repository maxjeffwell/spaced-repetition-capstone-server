'use strict';

const { verifyAccessToken } = require('../lib/auth/jwt');
const User = require('../models/user');

async function requireAuth(req, res, next) {
  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = verifyAccessToken(token);

    // Verify user still exists (security check)
    const user = await User.findById(decoded.user.id).select('_id username');

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = { id: user._id, username: user.username };
    next();
  } catch (error) {
    if (error.code === 'TOKEN_EXPIRED') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
