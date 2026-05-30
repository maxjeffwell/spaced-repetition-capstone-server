'use strict';
const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const { app } = require('../index');
const User = require('../models/user');
const { generateAccessToken } = require('../lib/auth/jwt');
const qdrantService = require('../ml/qdrant-service');
const { isDatabaseConnected, TEST_TIMEOUT } = require('./setup.test');

const expect = chai.expect;
chai.use(chaiHttp);

describe('GET /api/questions/:id/related', function() {
  this.timeout(TEST_TIMEOUT);

  let userId, token, cardId;
  const savedEnabled = qdrantService.enabled;
  let savedRelated;

  before(async function() {
    if (!isDatabaseConnected()) this.skip();
    const password = await User.hashPassword('testpassword123');
    const user = await User.create({
      firstName: 'Rel', lastName: 'Tester',
      username: `reltest_${Date.now()}`,
      password, head: 0,
      questions: [
        { _id: new mongoose.Types.ObjectId(), question: 'casa', answer: 'house', next: 1 },
        { _id: new mongoose.Types.ObjectId(), question: 'perro', answer: 'dog', next: 0 }
      ]
    });
    userId = user.id;
    cardId = user.questions[0]._id.toString();
    // Mint a real access token (correct issuer/audience + user.id claim) and
    // send it as the httpOnly cookie the middleware actually reads.
    token = generateAccessToken(user);
  });

  after(async function() {
    qdrantService.enabled = savedEnabled;
    if (savedRelated) qdrantService.related = savedRelated;
    if (userId) await User.findByIdAndDelete(userId);
  });

  it('401 without auth', function() {
    return chai.request(app).get(`/api/questions/${cardId}/related`)
      .then(res => expect(res).to.have.status(401));
  });

  it('returns [] when the feature is disabled', function() {
    qdrantService.enabled = false;
    return chai.request(app)
      .get(`/api/questions/${cardId}/related`)
      .set('Cookie', `accessToken=${token}`)
      .then(res => {
        expect(res).to.have.status(200);
        expect(res.body.related).to.deep.equal([]);
      });
  });

  it('404 for a card not in the user deck', function() {
    qdrantService.enabled = true;
    const ghost = new mongoose.Types.ObjectId().toString();
    return chai.request(app)
      .get(`/api/questions/${ghost}/related`)
      .set('Cookie', `accessToken=${token}`)
      .then(res => expect(res).to.have.status(404));
  });

  it('returns related results from the service (happy path)', function() {
    qdrantService.enabled = true;
    savedRelated = qdrantService.related;
    qdrantService.related = async () => ([
      { cardId: 'c2', question: 'perro', answer: 'dog', score: 0.88 }
    ]);
    return chai.request(app)
      .get(`/api/questions/${cardId}/related?k=3`)
      .set('Cookie', `accessToken=${token}`)
      .then(res => {
        expect(res).to.have.status(200);
        expect(res.body.related).to.have.lengthOf(1);
        expect(res.body.related[0].answer).to.equal('dog');
      });
  });

  it('fails soft (200 []) when the service throws', function() {
    qdrantService.enabled = true;
    qdrantService.related = async () => { throw new Error('qdrant down'); };
    return chai.request(app)
      .get(`/api/questions/${cardId}/related`)
      .set('Cookie', `accessToken=${token}`)
      .then(res => {
        expect(res).to.have.status(200);
        expect(res.body.related).to.deep.equal([]);
      });
  });
});
