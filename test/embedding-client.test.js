'use strict';
const chai = require('chai');
const expect = chai.expect;
const { meanPoolNormalize } = require('../ml/embedding-client');

function l2(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

describe('meanPoolNormalize', function() {
  it('ignores masked (0) tokens and returns a unit vector', function() {
    // two tokens kept, one padding token masked out
    const tokenEmbeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [9, 9, 9]   // masked, must be ignored
    ];
    const attentionMask = [1, 1, 0];
    const out = meanPoolNormalize(tokenEmbeddings, attentionMask);
    expect(out).to.have.lengthOf(3);
    expect(l2(out)).to.be.closeTo(1, 1e-6);
    // mean of kept = [0.5,0.5,0] -> normalized -> [~0.707,~0.707,0]
    expect(out[0]).to.be.closeTo(out[1], 1e-6);
    expect(out[2]).to.be.closeTo(0, 1e-6);
  });

  it('handles an all-masked input without NaN', function() {
    const out = meanPoolNormalize([[1, 2, 3]], [0]);
    out.forEach(v => expect(Number.isNaN(v)).to.equal(false));
  });
});
