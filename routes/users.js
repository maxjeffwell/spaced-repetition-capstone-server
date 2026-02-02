'use strict';

const express = require('express');
const mongoose = require('mongoose');

const User = require('../models/user');
const createQuestions = require('../db/seed/questions');
const logger = require('../utils/logger').child('Users');
const { validate } = require('../middleware/validation');
const { NotFoundError, BadRequestError, ConflictError } = require('../utils/errors');

const router = express.Router();

router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const results = await User.findById(id, 'questions');
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// POST /users - Create new user (with Joi validation)
router.post('/', validate('userRegistration'), async (req, res, next) => {
  try {
    const { username, password, firstName, lastName } = req.body;
    const digest = await User.hashPassword(password);

    const newUser = {
      firstName,
      lastName,
      username,
      password: digest,
      questions: createQuestions(),
    };

    const result = await User.create(newUser);
    logger.info('User created', { userId: result.id, username: result.username });
    res.status(201).location(`/api/users/${result.id}`).json(result);
  } catch (err) {
    if (err.code === 11000) {
      return next(new ConflictError('The username already exists'));
    }
    next(err);
  }
});

/* ========== PATCH/UPDATE A SINGLE ITEM/particular fields ========== */

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('The `id` is not valid');
    }

    const toUpdate = {};
    const updateableFields = ['head', 'next', 'memoryStrength'];

    updateableFields.forEach(field => {
      if (field in req.body) {
        toUpdate[field] = req.body[field];
      }
    });

    const result = await User.findByIdAndUpdate({ _id: id }, toUpdate, { new: true });

    if (!result) {
      throw new NotFoundError('User not found');
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
