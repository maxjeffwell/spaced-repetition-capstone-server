'use strict';
const chai = require('chai');
const expect = chai.expect;
const { processAnswer, sanitizeInterval } = require('../algorithms/algorithm-manager');

function makeUser() {
  const q = () => ({ _id: { toString: () => 'abc' }, question: 'puerta', answer: 'door', memoryStrength: 212, difficultyRating: 0,
    timesCorrect: 4, timesIncorrect: 0, consecutiveCorrect: 4, averageResponseTime: 2178, lastReviewed: new Date(Date.now() - 864e5),
    repetitions: 4, easeFactor: 2.5, reviewHistory: [], next: 1 });
  return { username: 'u', head: 0, questions: [q(), q(), q()], stats: { totalReviews: 0, correctAnswers: 0, currentStreak: 0 }, settings: { algorithmMode: 'ml' } };
}

describe('sanitizeInterval', function() {
  it('returns null for NaN/undefined/Infinity/non-numbers and an integer >= 1 otherwise', function() {
    [NaN, undefined, null, Infinity, -Infinity, '7', {}].forEach(v => expect(sanitizeInterval(v)).to.equal(null));
    expect(sanitizeInterval(7.4)).to.equal(7);
    expect(sanitizeInterval(0.2)).to.equal(1);
  });
});

describe('processAnswer with a model that returns a non-finite interval', function() {
  it('falls back to the SM-2 baseline and never persists an undefined intervalUsed', async function() {
    const user = makeUser();
    const model = { predict: async () => NaN };
    const { feedback } = await processAnswer(user, 0, true, 1500, model);
    expect(feedback.algorithmUsed).to.equal('baseline');
    expect(feedback.intervalUsed).to.be.a('number');
    expect(Number.isFinite(feedback.intervalUsed)).to.equal(true);
    expect(feedback.intervalUsed).to.equal(feedback.baselineInterval);
    const last = user.questions[0].reviewHistory[user.questions[0].reviewHistory.length - 1];
    expect(last.intervalUsed).to.equal(feedback.baselineInterval);
    expect(Number.isFinite(feedback.nextReviewDate.getTime())).to.equal(true);
  });
  it('uses the ML interval when the model returns a finite number', async function() {
    const user = makeUser();
    const { feedback } = await processAnswer(user, 0, true, 1500, { predict: async () => 116 });
    expect(feedback.algorithmUsed).to.equal('ml');
    expect(feedback.intervalUsed).to.equal(116);
  });
});
