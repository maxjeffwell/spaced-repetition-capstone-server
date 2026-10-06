'use strict';

const Joi = require('joi');

/**
 * Validation schemas for API endpoints
 */
const schemas = {
  // User registration
  userRegistration: Joi.object({
    firstName: Joi.string().trim().min(1).max(50).required(),
    lastName: Joi.string().trim().min(1).max(50).required(),
    username: Joi.string().trim().min(1).max(50).pattern(/^\S+$/).required()
      .messages({ 'string.pattern.base': 'Username cannot contain spaces' }),
    password: Joi.string().min(8).max(72).required()
      .messages({ 'string.min': 'Password must be at least 8 characters' })
  }),

  // Login
  login: Joi.object({
    username: Joi.string().trim().required(),
    password: Joi.string().required()
  }),

  // Answer submission
  answer: Joi.object({
    answer: Joi.string().trim().max(1000).required(),
    responseTime: Joi.number().integer().min(0).max(300000).required()
      .messages({ 'number.max': 'Response time cannot exceed 5 minutes' }),
    // Legacy (v1 clients): a single pre-grading prediction. Accepted but no longer
    // applied -- it cannot depend on whether the answer was right.
    predictedInterval: Joi.number().min(1).max(365).optional(),
    // v2 clients: one prediction per possible outcome; the server applies the one
    // that matches the graded answer.
    predictedIntervals: Joi.object({
      ifCorrect: Joi.number().min(1).max(365).required(),
      ifIncorrect: Joi.number().min(1).max(365).required()
    }).optional(),
    predictionTime: Joi.number().min(0).max(10000).optional()
  }),

  // User settings update
  userSettings: Joi.object({
    algorithmMode: Joi.string().valid('baseline', 'ml', 'ab-test').optional(),
    useMLAlgorithm: Joi.boolean().optional(),
    dailyGoal: Joi.number().integer().min(1).max(100).optional()
  })
};

/**
 * Validation middleware factory
 * @param {string} schemaName - Name of the schema to use
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
function validate(schemaName, property = 'body') {
  const schema = schemas[schemaName];

  if (!schema) {
    throw new Error(`Validation schema '${schemaName}' not found`);
  }

  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      const err = new Error(errorMessages.join('; '));
      err.status = 422;
      err.errors = error.details;
      return next(err);
    }

    // Replace request data with validated/sanitized data
    req[property] = value;
    next();
  };
}

/**
 * Validate with custom schema (for one-off validations)
 * @param {Joi.Schema} schema - Joi schema
 * @param {string} property - Request property to validate
 * @returns {Function} Express middleware
 */
function validateWith(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      const err = new Error(errorMessages.join('; '));
      err.status = 422;
      err.errors = error.details;
      return next(err);
    }

    req[property] = value;
    next();
  };
}

module.exports = {
  schemas,
  validate,
  validateWith,
  Joi // Export Joi for custom schemas
};
