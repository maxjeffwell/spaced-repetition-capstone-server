const mongoose = require('mongoose');

const { MONGODB_URI } = require('../config');

const User = require('../models/user');

const seedUsers = require('../db/seed/users');

console.log(`Connecting to mongodb at ${MONGODB_URI}`);
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.info('Dropping Database');
        return mongoose.connection.db.dropDatabase();
    })
    .then(() => {
        console.info('Seeding Database');
        return Promise.all([
            User.insertMany(seedUsers),
            User.createIndexes(),
        ]);
    })
    .then(() => {
        console.info('Disconnecting');
        return mongoose.disconnect();
    })
    .catch(err => {
        console.error(err);
        return mongoose.disconnect();
    });
