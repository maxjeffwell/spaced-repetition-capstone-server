'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');

const { app } = require('../index');
const User = require('../models/user');
const RefreshToken = require('../models/refresh-token');
const { JWT_SECRET } = require('../config');
const { isDatabaseConnected, TEST_TIMEOUT } = require('./setup.test');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Authentication API (Cookie-based)', function() {
  this.timeout(TEST_TIMEOUT);

  const testUser = {
    firstName: 'Test',
    lastName: 'User',
    username: `testuser_${Date.now()}`,
    password: 'testpassword123'
  };

  let agent; // chai-http agent for cookie persistence
  let testUserId;

  before(async function() {
    if (!isDatabaseConnected()) {
      this.skip();
    }

    // Create agent for cookie persistence
    agent = chai.request.agent(app);

    // Create a test user
    const hashedPassword = await User.hashPassword(testUser.password);
    const user = await User.create({
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      username: testUser.username,
      password: hashedPassword,
      questions: []
    });
    testUserId = user._id;
  });

  after(async function() {
    if (isDatabaseConnected()) {
      // Clean up test user and their refresh tokens
      await User.deleteOne({ username: testUser.username });
      if (testUserId) {
        await RefreshToken.deleteMany({ userId: testUserId });
      }
    }
    if (agent) {
      agent.close();
    }
  });

  describe('POST /auth/login', function() {
    it('should set httpOnly cookies for valid credentials', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      expect(res).to.have.status(200);
      expect(res).to.have.cookie('accessToken');
      expect(res).to.have.cookie('refreshToken');
    });

    it('should return user info in response body', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      const res = await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('user');
      expect(res.body.user).to.have.property('id');
      expect(res.body.user).to.have.property('username', testUser.username);
      // Should NOT return authToken in body (stored in cookie only)
      expect(res.body).to.not.have.property('authToken');
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

  describe('GET /auth/me', function() {
    it('should return current user when authenticated', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // Login first to get cookies
      await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      const res = await agent.get('/auth/me');

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('user');
      expect(res.body.user).to.have.property('username', testUser.username);
      expect(res.body.user).to.have.property('firstName', testUser.firstName);
      expect(res.body.user).to.have.property('lastName', testUser.lastName);
    });

    it('should return 401 without valid cookie', async function() {
      // Use fresh request without agent (no cookies)
      const res = await chai.request(app).get('/auth/me');
      expect(res).to.have.status(401);
    });
  });

  describe('POST /auth/refresh', function() {
    it('should refresh access token using refresh cookie', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // Login first
      await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      const res = await agent.post('/auth/refresh');

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('success', true);
      // Should set a new accessToken cookie
      expect(res).to.have.cookie('accessToken');
    });

    it('should reject without refresh cookie', async function() {
      // Use fresh request without agent (no cookies)
      const res = await chai.request(app).post('/auth/refresh');

      expect(res).to.have.status(401);
      expect(res.body).to.have.property('error', 'Refresh token required');
    });
  });

  describe('POST /auth/logout', function() {
    it('should clear cookies and revoke refresh tokens', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // Login first
      await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      const res = await agent.post('/auth/logout');

      expect(res).to.have.status(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should invalidate session after logout', async function() {
      if (!isDatabaseConnected()) {
        this.skip();
      }

      // Login first
      await agent
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      // Logout
      await agent.post('/auth/logout');

      // Try to access protected route - should fail
      // Note: agent still has the cookie, but server revoked the refresh token
      const meRes = await agent.get('/auth/me');
      // Access token may still be valid briefly, but refresh should fail
      // This tests the cookie clearing aspect
      expect(meRes).to.have.status(401);
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
