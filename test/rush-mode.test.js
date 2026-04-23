const { getVenueProfile } = require('../src/venues/airmenusVenues');
const { resolveReleaseAt } = require('../src/utils/rushReleaseTiming');
const {
  hasBookingProfile,
  loadBookingContact,
  saveBookingProfile
} = require('../src/utils/bookingContactProfile');
const AirMenusApiClient = require('../src/services/AirMenusApiClient');
const { findRushSlot } = require('../src/utils/airmenusSlotMatcher');
const { getAvailableRushSlots } = require('../src/utils/airmenusAvailableSlots');
const { pollForAvailability } = require('../src/utils/pollingScheduler');
const AirMenusRushBooker = require('../src/services/AirMenusRushBooker');
const {
  getSelectedGuestArgs,
  parseGuestCount,
  validateGuestCount
} = require('../src/guerilla-diner');
const {
  normalizeRequest,
  runRush
} = require('../src/rush-booker');
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

  describe('rush CLI input validation', () => {
    const baseOptions = {
      date: '2026-04-24',
      time: '17:00',
      guests: '1',
      prewarmMs: '180000',
      pollMs: '500',
      tightPollWindowMs: '90000',
      timeoutMs: '60000',
      handoffTimeoutMs: '15000'
    };
    const venue = { defaultGuests: 2 };

    test.each([
      ['--guests', { guests: '2abc' }],
      ['--prewarm-ms', { prewarmMs: '1x' }],
      ['--poll-ms', { pollMs: '500ms' }],
      ['--tight-poll-window-ms', { tightPollWindowMs: '90_000' }],
      ['--timeout-ms', { timeoutMs: '60s' }],
      ['--handoff-timeout-ms', { handoffTimeoutMs: '15s' }]
    ])('rejects partial integer values for %s', (_flag, override) => {
      expect(() => normalizeRequest({
        ...baseOptions,
        ...override
      }, venue)).toThrow(/whole number/);
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
        name: 'Test User',
        email: 'test@example.com',
        phone: '9876543210'
      });
    });

    test('loads a named contact profile from an ignored local profile file', () => {
      const contact = loadBookingContact({
        env: {},
        profileName: 'rush',
        readProfileFile: () => JSON.stringify({
          profiles: {
            rush: {
              name: 'Profile User',
              email: 'profile@example.com',
              phone: '9123456780'
            }
          }
        })
      });

      expect(contact.name).toBe('Profile User');
      expect(contact.email).toBe('profile@example.com');
      expect(contact.phone).toBe('9123456780');
    });

    test('detects whether a named booking profile already exists', () => {
      expect(hasBookingProfile({
        profileName: 'rush',
        readProfileFile: () => JSON.stringify({
          profiles: {
            rush: {
              name: 'Profile User',
              email: 'profile@example.com',
              phone: '9123456780'
            }
          }
        })
      })).toBe(true);

      expect(hasBookingProfile({
        profileName: 'missing',
        readProfileFile: () => JSON.stringify({ profiles: {} })
      })).toBe(false);
    });

    test('saves a first-run local booking profile without losing existing profiles', () => {
      let writtenJson = '';
      const savedContact = saveBookingProfile({
        profileName: 'sidharth',
        contact: {
          name: 'Example User',
          email: 'example@example.com',
          phone: '9999999999'
        },
        readProfileFile: () => JSON.stringify({
          profiles: {
            rush: {
              name: 'Backup User',
              email: 'backup@example.com',
              phone: '8888888888'
            }
          }
        }),
        writeProfileFile: json => {
          writtenJson = json;
        }
      });

      const parsed = JSON.parse(writtenJson);
      expect(savedContact).toEqual({
        name: 'Example User',
        email: 'example@example.com',
        phone: '9999999999'
      });
      expect(parsed.profiles.rush.email).toBe('backup@example.com');
      expect(parsed.profiles.sidharth.email).toBe('example@example.com');
    });

    test('requires complete contact details without personal CLI fields', () => {
      expect(() => loadBookingContact({
        env: { BOOKING_NAME: 'Missing Fields' },
        cli: {
          name: 'CLI User',
          email: 'cli@example.com',
          phone: '9999999999'
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
              { id: 202, short_name: 'order', name: 'Target Outlet' }
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
	        timeoutMs: 1234,
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
	      expect(calls[0].timeoutMs).toBe(1234);
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

    test('lists only slots with enough remaining pax for the selected date', async () => {
      const apiClient = {
        resolveOutlet: jest.fn(async () => ({ id: 1406 })),
        getReservationConfig: jest.fn(async () => ({
          setting: {
            '2026-04-24': {
              is_open: true,
              slot_groups: [{
                title: 'Bench Seats',
                available_times: [
                  { time: '17:00' },
                  { time: '18:00' },
                  { time: '19:00' }
                ]
              }]
            }
          }
        })),
	        getSlotRemainingPax: jest.fn(async () => ({
	          '17:00': '1',
	          '18:00': '2',
	          '19:00': '0'
	        }))
	      };

      const result = await getAvailableRushSlots({
        venue: getVenueProfile('guerilla'),
        date: '2026-04-24',
        guests: 2,
        apiClient
      });

      expect(result.slots).toEqual([{
        date: '2026-04-24',
        time: '18:00',
        groupTitle: 'Bench Seats',
        remaining: 2
      }]);
      expect(apiClient.getSlotRemainingPax).toHaveBeenCalledWith(expect.objectContaining({
        groupTitle: 'Bench Seats',
        outletId: 1406
      }));
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

	    test('polling timeout starts at the tight window for scheduled prewarm runs', async () => {
	      let now = 0;
	      let checks = 0;
	      const sleeps = [];

	      const result = await pollForAvailability({
	        releaseAt: new Date(180000),
	        tightPollWindowMs: 90000,
	        timeoutMs: 60000,
	        now: () => now,
	        sleep: async delay => {
	          sleeps.push(delay);
	          now += delay;
	        },
	        check: async () => {
	          checks += 1;
	          return { '17:00': 1 };
	        },
	        isAvailable: response => response['17:00'] > 0
	      });

	      expect(sleeps[0]).toBe(90000);
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

    test('browser state verification refreshes once when the prewarmed page is stale', async () => {
      const timings = { mark: jest.fn() };
      const page = {
        goto: jest.fn(async () => undefined),
        evaluate: jest.fn()
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true)
      };
      const booker = new AirMenusRushBooker({
        page,
        now: () => 1234
      });

      await expect(booker.ensureBrowserSlotState({
        venue: getVenueProfile('guerilla'),
        date: '2026-04-24',
        slot: { groupTitle: 'Bench Seats' },
        timings
      })).resolves.toBe(true);

      expect(page.goto).toHaveBeenCalledWith(
        expect.stringContaining('rush_refresh=1234'),
        expect.objectContaining({ waitUntil: 'networkidle2' })
      );
      expect(timings.mark).toHaveBeenCalledWith('browser_refreshed_after_stale_state');
    });

    test('guest selection handles AirMenus custom veg/non-veg counters', async () => {
      const originalDocument = global.document;
      const vegClick = jest.fn();
      const nonVegClick = jest.fn();
      const vegRow = {
        innerText: 'With Vegetarian preference 0',
        textContent: 'With Vegetarian preference 0',
        parentElement: null
      };
      const nonVegRow = {
        innerText: 'With Non-Vegetarian preference 0',
        textContent: 'With Non-Vegetarian preference 0',
        parentElement: null
      };
      const vegPlusButton = {
        innerText: '',
        textContent: '',
        parentElement: vegRow,
        getAttribute: jest.fn(() => null),
        querySelector: jest.fn(selector => {
          if (selector === '[aria-label]') {
            return { getAttribute: () => 'plus' };
          }
          return null;
        }),
        click: vegClick
      };
      const nonVegPlusButton = {
        innerText: '',
        textContent: '',
        parentElement: nonVegRow,
        getAttribute: jest.fn(() => null),
        querySelector: jest.fn(selector => {
          if (selector === '[aria-label]') {
            return { getAttribute: () => 'plus' };
          }
          return null;
        }),
        click: nonVegClick
      };
      global.document = {
        body: {
          innerText: 'Number of Guest(s) With Vegetarian preference 0 With Non-Vegetarian preference 0'
        },
        querySelectorAll: jest.fn(() => [vegPlusButton, nonVegPlusButton])
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

      expect(vegClick).not.toHaveBeenCalled();
      expect(nonVegClick).toHaveBeenCalledTimes(1);
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

	    test('group selection clicks the requested group card instead of a broad parent', async () => {
	      const originalDocument = global.document;
	      const wrongClick = jest.fn();
	      const rightClick = jest.fn();
	      const wrongButton = {
	        innerText: 'BOOK',
	        textContent: 'BOOK',
	        click: wrongClick
	      };
	      const rightButton = {
	        innerText: 'BOOK',
	        textContent: 'BOOK',
	        click: rightClick
	      };
	      const parent = {
	        innerText: 'Table Seats BOOK Bench Seats BOOK',
	        querySelectorAll: jest.fn(() => [wrongButton, rightButton])
	      };
	      const wrongCard = {
	        innerText: 'Table Seats BOOK',
	        querySelectorAll: jest.fn(() => [wrongButton])
	      };
	      const rightCard = {
	        innerText: 'Bench Seats BOOK',
	        querySelectorAll: jest.fn(() => [rightButton])
	      };
	      global.document = {
	        querySelectorAll: jest.fn(() => [parent, wrongCard, rightCard])
	      };
	      const page = {
	        evaluate: jest.fn(async (fn, value) => fn(value))
	      };
	      const booker = new AirMenusRushBooker({ page });

	      try {
	        await booker.clickGroupBook('Bench Seats');
	      } finally {
	        global.document = originalDocument;
	      }

	      expect(rightClick).toHaveBeenCalledTimes(1);
	      expect(wrongClick).not.toHaveBeenCalled();
	    });

	    test('browser checkout retries recoverable stale UI failures after API availability', async () => {
	      let now = 0;
	      const page = {
	        goto: jest.fn(async () => undefined)
	      };
	      const apiClient = {
	        resolveOutlet: jest.fn(async () => ({ id: 202, short_name: 'order' })),
	        getReservationConfig: jest.fn(async () => ({
	          setting: {
	            '2026-04-24': {
	              is_open: true,
	              slot_groups: [{
	                title: 'Bench Seats',
	                available_times: [{ time: '17:00' }]
	              }]
	            }
	          }
	        })),
	        getSlotRemainingPax: jest.fn()
	      };
	      const injectedPoller = jest.fn(async ({ check, isAvailable }) => {
	        now += 10;
	        const response = await check();
	        expect(isAvailable(response)).toBe(true);
	        return { available: true, response, attempts: 1 };
	      });
	      apiClient.getSlotRemainingPax.mockResolvedValue({ '17:00': 1 });
	      const booker = new AirMenusRushBooker({
	        page,
	        apiClient,
	        pollForAvailability: injectedPoller,
	        now: () => now
	      });
	      booker.prepareCheckout = jest.fn()
	        .mockRejectedValueOnce(new Error('Time option not found: 17:00'))
	        .mockResolvedValueOnce(undefined);
	      booker.refreshAfterAvailability = jest.fn(async () => undefined);
	      booker.fillCheckout = jest.fn(async () => undefined);
	      booker.clickProceed = jest.fn(async () => undefined);
	      booker.waitForHandoffState = jest.fn(async () => ({ type: 'none' }));

	      const result = await booker.run({
	        venue: getVenueProfile('guerilla'),
	        date: '2026-04-24',
	        time: '17:00',
	        guests: 1,
	        contact: { name: 'Test', email: 'test@example.com', phone: '9999999999' },
	        releaseAt: new Date(0),
	        timeoutMs: 100
	      });

	      expect(injectedPoller).toHaveBeenCalledTimes(2);
	      expect(booker.prepareCheckout).toHaveBeenCalledTimes(2);
	      expect(booker.refreshAfterAvailability).toHaveBeenCalledTimes(1);
	      expect(result.status).toBe('proceed-clicked');
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
      expect(help).toContain('--group-title <title>');
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
        encoding: 'utf8',
        env: {
          ...process.env,
          GUERILLA_PROFILE: 'missing-test-profile'
        }
      });

      expect(help).toContain('Rush-mode AirMenus booking helper');
      expect(help).toContain('--venue <venue>');
	      expect(help).toContain('--release-at <datetime>');
	    });

    test('Guerilla Diner shortcut prompts for guest count on interactive runs', async () => {
      const prompt = jest.fn(async questions => {
        expect(questions).toHaveLength(1);
        expect(questions[0]).toMatchObject({
          type: 'input',
          name: 'guests',
          message: 'How many guests?',
          default: '1'
        });
        expect(questions[0].validate('3')).toBe(true);
        expect(questions[0].validate('3abc')).toMatch(/whole number/);
        expect(questions[0].validate('7')).toMatch(/between 1 and 6/);
        return { guests: '3' };
      });

      await expect(getSelectedGuestArgs([], {
        prompt,
        stdin: { isTTY: true },
        env: {}
      })).resolves.toEqual(['--guests', '3']);
      expect(prompt).toHaveBeenCalledTimes(1);
    });

    test('Guerilla Diner guest prompt uses env as the interactive default', async () => {
      const prompt = jest.fn(async questions => {
        expect(questions[0].default).toBe('2');
        return { guests: '4' };
      });

      await expect(getSelectedGuestArgs([], {
        prompt,
        stdin: { isTTY: true },
        env: { GUERILLA_GUESTS: '2' }
      })).resolves.toEqual(['--guests', '4']);
    });

    test('Guerilla Diner guest selection keeps explicit and non-interactive paths scriptable', async () => {
      const prompt = jest.fn();

      await expect(getSelectedGuestArgs(['--guests', '2'], {
        prompt,
        stdin: { isTTY: true },
        env: {}
      })).resolves.toEqual([]);
      await expect(getSelectedGuestArgs([], {
        prompt,
        stdin: { isTTY: false },
        env: { GUERILLA_GUESTS: '5' }
      })).resolves.toEqual(['--guests', '5']);
      expect(parseGuestCount('6')).toBe(6);
      expect(parseGuestCount('6.5')).toBeNull();
      expect(validateGuestCount('0')).toMatch(/between 1 and 6/);
      expect(prompt).not.toHaveBeenCalled();
    });

	    test('live rush mode forces a visible browser for payment handoff', async () => {
	      const originalEnv = {
	        BOOKING_NAME: process.env.BOOKING_NAME,
	        BOOKING_EMAIL: process.env.BOOKING_EMAIL,
	        BOOKING_PHONE: process.env.BOOKING_PHONE
	      };
	      process.env.BOOKING_NAME = 'Test User';
	      process.env.BOOKING_EMAIL = 'test@example.com';
	      process.env.BOOKING_PHONE = '9999999999';
	      const close = jest.fn(async () => undefined);
	      let runnerOptions;

	      try {
	        await runRush({
	          venue: 'guerilla',
	          date: '2026-04-24',
	          time: '17:00',
	          guests: '1',
	          releaseAt: '2026-04-22 20:00 Asia/Kolkata',
	          prewarmMs: '180000',
	          pollMs: '500',
	          tightPollWindowMs: '90000',
	          timeoutMs: '60000',
	          handoffTimeoutMs: '15000',
	          dryRun: false
	        }, {
	          runnerFactory: options => {
	            runnerOptions = options;
	            return {
	              run: jest.fn(async () => ({
	                status: 'handoff',
	                timings: { marks: [] }
	              })),
	              close
	            };
	          }
	        });
	      } finally {
	        Object.entries(originalEnv).forEach(([key, value]) => {
	          if (value === undefined) {
	            delete process.env[key];
	          } else {
	            process.env[key] = value;
	          }
	        });
	      }

	      expect(runnerOptions.browserConfig.headless).toBe(false);
	      expect(close).toHaveBeenCalledWith({ keepOpen: true });
	    });

    test('live rush mode keeps the browser open after a successful proceed click', async () => {
      const originalEnv = {
        BOOKING_NAME: process.env.BOOKING_NAME,
        BOOKING_EMAIL: process.env.BOOKING_EMAIL,
        BOOKING_PHONE: process.env.BOOKING_PHONE
      };
      process.env.BOOKING_NAME = 'Test User';
      process.env.BOOKING_EMAIL = 'test@example.com';
      process.env.BOOKING_PHONE = '9999999999';
      const close = jest.fn(async () => undefined);
      let runnerOptions;

      try {
        await runRush({
          venue: 'guerilla',
          date: '2026-04-24',
          time: '17:00',
          guests: '1',
          releaseAt: '2026-04-22 20:00 Asia/Kolkata',
          prewarmMs: '180000',
          pollMs: '500',
          tightPollWindowMs: '90000',
          timeoutMs: '60000',
          handoffTimeoutMs: '15000',
          dryRun: false
        }, {
          runnerFactory: options => {
            runnerOptions = options;
            return {
              run: jest.fn(async () => ({
                status: 'proceed-clicked',
                timings: { marks: [] }
              })),
              close
            };
          }
        });
      } finally {
        Object.entries(originalEnv).forEach(([key, value]) => {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        });
      }

      expect(runnerOptions.browserConfig.headless).toBe(false);
      expect(close).toHaveBeenCalledWith({ keepOpen: true });
    });
	  });
	});
