'use strict';

const { NODE_ENV } = require('../../config');
const isProduction = NODE_ENV === 'production';

const ACCESS_TOKEN_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/'
};

const REFRESH_TOKEN_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/'
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, ACCESS_TOKEN_OPTIONS);
  res.cookie('refreshToken', refreshToken, REFRESH_TOKEN_OPTIONS);
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  ACCESS_TOKEN_OPTIONS,
  REFRESH_TOKEN_OPTIONS
};
