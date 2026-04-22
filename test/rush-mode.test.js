const { getVenueProfile } = require('../src/venues/airmenusVenues');
const { resolveReleaseAt } = require('../src/utils/rushReleaseTiming');
const { loadBookingContact } = require('../src/utils/bookingContactProfile');
const AirMenusApiClient = require('../src/services/AirMenusApiClient');
const { findRushSlot } = require('../src/utils/airmenusSlotMatcher');
const { pollForAvailability } = require('../src/utils/pollingScheduler');
const AirMenusRushBooker = require('../src/services/AirMenusRushBooker');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

describe('AirMenus rush mode', () => {
  describe('venue profiles and release timing', () => {
    test('defines Naru and Guerilla AirMenus venue profiles', () => {
      expect(getVenueProfile('naru')).toMatchObject({
        key: 'naru',
        bookingUrl: 'https://bookings.airmenus.in/eatnaru/order',
        brandShortName: 'eatnaru',
        outletShortName: 'order',
        defaultGuests: 2
      });

      expect(getVenueProfile('guerilla')).toMatchObject({
        key: 'guerilla',
        bookingUrl: 'https://bookings.airmenus.in/guerilladiner/order',
        brandShortName: 'guerilladiner',
        outletShortName: 'order',
        defaultGuests: 2
      });
    });

    test('uses an explicit release time before venue defaults', () => {
      const releaseAt = resolveReleaseAt({
        venue: getVenueProfile('guerilla'),
        bookingDate: '2026-04-23',
        releaseAt: '2026-04-22T20:00:00+05:30'
      });

      expect(releaseAt.toISOString()).toBe('2026-04-22T14:30:00.000Z');
    });

    test('derives Naru release time as Monday 8 PM IST for the booking week', () => {
      const releaseAt = resolveReleaseAt({
        venue: getVenueProfile('naru'),
        bookingDate: '2026-04-30'
      });

      expect(releaseAt.toISOString()).toBe('2026-04-27T14:30:00.000Z');
    });

    test('requires a release time for Guerilla until a live rule is verified', () => {
      expect(() => resolveReleaseAt({
        venue: getVenueProfile('guerilla'),
        bookingDate: '2026-04-23'
      })).toThrow(/release-at/i);
    });
  });

  describe('booking contact profiles', () => {
    test('loads contact details from booking environment variables', () => {
      const contact = loadBookingContact({
        env: {
          BOOKING_NAME: 'Test User',
          BOOKING_EMAIL: 'test@example.com',
          BOOKING_PHONE: '9876543210'
        }
      });

      expect(contact).toEqual({
        name: process.env.COMAL_BOOKING_NAME || 'Your Name',
        email: process.env.COMAL_BOOKING_EMAIL || 'your-booking-email@example.com',
        phone: process.env.COMAL_BOOKING_PHONE || 'your-phone-number'
      });
    });

    test('loads a named contact profile from an ignored local profile file', () => {
      const contact = loadBookingContact({
        env: {},
        profileName: 'rush',
        readProfileFile: () => JSON.stringify({
          profiles: {
            rush: {
              name: process.env.COMAL_BOOKING_NAME || 'Your Name',
              email: process.env.COMAL_BOOKING_EMAIL || 'your-booking-email@example.com',
              phone: process.env.COMAL_BOOKING_PHONE || 'your-phone-number'
            }
          }
        })
      });

      expect(contact.name).toBe('Profile User');
      expect(contact.email).toBe('profile@example.com');
      expect(contact.phone).toBe('9123456780');
    });

    test('requires complete contact details without personal CLI fields', () => {
      expect(() => loadBookingContact({
        env: { BOOKING_NAME: 'Missing Fields' },
        cli: {
          name: process.env.COMAL_BOOKING_NAME || 'Your Name',
          email: process.env.COMAL_BOOKING_EMAIL || 'your-booking-email@example.com',
          phone: process.env.COMAL_BOOKING_PHONE || 'your-phone-number'
        }
      })).toThrow(/BOOKING_EMAIL|BOOKING_PHONE/i);
    });
  });

  describe('AirMenus API client', () => {
    test('uses AirMenus booking details endpoint to resolve an outlet', async () => {
      const calls = [];
      const client = new AirMenusApiClient({
        request: async request => {
          calls.push(request);
          return {
            outlets: [
              { id: 101, short_name: 'other' },
              { id: 202, short_name: 'order', name: process.env.COMAL_BOOKING_NAME || 'Your Name' }
            ]
          };
        }
      });

      const outlet = await client.resolveOutlet('eatnaru', 'order');

      expect(outlet.id).toBe(202);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url.toString()).toBe(
        'https://apis.airmenus.in/api/restaurant/details/bookings/?rest_short_name=eatnaru'
      );
    });

    test('fetches reservation config by outlet id', async () => {
      const calls = [];
      const client = new AirMenusApiClient({
        request: async request => {
          calls.push(request);
          return { setting: {} };
        }
      });

      await client.getReservationConfig(202);

      expect(calls[0].method).toBe('GET');
      expect(calls[0].url.toString()).toBe('https://apis.airmenus.in/api/reservations/config/202/');
    });

    test('fetches remaining pax for a slot group and booking date', async () => {
      const calls = [];
      const client = new AirMenusApiClient({
        request: async request => {
          calls.push(request);
          return { '19:00': 2 };
        }
      });

      await client.getSlotRemainingPax({
        groupTitle: 'Dinner',
        bookingDt: '2026-04-23T13:30:00.000Z',
        outletId: 202
      });

      const url = calls[0].url;
      expect(url.origin + url.pathname).toBe('https://apis.airmenus.in/api/reservations/slot_group/remaining/paxs/');
      expect(url.searchParams.get('group_title')).toBe('Dinner');
      expect(url.searchParams.get('booking_dt')).toBe('2026-04-23T13:30:00.000Z');
      expect(url.searchParams.get('outlet_id')).toBe('202');
    });
  });

  describe('AirMenus slot matching and polling', () => {
    test('finds a date setting, slot group, and requested time from reservation config', () => {
      const slot = findRushSlot({
        setting: {
          '2026-04-23': {
            is_open: true,
            slot_groups: [
              {
                title: 'Lunch',
                available_times: [{ time: '12:30' }]
              },
              {
                title: 'Dinner',
                available_times: [{ time: '18:30' }, { time: '20:30' }]
              }
            ]
          }
        }
      }, {
        date: '2026-04-23',
        time: '20:30',
        groupTitle: 'Dinner'
      });

      expect(slot.group.title).toBe('Dinner');
      expect(slot.time.time).toBe('20:30');
      expect(slot.bookingDt).toBe('2026-04-23T15:00:00.000Z');
    });

    test('polling waits until the tight release window before checking availability', async () => {
      let now = 0;
      let checks = 0;
      const sleeps = [];

      const result = await pollForAvailability({
        releaseAt: new Date(1000),
        tightPollWindowMs: 200,
        timeoutMs: 2000,
        now: () => now,
        sleep: async delay => {
          sleeps.push(delay);
          now += delay;
        },
        check: async () => {
          checks += 1;
          return { '20:30': 2 };
        },
        isAvailable: response => response['20:30'] > 0
      });

      expect(sleeps[0]).toBe(800);
      expect(checks).toBe(1);
      expect(result.available).toBe(true);
    });

    test('polling clamps interval, applies jitter, and returns first available result', async () => {
      let now = 0;
      let checks = 0;
      const sleeps = [];

      const result = await pollForAvailability({
        releaseAt: new Date(0),
        timeoutMs: 2000,
        pollMs: 50,
        minPollMs: 250,
        random: () => 1,
        now: () => now,
        sleep: async delay => {
          sleeps.push(delay);
          now += delay;
        },
        check: async () => {
          checks += 1;
          return { '20:30': checks > 1 ? 2 : 0 };
        },
        isAvailable: response => response['20:30'] > 0
      });

      expect(sleeps[0]).toBeGreaterThan(250);
      expect(checks).toBe(2);
      expect(result.response).toEqual({ '20:30': 2 });
    });

    test('polling backs off on 429 and 5xx responses before retrying', async () => {
      let now = 0;
      let checks = 0;
      const sleeps = [];

      const result = await pollForAvailability({
        releaseAt: new Date(0),
        timeoutMs: 5000,
        pollMs: 250,
        random: () => 0.5,
        now: () => now,
        sleep: async delay => {
          sleeps.push(delay);
          now += delay;
        },
        check: async () => {
          checks += 1;
          if (checks === 1) {
            const error = new Error('rate limited');
            error.status = 429;
            throw error;
          }
          if (checks === 2) {
            const error = new Error('server error');
            error.status = 503;
            throw error;
          }
          return { '20:30': 2 };
        },
        isAvailable: response => response['20:30'] > 0
      });

      expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
      expect(sleeps[1]).toBeGreaterThanOrEqual(500);
      expect(result.available).toBe(true);
      expect(checks).toBe(3);
    });
  });

  describe('AirMenus rush browser driver', () => {
    test('dry-run prewarms, polls, refreshes browser state, and stops before proceed', async () => {
      const page = {
        goto: jest.fn(async () => undefined),
        evaluate: jest.fn(async () => true)
      };
      const apiClient = {
        resolveOutlet: jest.fn(async () => ({ id: 202, short_name: 'order' })),
        getReservationConfig: jest.fn(async () => ({
          setting: {
            '2026-04-23': {
              is_open: true,
              slot_groups: [
                {
                  title: 'Dinner',
                  available_times: [{ time: '20:30' }]
                }
              ]
            }
          }
        })),
        getSlotRemainingPax: jest.fn()
      };
      const injectedPoller = jest.fn(async ({ check, isAvailable }) => {
        const response = await check();
        expect(isAvailable(response)).toBe(true);
        return { available: true, response, attempts: 1 };
      });
      apiClient.getSlotRemainingPax.mockResolvedValue({ '20:30': 2 });
      const booker = new AirMenusRushBooker({
        page,
        apiClient,
        pollForAvailability: injectedPoller,
        now: () => 0
      });
      booker.clickProceed = jest.fn(async () => undefined);

      const result = await booker.run({
        venue: getVenueProfile('guerilla'),
        date: '2026-04-23',
        time: '20:30',
        guests: 2,
        releaseAt: new Date(1000),
        dryRun: true
      });

      expect(page.goto).toHaveBeenCalledWith('https://bookings.airmenus.in/guerilladiner/order', expect.any(Object));
      expect(page.goto.mock.calls[1][0]).toContain('rush_refresh=0');
      expect(page.evaluate).toHaveBeenCalled();
      expect(booker.clickProceed).not.toHaveBeenCalled();
      expect(result.status).toBe('dry-run-ready');
    });

    test('handoff close keeps the browser open for payment or challenge states', async () => {
      const browser = { close: jest.fn(async () => undefined) };
      const page = {
        evaluate: jest.fn(async () => ({ type: 'payment', message: 'Razorpay opened' }))
      };
      const booker = new AirMenusRushBooker({ browser, page });

      const state = await booker.detectHandoffState();
      await booker.close({ keepOpen: state.type !== 'none' });

      expect(state.type).toBe('payment');
      expect(browser.close).not.toHaveBeenCalled();
    });

    test('headed close disconnects so the script can exit while leaving payment open', async () => {
      const unref = jest.fn();
      const browser = {
        close: jest.fn(async () => undefined),
        disconnect: jest.fn(),
        process: jest.fn(() => ({ unref }))
      };
      const booker = new AirMenusRushBooker({ browser, page: {} });

      await booker.close({ keepOpen: true });

      expect(browser.disconnect).toHaveBeenCalledTimes(1);
      expect(unref).toHaveBeenCalledTimes(1);
      expect(browser.close).not.toHaveBeenCalled();
    });

    test('handoff wait polls until Razorpay or UPI state appears', async () => {
      let now = 0;
      const sleeps = [];
      const booker = new AirMenusRushBooker({
        page: {},
        now: () => now,
        sleep: async delay => {
          sleeps.push(delay);
          now += delay;
        }
      });
      booker.detectHandoffState = jest.fn()
        .mockResolvedValueOnce({ type: 'none', message: '' })
        .mockResolvedValueOnce({ type: 'payment', message: 'Payment handoff detected' });

      const handoff = await booker.waitForHandoffState({ timeoutMs: 1000, intervalMs: 250 });

      expect(handoff).toMatchObject({
        type: 'payment',
        message: 'Payment handoff detected',
        elapsedMs: 250
      });
      expect(sleeps).toEqual([250]);
    });

    test('guest selection handles AirMenus custom veg/non-veg counters', async () => {
      const originalDocument = global.document;
      const click = jest.fn();
      const plusButton = {
        innerText: '',
        textContent: '',
        getAttribute: jest.fn(() => null),
        querySelector: jest.fn(selector => {
          if (selector === '[aria-label]') {
            return { getAttribute: () => 'plus' };
          }
          return null;
        }),
        click
      };
      global.document = {
        body: {
          innerText: 'Number of Guest(s) With Vegetarian preference 0 With Non-Vegetarian preference 0'
        },
        querySelectorAll: jest.fn(() => [plusButton])
      };
      const page = {
        evaluate: jest.fn(async (fn, value) => fn(value))
      };
      const booker = new AirMenusRushBooker({
        page,
        sleep: async () => undefined
      });

      try {
        await booker.setGuestCount(1);
      } finally {
        global.document = originalDocument;
      }

      expect(click).toHaveBeenCalledTimes(1);
    });

    test('time selection clicks the specific AirMenus time tile instead of a parent container', async () => {
      const originalDocument = global.document;
      const tileClick = jest.fn();
      const container = {
        innerText: 'Time 05:00 PM 1 LEFT 06:00 PM 1 LEFT',
        textContent: 'Time 05:00 PM 1 LEFT 06:00 PM 1 LEFT',
        getAttribute: jest.fn(() => 'Slots_times_wrpr__lopTU'),
        closest: jest.fn(() => null),
        click: jest.fn()
      };
      const tile = {
        innerText: '05:00 PM 1 LEFT',
        textContent: '05:00 PM 1 LEFT',
        getAttribute: jest.fn(() => 'Slots_time_box__hAnID'),
        closest: jest.fn(() => tile),
        click: tileClick
      };
      const childSpan = {
        innerText: '05:00 PM',
        textContent: '05:00 PM',
        getAttribute: jest.fn(() => ''),
        closest: jest.fn(() => tile),
        click: jest.fn()
      };
      global.document = {
        querySelectorAll: jest.fn(() => [container, tile, childSpan])
      };
      const page = {
        evaluate: jest.fn(async (fn, value) => fn(value))
      };
      const booker = new AirMenusRushBooker({ page });

      try {
        await booker.clickTime('17:00');
      } finally {
        global.document = originalDocument;
      }

      expect(tileClick).toHaveBeenCalledTimes(1);
      expect(container.click).not.toHaveBeenCalled();
    });

    test('route wait failures include the target route and current page state', async () => {
      const page = {
        waitForFunction: jest.fn(async () => {
          throw new Error('Waiting failed: 30000ms exceeded');
        }),
        evaluate: jest.fn(async () => ({
          url: 'https://bookings.airmenus.in/guerilladiner/order',
          visibleText: 'Reservation open every Tuesday 8PM BOOK'
        }))
      };
      const booker = new AirMenusRushBooker({ page });

      await expect(booker.waitForRouteFragment('/slots')).rejects.toThrow(
        /AirMenus route \/slots.*guerilladiner\/order.*Reservation open/
      );
    });
  });

  describe('rush CLI', () => {
    test('package exposes npm run rush', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

      expect(pkg.scripts.rush).toBe('node src/rush-booker.js');
      expect(pkg.scripts['guerilla-diner']).toBe('node src/guerilla-diner.js');
    });

    test('CLI help exposes rush scheduling flags without personal-detail flags', () => {
      const help = execFileSync(process.execPath, ['src/rush-booker.js', '--help'], {
        cwd: repoRoot,
        encoding: 'utf8'
      });

      expect(help).toContain('--venue <venue>');
      expect(help).toContain('--release-at <datetime>');
      expect(help).toContain('--profile <name>');
      expect(help).toContain('--poll-ms <number>');
      expect(help).toContain('--tight-poll-window-ms <number>');
      expect(help).toContain('--handoff-timeout-ms <number>');
      expect(help).toContain('--timing');
      expect(help).toContain('--headed');
      expect(help).not.toMatch(/\s--name\b/);
      expect(help).not.toMatch(/\s--email\b/);
      expect(help).not.toMatch(/\s--phone\b/);
    });

    test('Guerilla Diner shortcut reuses the rush CLI help path', () => {
      const help = execFileSync(process.execPath, ['src/guerilla-diner.js', '--help'], {
        cwd: repoRoot,
        encoding: 'utf8'
      });

      expect(help).toContain('Rush-mode AirMenus booking helper');
      expect(help).toContain('--venue <venue>');
      expect(help).toContain('--release-at <datetime>');
    });
  });
});
