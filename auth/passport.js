'use strict';

const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: LocalStrategy } = require('passport-local');
const User = require('../models/user');
const { JWT_SECRET } = require('../config');


const options = {
  secretOrKey: JWT_SECRET,
  jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('Bearer'),
  algorithms: ['HS256']
};

const jwtStrategy = new JwtStrategy(options, async (payload, done) => {
  try {
    // Security: Verify user still exists and hasn't been deleted/banned
    // This prevents deleted users from accessing the system until token expires
    const user = await User.findById(payload.user.id).select('_id username');

    if (!user) {
      return done(null, false, { message: 'User no longer exists' });
    }

    // Return the verified user from database (not just the payload)
    done(null, { id: user._id, username: user.username });
  } catch (err) {
    done(err);
  }
});

const localStrategy = new LocalStrategy((username, password, done) => {
  let user;
  User.findOne({ username })
    .then(results => {
      user = results;
      if (!user) {
        return Promise.reject({
          reason: 'LoginError',
          message: 'Incorrect username',
          location: 'username'
        });
      }
      return user.validatePassword(password);
    })
    .then(isValid => {
      if (!isValid) {
        return Promise.reject({
          reason: 'LoginError',
          message: 'Invalid password',
          location: 'password'
        });
      }
      return done(null, user);
    })
    .catch(err => {
      if (err.reason === 'LoginError') {
        return done(null, false);
      }
      return done(err);
    });
});

module.exports = { localStrategy, jwtStrategy };

