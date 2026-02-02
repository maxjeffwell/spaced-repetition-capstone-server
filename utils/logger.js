'use strict';

const winston = require('winston');
const { NODE_ENV } = require('../config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, component, ...meta }) => {
    const componentStr = component ? `[${component}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase()} ${componentStr} ${message}${metaStr}`;
  })
);

// JSON format for production (easier to parse in log aggregators)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: NODE_ENV === 'production' ? jsonFormat : logFormat,
  defaultMeta: { service: 'intervalai-server' },
  transports: [
    new winston.transports.Console({
      silent: NODE_ENV === 'test' // Suppress logs during tests
    })
  ]
});

// Create child logger for specific components
logger.child = (component) => {
  return {
    debug: (msg, meta = {}) => logger.debug(msg, { component, ...meta }),
    info: (msg, meta = {}) => logger.info(msg, { component, ...meta }),
    warn: (msg, meta = {}) => logger.warn(msg, { component, ...meta }),
    error: (msg, meta = {}) => logger.error(msg, { component, ...meta })
  };
};

module.exports = logger;
