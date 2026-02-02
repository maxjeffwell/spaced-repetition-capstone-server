'use strict';

const express = require('express');
const mongoose = require('mongoose');

const User = require('../models/user');
const createQuestions = require('../db/seed/questions');
const logger = require('../utils/logger').child('Users');
const { validate } = require('../middleware/validation');

const router = express.Router();

router.get('/:id', (req, res, next) => {
  const id = req.params.id;
  User.findById(id, 'questions')
    .then(results => {
      res.json(results);
    })
    .catch(err => next(err));
});

// POST /users - Create new user (with Joi validation)
router.post('/', validate('userRegistration'), (req, res, next) => {
  const { username, password, firstName, lastName } = req.body;

  return User.hashPassword(password)
    .then(digest => {
      const newUser = {
        firstName,
        lastName,
        username,
        password: digest,
        questions: createQuestions(),
      };
      return User.create(newUser);
    })
    .then(result => {
      logger.info('User created', { userId: result.id, username: result.username });
      return res.status(201).location(`/api/users/${result.id}`).json(result);
    })
    .catch(err => {
      if (err.code === 11000) {
        err = new Error('The username already exists');
        err.status = 400;
      }
      next(err);
    });
});

/* ========== PATCH/UPDATE A SINGLE ITEM/particular fields ========== */

router.patch('/:id', (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('The `id` is not valid');
    err.status = 400;
    return next(err);
  }

  const toUpdate = {};
  const updateableFields = ['head', 'next', 'memoryStrength'];

  updateableFields.forEach(field => {
    if (field in req.body) {
      toUpdate[field] = req.body[field];
    }
  });

  User.findByIdAndUpdate({ _id: id }, toUpdate, { new: true })
    .then(result => {
      if (result) {
        res.json(result);
      } else {
        next();
      }
    })
    .catch(err => {
      next(err);
    });
});

module.exports = router;
