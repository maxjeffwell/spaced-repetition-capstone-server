'use strict';
const chai = require('chai');
const chaiHttp = require('chai-http');

const { app } = require('../index');
const User = require('../models/user');
const qdrantService = require('../ml/qdrant-service');
const { isDatabaseConnected, TEST_TIMEOUT } = require('./setup.test');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Registration indexes deck (fail-open)', function() {
  this.timeout(TEST_TIMEOUT);
  const savedEnabled = qdrantService.enabled;
  const savedIndex = qdrantService.indexUserDeck;
  const createdUsernames = [];
  let createdUsername;

  after(async function() {
    qdrantService.enabled = savedEnabled;
    qdrantService.indexUserDeck = savedIndex;
    for (const u of createdUsernames) {
      await User.deleteOne({ username: u });
    }
  });

  it('invokes indexUserDeck for the new user when enabled', function() {
    if (!isDatabaseConnected()) this.skip();
    qdrantService.enabled = true;
    let indexedDeck = null;
    qdrantService.indexUserDeck = async (user) => {
      indexedDeck = { username: user.username, cards: user.questions.length };
      return user.questions.length;
    };
    createdUsername = `regidx_call_${Date.now()}`; createdUsernames.push(createdUsername);
    return chai.request(app).post('/api/users').send({
      firstName: 'Reg', lastName: 'Idx',
      username: createdUsername, password: 'testpassword123'
    }).then(res => {
      expect(res).to.have.status(201);
      expect(indexedDeck).to.not.equal(null);
      expect(indexedDeck.username).to.equal(createdUsername);
      expect(indexedDeck.cards).to.be.greaterThan(0); // seeded vocabulary
    });
  });

  it('still returns 201 when indexing throws', function() {
    if (!isDatabaseConnected()) this.skip();
    qdrantService.enabled = true;
    qdrantService.indexUserDeck = async () => { throw new Error('qdrant down'); };
    createdUsername = `regidx_throw_${Date.now()}`; createdUsernames.push(createdUsername);
    return chai.request(app).post('/api/users').send({
      firstName: 'Reg', lastName: 'Idx',
      username: createdUsername, password: 'testpassword123'
    }).then(res => {
      expect(res).to.have.status(201);
    });
  });
});
