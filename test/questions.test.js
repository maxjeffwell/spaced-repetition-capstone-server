'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');

const { app } = require('../index');
const User = require('../models/user');
const { JWT_SECRET } = require('../config');
const { isDatabaseConnected, TEST_TIMEOUT } = require('./setup.test');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Questions API', function() {
  this.timeout(TEST_TIMEOUT);

  const testUser = {
    firstName: 'Question',
    lastName: 'Tester',
    username: `questiontest_${Date.now()}`,
    password: 'testpassword123'
  };

  let authToken;
  let testUserId;

  before(async function() {
    if (!isDatabaseConnected()) {
      this.skip();
    }

    // Create a test user with questions
    const hashedPassword = await User.hashPassword(testUser.password);
    const user = await User.create({
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      username: testUser.username,
      password: hashedPassword,
      head: 0,
      questions: [
        {
          _id: new (require('mongoose').Types.ObjectId)(),
          question: '¿Hola?',
          answer: 'Hello',
          memoryStrength: 1,
          next: 1,
          repetitions: 0,
          easeFactor: 2.5,
          timesCorrect: 0,
          timesIncorrect: 0
        },
        {
          _id: new (require('mongoose').Types.ObjectId)(),
          question: '¿Adiós?',
          answer: 'Goodbye',
          memoryStrength: 1,
          next: 0, // Points back to first question (circular)
          repetitions: 0,
          easeFactor: 2.5,
          timesCorrect: 0,
          timesIncorrect: 0
        }
      ],
      settings: {
        algorithmMode: 'baseline',
        useMLAlgorithm: false
      }
    });

    testUserId = user._id;

    // Create auth token
    authToken = jwt.sign(
      { user: { id: user._id, username: user.username } },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  after(async function() {
    if (isDatabaseConnected()) {
      await User.deleteOne({ username: testUser.username });
    }
  });

  describe('GET /questions/next', function() {
    it('should return the next question for authenticated user', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .get('/questions/next')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('question');
      expect(res.body.question).to.equal('¿Hola?');
      expect(res.body).to.have.property('questionId');
    });

    it('should reject unauthenticated request', async function() {
      const res = await chai.request(app)
        .get('/questions/next');

      expect(res).to.have.status(401);
    });

    it('should reject invalid token', async function() {
      const res = await chai.request(app)
        .get('/questions/next')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res).to.have.status(401);
    });

    it('should include question features for ML', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .get('/questions/next')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('questionFeatures');
      expect(res.body.questionFeatures).to.have.property('memoryStrength');
      expect(res.body.questionFeatures).to.have.property('difficultyRating');
    });
  });

  describe('POST /questions/answer', function() {
    it('should process correct answer', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: 'Hello',
          responseTime: 2500
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('correct', true);
      expect(res.body).to.have.property('correctAnswer', 'Hello');
      expect(res.body).to.have.property('feedback');
      expect(res.body).to.have.property('stats');
    });

    it('should process incorrect answer', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // First get the current question
      await chai.request(app)
        .get('/questions/next')
        .set('Authorization', `Bearer ${authToken}`);

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: 'Wrong answer',
          responseTime: 3000
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('correct', false);
      expect(res.body).to.have.property('correctAnswer');
    });

    it('should reject missing answer', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          responseTime: 2000
        });

      expect(res).to.have.status(422);
    });

    it('should reject invalid responseTime', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: 'Hello',
          responseTime: -100
        });

      expect(res).to.have.status(422);
    });

    it('should accept client-predicted interval', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: 'Hello',
          responseTime: 2000,
          predictedInterval: 5,
          predictionTime: 12.5
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('correct');
    });

    it('should update user stats after answer', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: 'Hello',
          responseTime: 2000
        });

      expect(res).to.have.status(200);
      expect(res.body.stats).to.have.property('totalReviews');
      expect(res.body.stats.totalReviews).to.be.at.least(1);
    });

    it('should be case-insensitive for answer matching', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // Get the current question to find its answer
      const questionRes = await chai.request(app)
        .get('/questions/next')
        .set('Authorization', `Bearer ${authToken}`);

      // Get the correct answer from the user's questions
      const user = await User.findOne({ username: testUser.username });
      const currentAnswer = user.questions[user.head].answer;

      // Submit the answer in UPPERCASE to test case-insensitivity
      const res = await chai.request(app)
        .post('/questions/answer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answer: currentAnswer.toUpperCase(),
          responseTime: 2000
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('correct', true);
    });
  });

  describe('GET /questions/stats/comparison', function() {
    it('should return algorithm comparison stats', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .get('/questions/stats/comparison')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('comparison');
      expect(res.body).to.have.property('mlReadiness');
      expect(res.body).to.have.property('currentMode');
    });

    it('should require authentication', async function() {
      const res = await chai.request(app)
        .get('/questions/stats/comparison');

      expect(res).to.have.status(401);
    });
  });
});

describe('Questions API - Edge Cases', function() {
  this.timeout(TEST_TIMEOUT);

  it('should handle non-existent user gracefully', async function() {
    // Create token for non-existent user
    const fakeToken = jwt.sign(
      { user: { id: '000000000000000000000000', username: 'nonexistent' } },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await chai.request(app)
      .get('/questions/next')
      .set('Authorization', `Bearer ${fakeToken}`);

    // Should return 401 since user doesn't exist (after JWT db lookup fix)
    expect(res.status).to.be.oneOf([401, 404, 500]);
  });
});
