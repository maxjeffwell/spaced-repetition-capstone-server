'use strict';
const { expect } = require('chai');
const { schemas } = require('../middleware/validation');

const opts = { abortEarly: false, stripUnknown: true };

describe('answer schema', function() {
  it('accepts a bare answer with no prediction fields', function() {
    const { error } = schemas.answer.validate({ answer: 'door', responseTime: 1500 }, opts);
    expect(error).to.equal(undefined);
  });

  it('accepts explicit nulls for predictedIntervals and predictionTime (server-side prediction clients)', function() {
    const { error, value } = schemas.answer.validate(
      { answer: 'door', responseTime: 1500, predictedIntervals: null, predictionTime: null },
      opts
    );
    expect(error, error && error.message).to.equal(undefined);
    expect(value.predictedIntervals).to.equal(null);
    expect(value.predictionTime).to.equal(null);
  });

  it('still accepts v2 client branches', function() {
    const { error } = schemas.answer.validate(
      { answer: 'door', responseTime: 1500, predictedIntervals: { ifCorrect: 9, ifIncorrect: 1 }, predictionTime: 12.5 },
      opts
    );
    expect(error).to.equal(undefined);
  });

  it('still rejects malformed predictions', function() {
    const { error } = schemas.answer.validate(
      { answer: 'door', responseTime: 1500, predictedIntervals: 'nine', predictionTime: 'fast' },
      opts
    );
    expect(error).to.not.equal(undefined);
    expect(error.message).to.include('predictedIntervals');
    expect(error.message).to.include('predictionTime');
  });
});
