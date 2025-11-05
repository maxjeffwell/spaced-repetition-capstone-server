'use strict';

const mongoose = require('mongoose');
const { MONGODB_URI } = require('../../config');

const User = require('../../models/user');
const seedUsers = require('./users');

console.log('Connecting to MongoDB...');
console.log(`MongoDB URI: ${MONGODB_URI}`);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false
})
  .then(() => {
    console.log('Connected to MongoDB');
    console.log('Dropping database...');
    return mongoose.connection.db.dropDatabase();
  })
  .then(() => {
    console.log('Database dropped');
    console.log('Seeding users...');
    return User.insertMany(seedUsers);
  })
  .then(results => {
    console.log(`Inserted ${results.length} users`);
    results.forEach(user => {
      console.log(`  - ${user.username} with ${user.questions.length} questions`);
    });
    console.log('Seed complete!');
  })
  .then(() => mongoose.disconnect())
  .catch(err => {
    console.error('Error seeding database:', err);
    return mongoose.disconnect();
  });
