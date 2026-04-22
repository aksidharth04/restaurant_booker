const fs = require('fs');
const path = require('path');
require('dotenv').config();

class Config {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // Load config file
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      this.config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.example.json'), 'utf8'));
    }

    // Environment variables
    this.env = {
      AIRMENUS_EMAIL: process.env.AIRMENUS_EMAIL,
      AIRMENUS_PASSWORD: process.env.AIRMENUS_PASSWORD,
      DATABASE_PATH: process.env.DATABASE_PATH || './data/bookings.db',
      ENABLE_EMAIL_NOTIFICATIONS: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
      ENABLE_PUSH_NOTIFICATIONS: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
      EMAIL_HOST: process.env.EMAIL_HOST,
      EMAIL_PORT: parseInt(process.env.EMAIL_PORT) || 587,
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_PASS: process.env.EMAIL_PASS,
      DEFAULT_BOOKING_WINDOW_DAYS: this.parseOptionalInteger(process.env.DEFAULT_BOOKING_WINDOW_DAYS, 30),
      DEFAULT_GUESTS: this.parseOptionalInteger(process.env.DEFAULT_GUESTS, undefined),
      MAX_GUESTS: this.parseOptionalInteger(process.env.MAX_GUESTS, undefined),
      MAX_RETRY_ATTEMPTS: this.parseOptionalInteger(process.env.MAX_RETRY_ATTEMPTS, 3),
      RETRY_DELAY_MS: this.parseOptionalInteger(process.env.RETRY_DELAY_MS, 2000),
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      LOG_FILE: process.env.LOG_FILE || './logs/booker.log',
      HEADLESS_MODE: process.env.HEADLESS_MODE !== 'false',
      BROWSER_TIMEOUT: this.parseOptionalInteger(process.env.BROWSER_TIMEOUT, 30000),
      USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      API_BASE_URL: process.env.API_BASE_URL || 'https://api.airmenus.com',
      API_TIMEOUT: this.parseOptionalInteger(process.env.API_TIMEOUT, 10000)
    };

    this.envOverrides = {
      booking: this.withDefinedValues({
        defaultGuests: this.parseEnvInteger('DEFAULT_GUESTS'),
        maxGuests: this.parseEnvInteger('MAX_GUESTS'),
        bookingWindowDays: this.parseEnvInteger('DEFAULT_BOOKING_WINDOW_DAYS')
      }),
      retry: this.withDefinedValues({
        maxAttempts: this.parseEnvInteger('MAX_RETRY_ATTEMPTS'),
        delayMs: this.parseEnvInteger('RETRY_DELAY_MS')
      }),
      browser: this.withDefinedValues({
        headless: this.parseEnvBoolean('HEADLESS_MODE'),
        timeout: this.parseEnvInteger('BROWSER_TIMEOUT'),
        userAgent: this.parseEnvString('USER_AGENT')
      }),
      logging: this.withDefinedValues({
        level: this.parseEnvString('LOG_LEVEL'),
        file: this.parseEnvString('LOG_FILE')
      })
    };
  }

  parseOptionalInteger(value, defaultValue) {
    return this.parseIntegerValue(value, defaultValue);
  }

  parseEnvInteger(key) {
    if (process.env[key] === undefined || process.env[key] === '') {
      return undefined;
    }

    return this.parseIntegerValue(process.env[key], undefined);
  }

  parseIntegerValue(value, defaultValue) {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const stringValue = String(value).trim();
    if (!/^-?\d+$/.test(stringValue)) {
      return defaultValue;
    }

    const parsed = Number(stringValue);
    return Number.isSafeInteger(parsed) ? parsed : defaultValue;
  }

  parseEnvBoolean(key) {
    if (process.env[key] === undefined || process.env[key] === '') {
      return undefined;
    }

    return process.env[key].toLowerCase() !== 'false';
  }

  parseEnvString(key) {
    if (process.env[key] === undefined || process.env[key] === '') {
      return undefined;
    }

    return process.env[key];
  }

  withDefinedValues(values) {
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined)
    );
  }

  get(key) {
    return this.config[key] || this.env[key];
  }

  getBookingConfig() {
    return {
      ...this.config.booking,
      ...this.envOverrides.booking
    };
  }

  getRetryConfig() {
    return {
      ...this.config.retry,
      ...this.envOverrides.retry
    };
  }

  getNotificationConfig() {
    return this.config.notifications;
  }

  getFavorites() {
    return this.config.favorites || [];
  }

  getBrowserConfig() {
    return {
      ...this.config.browser,
      ...this.envOverrides.browser
    };
  }

  getLoggingConfig() {
    return {
      ...this.config.logging,
      ...this.envOverrides.logging
    };
  }

  validate() {
    const required = ['AIRMENUS_EMAIL', 'AIRMENUS_PASSWORD'];
    const missing = required.filter(key => !this.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (!this.env.ENCRYPTION_KEY || this.env.ENCRYPTION_KEY.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    return true;
  }
}

module.exports = new Config();
