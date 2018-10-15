// Local definition of what a user is so we can tell Mongoose what a model is and how it should handle it

const mongoose = require('mongoose');
const { Schema } = mongoose; // Schema tells Mongoose about particular fields model will have

const userSchema = new Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
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

})

const UserClass = mongoose.model('user', userSchema);

module.exports = UserClass;
