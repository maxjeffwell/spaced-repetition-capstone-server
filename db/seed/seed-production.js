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
    console.log('Checking if demo user exists...');
    return User.findOne({ username: 'demo' });
  })
  .then(existingUser => {
    if (existingUser) {
      console.log('Demo user already exists, deleting old version...');
      return User.deleteOne({ username: 'demo' });
    } else {
      console.log('Demo user does not exist');
      return null;
    }
  })
  .then(() => {
    console.log('Inserting demo user with questions...');
    return User.insertMany(seedUsers);
  })
  .then(results => {
    console.log(`Inserted ${results.length} users`);
    results.forEach(user => {
      console.log(`  - ${user.username} with ${user.questions.length} questions`);
    });
    console.log('Seed complete!');
    console.log('\nYou can now log in with:');
    console.log('  Username: demo');
    console.log('  Password: password');
  })
  .then(() => mongoose.disconnect())
  .catch(err => {
    console.error('Error seeding database:', err);
    return mongoose.disconnect();
  });
