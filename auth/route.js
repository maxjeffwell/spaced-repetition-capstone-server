const Authentication = require('./authentication');
const passport = require('passport');

const User = require('../models/user');

const requireAuth = passport.authenticate('jwt', { session: false });

const requireSignin = passport.authenticate('local', { session: false });

module.exports = function(app) {
    app.post('/auth/login', requireSignIn, Authentication.signin);

    app.post('/users', Authentication.signup);
}



