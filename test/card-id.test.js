'use strict';
const chai = require('chai');
const expect = chai.expect;
const { cardPointId } = require('../ml/card-id');

describe('cardPointId', function() {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('produces a valid v5 UUID', function() {
    expect(cardPointId('507f1f77bcf86cd799439011')).to.match(UUID_RE);
  });
  it('is deterministic for the same id', function() {
    expect(cardPointId('507f1f77bcf86cd799439011'))
      .to.equal(cardPointId('507f1f77bcf86cd799439011'));
  });
  it('differs for different ids', function() {
    expect(cardPointId('507f1f77bcf86cd799439011'))
      .to.not.equal(cardPointId('507f1f77bcf86cd799439012'));
  });
  it('accepts ObjectId-like objects via String()', function() {
    const fake = { toString: () => '507f1f77bcf86cd799439011' };
    expect(cardPointId(fake)).to.equal(cardPointId('507f1f77bcf86cd799439011'));
  });
});
