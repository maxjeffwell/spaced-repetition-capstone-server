'use strict';

const express = require('express');

const User = require('../models/user');
const Question = require('../models/question');

const router = express.Router();

router.get('/:id', (req, res, next) => {
    let id = req.params.id;
    User.findById(id, 'questions')
        .then(results => {
            res.json(results);
        })
        .catch(err => next(err));
});

router.post('/', (req, res, next) => {

  /***** Never trust users - validate input *****/
  const requiredFields = ['username', 'password'];
  const missingField = requiredFields.find(field => !(field in req.body));

  if (missingField) {
    const err = new Error(`Missing '${missingField}' in request body`);
    err.status = 422;
    return next(err);
  }

  const stringFields = ['firstName', 'lastName', 'username', 'password'];
  const nonStringField = stringFields.find(
    field => field in req.body && typeof req.body[field] !== 'string'
  );

  if (nonStringField) {
    const err = new Error(`Field: '${nonStringField}' must be type String`);
    err.status = 422;
    return next(err);
  }

  const explicitlyTrimmedFields = ['username', 'password'];
  const nonTrimmedField = explicitlyTrimmedFields.find(
    field => req.body[field].trim() !== req.body[field]
  );

  if (nonTrimmedField) {
    const err = new Error(`Field: '${nonTrimmedField}' cannot start or end with whitespace`);
    err.status = 422;
    return next(err);
  }

  const sizedFields = {
    username: { min: 1 },
    password: { min: 10, max: 72 }
  };

  const tooSmallField = Object.keys(sizedFields).find(
    field => 'min' in sizedFields[field] &&
            req.body[field].trim().length < sizedFields[field].min
  );
  if (tooSmallField) {
    const min = sizedFields[tooSmallField].min;
    const err = new Error(`Field: '${tooSmallField}' must be at least ${min} characters long`);
    err.status = 422;
    return next(err);
  }

  const tooLargeField = Object.keys(sizedFields).find(
    field => 'max' in sizedFields[field] &&
            req.body[field].trim().length > sizedFields[field].max
  );

  if (tooLargeField) {
    const max = sizedFields[tooLargeField].max;
    const err = new Error(`Field: '${tooLargeField}' must be at most ${max} characters long`);
    err.status = 422;
    return next(err);
  }

  // Username and password were validated as pre-trimmed

    let { username, password, firstName, lastName = '' } = req.body;
  firstName = firstName.trim();
  lastName = lastName.trim();


  return Promise.all([User.hashPassword(password), Question.find()])
    .then(([digest, results]) => {
      const newUser = {
        firstName,
        lastName,
        username,
        password: digest,
        questions: results,
      };
      return User.create(newUser);
    })
    .then(result => {
      console.log(result);
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

    const toUpdate = {};
    const updateableFields = [ head, next, memoryStrength ];

    updateableFields.forEach(field => {
        if (field in req.body) {
            toUpdate[field] = req.body[field];
        }
    });

    /***** Never trust users - validate input *****/

    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('The `id` is not valid');
        err.status = 400;
        return next(err);
    }

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
