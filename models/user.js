// Local definition of what a user is so we can tell Mongoose what a model is and how it should handle it

const mongoose = require('mongoose');
const { Schema } = mongoose; // Schema tells Mongoose about particular fields model will have

const bcrypt = require('bcryptjs');

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
    }
});


userSchema.pre('save', function (next) {
    const user = this; // get access to user model; user is an instance of the user model at this point

    // generate a salt (takes time, so then run callback)

    bcrypt.genSalt(10, function (err, salt) {
        if (err) {
            return next(err);
        }

        // hash password using the salt

        bcrypt.hash(user.password, salt, function (err, hash) {
            if (err) {
                return next(err);
            }

            // overwrite plain text password with encrypted password

            user.password = hash;
            next();
        });
    });
});

userSchema.methods.comparePassword = function(candidatePassword, callback) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) {
            return callback(err);
        } callback(null, isMatch);
    });
}

const UserClass = mongoose.model('user', userSchema);

module.exports = UserClass;
