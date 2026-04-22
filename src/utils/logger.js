const winston = require('winston');
const path = require('path');
const config = require('../config');
const { ensurePrivateDirectory, ensurePrivateFile } = require('./privateArtifacts');
const { redactSensitive, redactText } = require('./redaction');

// Ensure logs directory exists
const logsDir = path.dirname(config.getLoggingConfig().file);
if (logsDir && logsDir !== '.') {
  ensurePrivateDirectory(logsDir);
}
ensurePrivateFile(config.getLoggingConfig().file);
ensurePrivateFile(path.join(logsDir, 'error.log'));

const redactFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = redactText(info.message);
  }

  Object.keys(info).forEach((key) => {
    if (!['level', 'message', 'timestamp'].includes(key)) {
      info[key] = redactSensitive(info[key], key);
    }
  });

  return info;
});

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  redactFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.getLoggingConfig().level,
  format: fileFormat,
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: config.getLoggingConfig().file,
      maxsize: config.getLoggingConfig().maxSize || '10m',
      maxFiles: config.getLoggingConfig().maxFiles || 5,
      tailable: true
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: config.getLoggingConfig().maxSize || '10m',
      maxFiles: config.getLoggingConfig().maxFiles || 5
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper methods
logger.startBooking = (restaurant, date, time, guests) => {
  logger.info('Starting booking process', {
    restaurant,
    date,
    time,
    guests,
    timestamp: new Date().toISOString()
  });
};

logger.bookingSuccess = (bookingId, restaurant, date, time, guests) => {
  logger.info('Booking successful', {
    bookingId,
    restaurant,
    date,
    time,
    guests,
    timestamp: new Date().toISOString()
  });
};

logger.bookingFailed = (restaurant, date, time, guests, error) => {
  logger.error('Booking failed', {
    restaurant,
    date,
    time,
    guests,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
};

logger.retryAttempt = (attempt, maxAttempts, restaurant) => {
  logger.warn('Retrying booking attempt', {
    attempt,
    maxAttempts,
    restaurant,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;
