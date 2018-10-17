'use strict';
const express = require('express');
const mongoose = require ('mongoose');

const Question = require('../models/question');

const router = express.Router();

/* ========== GET/READ ALL ITEMS ========== */
router.get('/', (req, res, next) => {

  return Question.find()
    .then(results => {
      res.json(results);
    })
    .catch(err => {
      next(err);
    });
});

/* ========== GET/READ A SINGLE ITEM ========== */
router.get('/:id', (req, res, next) => {
  const { id } = req.params;
  // const userId = req.user.id;

  /***** Never trust users - validate input *****/
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('The `id` is not valid');
    err.status = 400;
    return next(err);
  }

  Question.findById({ _id: id /*userId*/ })
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