const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

describe('review finding regressions', () => {
  test('package scripts and dependencies match the current CLI surface', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

    expect(pkg.scripts.dev).toBe('nodemon src/booker.js');
    expect(pkg.dependencies).not.toHaveProperty('axios');
    expect(pkg.dependencies).not.toHaveProperty('node-cron');
  });

  test('Comal helper scripts do not commit personal contact details', () => {
    const scripts = fs.readdirSync(repoRoot)
      .filter(file => /^book_comal.*\.js$/.test(file))
      .map(file => path.join(repoRoot, file));

    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      const content = fs.readFileSync(script, 'utf8');

      expect(content).not.toMatch(/[A-Z0-9._%+-]+@gmail\.com/i);
      expect(content).not.toMatch(/\b\d{10}\b/);
    }
  });

  test('AirMenusBooker selects date inputs with Puppeteer-compatible APIs', async () => {
    const AirMenusBooker = require('../src/services/AirMenusBooker');
    const booker = new AirMenusBooker();
    const input = { click: jest.fn() };
    const page = {
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      $: jest.fn(async selector => (selector === 'input[type="date"]' ? input : null)),
      $eval: jest.fn(async (selector, callback, date) => {
        const element = {
          value: '',
          dispatchEvent: jest.fn()
        };
        callback(element, date);
        return element.value;
      }),
      keyboard: { press: jest.fn() },
      waitForTimeout: jest.fn().mockResolvedValue(undefined)
    };
    booker.page = page;

    await expect(booker.selectDate('2026-04-23')).resolves.toBe(true);

    expect(page.$eval).toHaveBeenCalledWith(
      'input[type="date"]',
      expect.any(Function),
      '2026-04-23'
    );
  });

  test('AirMenusBooker closest-time fallback clicks within the page context', async () => {
    const AirMenusBooker = require('../src/services/AirMenusBooker');
    const booker = new AirMenusBooker();
    const clicked = [];
    const page = {
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn(async (callback, argument) => {
        if (argument && typeof argument === 'object') {
          throw new Error('DOM element was serialized before click');
        }
        return callback(argument);
      }),
      waitForTimeout: jest.fn().mockResolvedValue(undefined)
    };
    booker.page = page;

    global.document = {
      querySelectorAll: jest.fn(() => [
        {
          getAttribute: () => '18:30',
          textContent: '18:30',
          click: () => clicked.push('18:30')
        },
        {
          getAttribute: () => '19:15',
          textContent: '19:15',
          click: () => clicked.push('19:15')
        }
      ])
    };

    try {
      await expect(booker.selectTime('19:00')).resolves.toBe(true);
      expect(clicked).toEqual(['19:15']);
    } finally {
      delete global.document;
    }
  });

  test('batch template command and dates are runnable from the generated output', () => {
    const outputFile = path.join(os.tmpdir(), `restaurant-booker-${Date.now()}.json`);

    try {
      const output = execFileSync(
        process.execPath,
        ['src/batch-booker.js', 'generate-template', '--output', outputFile],
        { cwd: repoRoot, encoding: 'utf8' }
      );
      const template = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

      expect(output).toContain(`npm run book-batch -- book --file ${outputFile}`);
      for (const booking of template) {
        expect(new Date(`${booking.date}T00:00:00Z`).getUTCFullYear()).toBeGreaterThanOrEqual(2026);
      }
    } finally {
      fs.rmSync(outputFile, { force: true });
    }
  });

  test('batch processing uses an isolated AirMenusBooker instance per booking', async () => {
    const BatchBooker = require('../src/batch-booker');
    const createdBookers = [];
    const bookingModel = {
      create: jest.fn(async booking => ({ id: `${booking.restaurantName}-id` })),
      updateStatus: jest.fn(async () => undefined)
    };
    const notificationService = {
      sendBookingSuccess: jest.fn(async () => true),
      sendBookingFailure: jest.fn(async () => true)
    };
    const testConfig = {
      getRetryConfig: () => ({ maxAttempts: 1, delayMs: 1, backoffMultiplier: 1 })
    };
    const bookerFactory = () => {
      const booker = {
        init: jest.fn(async () => true),
        login: jest.fn(async () => true),
        bookTable: jest.fn(async () => ({ success: true, confirmationNumber: `C-${createdBookers.length}` })),
        close: jest.fn(async () => true)
      };
      createdBookers.push(booker);
      return booker;
    };
    const batchBooker = new BatchBooker({
      autoParse: false,
      bookerFactory,
      bookingModel,
      notificationService,
      config: testConfig
    });

    await Promise.all([
      batchBooker.processSingleBooking({ restaurantName: 'A', date: '2026-04-23', time: '19:00', guests: 2 }, { retry: true }),
      batchBooker.processSingleBooking({ restaurantName: 'B', date: '2026-04-23', time: '20:00', guests: 2 }, { retry: true })
    ]);

    expect(createdBookers).toHaveLength(2);
    expect(createdBookers[0]).not.toBe(createdBookers[1]);
    expect(createdBookers[0].close).toHaveBeenCalled();
    expect(createdBookers[1].close).toHaveBeenCalled();
  });
});
