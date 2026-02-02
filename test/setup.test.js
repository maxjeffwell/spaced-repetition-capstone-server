'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const { TEST_DATABASE_URL } = require('../config');
const { dbConnect, dbDisconnect } = require('../db-mongoose');

// Set NODE_ENV to `test` to disable http layer logs
process.env.NODE_ENV = 'test';

const expect = chai.expect;
chai.use(chaiHttp);

// Increase timeout for database operations
const TEST_TIMEOUT = 30000;

// Check if we should skip DB tests (for CI or local without MongoDB)
const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === 'true' || process.env.CI === 'true';

let dbConnected = false;

before(async function() {
  this.timeout(TEST_TIMEOUT);

  if (SKIP_DB_TESTS) {
    console.log('Skipping database connection (SKIP_DB_TESTS=true)');
    return;
  }

  try {
    // Try to connect with a shorter timeout for test setup
    await Promise.race([
      dbConnect(TEST_DATABASE_URL, 1, 5000), // 1 retry, 5s delay
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ]);
    dbConnected = true;
    console.log('Database connected for tests');
  } catch (err) {
    console.warn('Could not connect to test database:', err.message);
    console.warn('Integration tests will be skipped');
    dbConnected = false;
  }
});

after(async function() {
  this.timeout(TEST_TIMEOUT);
  if (dbConnected) {
    try {
      await dbDisconnect();
    } catch (err) {
      // Ignore disconnect errors
    }
  }
});

// Helper to check if database is connected
function isDatabaseConnected() {
  return dbConnected && mongoose.connection.readyState === 1;
}

describe('Test Setup', function() {
  it('should have chai properly configured', function() {
    expect(true).to.be.true;
  });

  it('should have chai-http available', function() {
    expect(chai.request).to.be.a('function');
  });
});

module.exports = { isDatabaseConnected, TEST_TIMEOUT };
