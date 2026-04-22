const fs = require('fs');
const os = require('os');
const path = require('path');
const moment = require('moment');

const repoRoot = path.resolve(__dirname, '..');

function loadRestaurantBookerWithMocks(modulePath = path.join(repoRoot, 'src/booker.js')) {
  jest.resetModules();
  jest.doMock('ora', () => jest.fn(() => ({
    start: jest.fn(() => ({
      text: '',
      fail: jest.fn(),
      succeed: jest.fn()
    }))
  })));
  jest.doMock('../src/models/Booking', () => ({
    create: jest.fn(async () => ({ id: 'booking-id' })),
    updateStatus: jest.fn(async () => undefined),
    addFavorite: jest.fn(async () => undefined)
  }));
  jest.doMock('../src/services/AirMenusBooker', () => jest.fn(() => ({
    close: jest.fn(async () => undefined),
    bookTable: jest.fn(async () => ({ success: false }))
  })));
  jest.doMock('../src/services/NotificationService', () => ({
    sendBookingSuccess: jest.fn(async () => true),
    sendBookingFailure: jest.fn(async () => true)
  }));
  jest.doMock('../src/utils/logger', () => ({
    error: jest.fn(),
    retryAttempt: jest.fn()
  }));

  return require(modulePath);
}

function createBatchBooker(overrides = {}) {
  const BatchBooker = require('../src/batch-booker');
  const bookingConfig = {
    maxGuests: 4,
    bookingWindowDays: 30
  };

  return new BatchBooker({
    autoParse: false,
    config: {
      validate: jest.fn(() => true),
      getBookingConfig: () => bookingConfig,
      getRetryConfig: () => ({ maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 })
    },
    bookingModel: {
      create: jest.fn(async () => ({ id: 'booking-id' })),
      updateStatus: jest.fn(async () => undefined)
    },
    notificationService: {
      sendBookingSuccess: jest.fn(async () => true),
      sendBookingFailure: jest.fn(async () => true)
    },
    ...overrides
  });
}

