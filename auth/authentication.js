const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { JWT_SECRET } = require('../config');

function userToken(user) {
    const timestamp = new Date().getTime();
    return jwt.sign({ sub: user.id, iat: timestamp }, JWT_SECRET);
}

exports.signin = function(req, res) {
    res.json({ token: userToken(req.user) });
}

exports.signup = function(req, res, next) {
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password || !firstName || !lastName) {
        return res.status(422).send({ error: "You must provide your first name, last name, username, and password to register" });
    }

    User.findOne({ username: username }, function(err, existingUser) {
        console.log(err, existingUser);
        if (err) {
            return next(err);
        }
        if (existingUser) {
            return res.status(422)
                .send({ error: 'This username is already in use'});
        }
        const newUser = new User({
        firstName: firstName,
        lastName: lastName,
        username: username,
        password: password
    });

        newUser.save(function (err) {
            if (err) {
                return next(err);
            }
            res.json({ token: userToken(newUser) });
        });
    });
}
