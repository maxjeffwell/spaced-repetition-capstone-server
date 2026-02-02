'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { app } = require('../index');
const User = require('../models/user');
const { JWT_SECRET } = require('../config');
const { isDatabaseConnected, TEST_TIMEOUT } = require('./setup.test');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Authentication API', function() {
  this.timeout(TEST_TIMEOUT);

  const testUser = {
    firstName: 'Test',
    lastName: 'User',
    username: `testuser_${Date.now()}`,
    password: 'testpassword123'
  };

  let authToken;

  before(async function() {
    if (!isDatabaseConnected()) {
      this.skip();
    }

    // Create a test user
    const hashedPassword = await User.hashPassword(testUser.password);
    await User.create({
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      username: testUser.username,
      password: hashedPassword,
      questions: []
    });
  });

  after(async function() {
    if (isDatabaseConnected()) {
      // Clean up test user
      await User.deleteOne({ username: testUser.username });
    }
  });

  describe('POST /auth/login', function() {
    it('should return a JWT token for valid credentials', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('authToken');
      expect(res.body.authToken).to.be.a('string');

      // Verify the token is valid
      const decoded = jwt.verify(res.body.authToken, JWT_SECRET);
      expect(decoded.user).to.have.property('username', testUser.username);

      // Save token for later tests
      authToken = res.body.authToken;
    });

    it('should reject invalid password', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword'
        });

      expect(res).to.have.status(401);
    });

    it('should reject non-existent username', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'somepassword'
        });

      expect(res).to.have.status(401);
    });

    it('should reject missing credentials', async function() {
      const res = await chai.request(app)
        .post('/auth/login')
        .send({});

      expect(res).to.have.status(400);
    });
  });

  describe('POST /auth/refresh', function() {
    it('should return a new token for valid JWT', async function() {
      if (!isDatabaseConnected() || !authToken) {
        this.skip();
      }

      const res = await chai.request(app)
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('authToken');
      expect(res.body.authToken).to.be.a('string');

      // Verify the new token
      const decoded = jwt.verify(res.body.authToken, JWT_SECRET);
      expect(decoded.user).to.have.property('username', testUser.username);
    });

    it('should reject invalid JWT', async function() {
      const res = await chai.request(app)
        .post('/auth/refresh')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res).to.have.status(401);
    });

    it('should reject missing Authorization header', async function() {
      const res = await chai.request(app)
        .post('/auth/refresh');

      expect(res).to.have.status(401);
    });

    it('should reject expired JWT', async function() {
      // Create an expired token
      const expiredToken = jwt.sign(
        { user: { id: 'someid', username: testUser.username } },
        JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const res = await chai.request(app)
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res).to.have.status(401);
    });
  });
});

describe('JWT Token Structure', function() {
  it('should contain user id and username', function() {
    const user = { _id: 'test123', username: 'testuser' };
    const token = jwt.sign({ user: { id: user._id, username: user.username } }, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.user).to.have.property('id', 'test123');
    expect(decoded.user).to.have.property('username', 'testuser');
  });

  it('should use HS256 algorithm', function() {
    const user = { _id: 'test123', username: 'testuser' };
    const token = jwt.sign({ user }, JWT_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded.header.alg).to.equal('HS256');
  });
});