describe('Worker C review finding regressions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    jest.dontMock('ora');
    jest.dontMock('../src/models/Booking');
    jest.dontMock('../src/services/AirMenusBooker');
    jest.dontMock('../src/services/NotificationService');
    jest.dontMock('../src/utils/logger');
  });

  test('documented environment overrides are merged into typed config getters', () => {
    const originalEnv = process.env;

    jest.resetModules();
    process.env = {
      ...originalEnv,
      DEFAULT_BOOKING_WINDOW_DAYS: '17',
      MAX_RETRY_ATTEMPTS: '5',
      RETRY_DELAY_MS: '1234',
      HEADLESS_MODE: 'false',
      BROWSER_TIMEOUT: '4567',
      USER_AGENT: 'restaurant-booker-test-agent',
      LOG_LEVEL: 'debug',
      LOG_FILE: './logs/env-override-test.log'
    };

    try {
      const config = require('../src/config');

      expect(config.getBookingConfig()).toMatchObject({
        bookingWindowDays: 17
      });
      expect(config.getBookingConfig().defaultTime).toBeDefined();
      expect(config.getRetryConfig()).toMatchObject({
        maxAttempts: 5,
        delayMs: 1234
      });
      expect(config.getRetryConfig().backoffMultiplier).toBeDefined();
      expect(config.getBrowserConfig()).toMatchObject({
        headless: false,
        timeout: 4567,
        userAgent: 'restaurant-booker-test-agent'
      });
      expect(config.getBrowserConfig().viewport).toBeDefined();
      expect(config.getLoggingConfig()).toMatchObject({
        level: 'debug',
        file: './logs/env-override-test.log'
      });
    } finally {
      process.env = originalEnv;
      jest.resetModules();
    }
  });

  test('package main exports the RestaurantBooker API without running the CLI on import', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const RestaurantBooker = loadRestaurantBookerWithMocks(path.join(repoRoot, pkg.main));

    expect(typeof RestaurantBooker).toBe('function');
    expect(pkg.main).toBe('src/booker.js');

    const booker = new RestaurantBooker({
      autoParse: false,
      booker: { close: jest.fn(async () => undefined) }
    });

    expect(booker).toBeInstanceOf(RestaurantBooker);
    expect(typeof booker.validateBookingData).toBe('function');
  });

  test('single booking validation rejects NaN, partial, decimal, and oversized guest counts', () => {
    const RestaurantBooker = loadRestaurantBookerWithMocks();
    const config = require('../src/config');
    const booker = new RestaurantBooker({
      autoParse: false,
      booker: { close: jest.fn(async () => undefined) }
    });
    const validDate = moment().add(1, 'day').format('YYYY-MM-DD');
    const baseBooking = {
      restaurantName: 'Test Restaurant',
      date: validDate,
      time: '19:00'
    };
    const invalidGuests = [
      '2abc',
      '1.5',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      '0',
      config.getBookingConfig().maxGuests + 1
    ];

    invalidGuests.forEach(guests => {
      expect(() => booker.validateBookingData({
        ...baseBooking,
        guests
      })).toThrow(/whole number between 1 and/);
    });

    const booking = {
      ...baseBooking,
      guests: '2'
    };

    expect(() => booker.validateBookingData(booking)).not.toThrow();
    expect(booking.guests).toBe(2);
  });

  test('batch booking validation rejects partial guest counts and returns normalized integers', () => {
    const batchBooker = createBatchBooker();
    const validDate = moment().add(1, 'day').format('YYYY-MM-DD');
    const baseBooking = {
      restaurantName: 'Batch Restaurant',
      date: validDate,
      time: '20:00'
    };

    ['3abc', '2.5', Number.NaN, Number.POSITIVE_INFINITY, 0, '0', 5].forEach(guests => {
      expect(() => batchBooker.validateSingleBooking({
        ...baseBooking,
        guests
      })).toThrow(/whole number between 1 and/);
    });

    expect(batchBooker.validateSingleBooking({
      ...baseBooking,
      guests: '3'
    })).toMatchObject({ guests: 3 });
  });

  test('batch generated template and result files are private by default', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurant-booker-private-'));
    const batchBooker = createBatchBooker({ privateOutputDir: tmpDir });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await batchBooker.generateTemplate({});
      const templatePath = path.join(tmpDir, 'bookings-template.json');
      const templateMode = fs.statSync(templatePath).mode & 0o777;

      expect(templateMode).toBe(0o600);
      expect(JSON.parse(fs.readFileSync(templatePath, 'utf8'))).toHaveLength(2);

      const resultsPath = batchBooker.displayResults({
        total: 1,
        successful: [],
        failed: [{
          restaurantName: 'Private Restaurant',
          date: moment().add(1, 'day').format('YYYY-MM-DD'),
          time: '19:00',
          guests: 2,
          error: 'No table available'
        }]
      });
      const resultsMode = fs.statSync(resultsPath).mode & 0o777;

      expect(resultsPath.startsWith(tmpDir)).toBe(true);
      expect(resultsMode).toBe(0o600);
      expect(JSON.parse(fs.readFileSync(resultsPath, 'utf8')).failed).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('legacy batch output filenames are ignored if a user creates them in the repo root', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

    expect(gitignore).toContain('batch-results-*.json');
    expect(gitignore).toContain('bookings-template*.json');
  });

  test('batch failure logs redact booking fields and matching error text', async () => {
    const logger = require('../src/utils/logger');
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const retryConfig = { maxAttempts: 2, delayMs: 0, backoffMultiplier: 1 };
    const bookingModel = {
      create: jest.fn(async () => ({ id: 'booking-id' })),
      updateStatus: jest.fn(async () => undefined)
    };
    const booker = {
      init: jest.fn(async () => true),
      login: jest.fn(async () => true),
      bookTable: jest.fn(async () => {
        throw new Error('No table for Secret Bistro with vip-window');
      }),
      close: jest.fn(async () => true)
    };
    const batchBooker = createBatchBooker({
      bookingModel,
      bookerFactory: () => booker,
      config: {
        getBookingConfig: () => ({ maxGuests: 4, bookingWindowDays: 30 }),
        getRetryConfig: () => retryConfig
      }
    });

    const result = await batchBooker.processSingleBooking({
      restaurantName: 'Secret Bistro',
      restaurantUrl: 'https://airmenus.example/secret-bistro',
      date: moment().add(1, 'day').format('YYYY-MM-DD'),
      time: '19:00',
      guests: 2,
      notes: 'vip-window'
    }, { retry: true, notifications: false });
    const logPayload = JSON.stringify([
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls
    ]);

    expect(result.success).toBe(false);
    expect(bookingModel.updateStatus).toHaveBeenCalledWith('booking-id', 'failed');
    expect(logPayload).not.toContain('Secret Bistro');
    expect(logPayload).not.toContain('secret-bistro');
    expect(logPayload).not.toContain('vip-window');
    expect(logPayload).toContain('[REDACTED]');
  });
});
