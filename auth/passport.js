const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: LocalStrategy } = require('passport-local');
const User = require('../models/user');
const JWT_SECRET = require('../config');


const options = {
    secretOrKey: JWT_SECRET,
    jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('Bearer'),
    algorithms: ['HS256']
};

const jwtStrategy = new JwtStrategy(options, (payload, done) => {
    done(null, payload.user);
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
                    reason: 'Log in error',
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

module.exports = localStrategy, jwtStrategy;

