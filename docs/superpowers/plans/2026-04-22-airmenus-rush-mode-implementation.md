# AirMenus Rush Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested `npm run rush` path for Naru and Guerilla Diner that prewarms AirMenus, polls availability with guardrails, refreshes stale browser state, and drives the browser up to payment/challenge handoff.

**Architecture:** Keep rush mode separate from the existing generic `AirMenusBooker`. Put deterministic parsing, release timing, contact loading, API access, slot matching, and polling in small modules that can be unit tested without a browser. Keep Puppeteer actions in `AirMenusRushBooker`, with dependency injection for tests.

**Tech Stack:** Node.js CommonJS, commander, moment, Puppeteer, Jest, built-in `https`/`URL`.

## Chunk 1: Core Rush Utilities

### Task 1: Venue Profiles And Release Timing

**Files:**
- Create: `src/venues/airmenusVenues.js`
- Create: `src/utils/rushReleaseTiming.js`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that `getVenueProfile('naru')` and `getVenueProfile('guerilla')` return required AirMenus names/URLs, that Naru derives Monday 8:00 PM Asia/Kolkata for the booking week, and that Guerilla throws without `--release-at`.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement minimal code**

Add venue profiles for:
- `naru`: `https://bookings.airmenus.in/eatnaru/order`, brand `eatnaru`, outlet `order`, default guests `2`, default release policy Monday 20:00 IST.
- `guerilla`: `https://bookings.airmenus.in/guerilladiner/order`, brand `guerilladiner`, outlet `order`, default guests `2`, release requires explicit override.

Implement `resolveReleaseAt({ venue, bookingDate, releaseAt, now })` with explicit override first, then Naru policy, then Guerilla failure.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for venue/release tests.

### Task 2: Contact Details Loader

**Files:**
- Create: `src/utils/bookingContactProfile.js`
- Modify: `.gitignore`
- Modify: `env.example`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that contact details load from `BOOKING_NAME`, `BOOKING_EMAIL`, and `BOOKING_PHONE`; that a named local profile can load from `.booking-profiles.local.json`; and that missing fields throw without accepting personal CLI flags.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because contact loader does not exist.

- [ ] **Step 3: Implement minimal code**

Create `loadBookingContact({ env, profileName, profilePath })`. Add `.booking-profiles.local.json` to `.gitignore`. Document `BOOKING_*` env vars in `env.example`.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for contact loader tests.

## Chunk 2: AirMenus Data And Polling

### Task 3: AirMenus API Client

**Files:**
- Create: `src/services/AirMenusApiClient.js`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that the client calls:
- `GET /restaurant/details/bookings/?rest_short_name=<brand>`
- `GET /reservations/config/<outlet_id>/`
- `GET /reservations/slot_group/remaining/paxs/?group_title=<title>&booking_dt=<date>&outlet_id=<id>`

Use an injected request function; do not call the live API in tests.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because API client does not exist.

- [ ] **Step 3: Implement minimal code**

Implement `getRestaurantDetails`, `resolveOutlet`, `getReservationConfig`, and `getSlotRemainingPax`. Use `https://apis.airmenus.in/api` as default base URL and support request injection.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for API client tests.

### Task 4: Slot Matching And Polling

**Files:**
- Create: `src/utils/airmenusSlotMatcher.js`
- Create: `src/utils/pollingScheduler.js`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that slot matching finds a date setting, group, and time from fixture-shaped config. Test that polling clamps interval to 250ms minimum, applies jitter, backs off for 429/5xx, stops at timeout, and returns the first available slot payload.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because matcher/poller do not exist.

- [ ] **Step 3: Implement minimal code**

Implement config helpers around AirMenus `setting` shape and `slot_groups[].available_times[]`. Implement `pollForAvailability` with injected clock/sleep/random for fast tests.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for slot matching and polling tests.

## Chunk 3: Browser Rush Flow And CLI

### Task 5: Rush Browser Driver

**Files:**
- Create: `src/services/AirMenusRushBooker.js`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that `runDryRun` prewarms the venue URL, polls availability, refreshes the page with cache busting after API detection, verifies the requested date/group/time in page context, and stops before final proceed. Test that payment/challenge detection leaves the browser open.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because rush browser driver does not exist.

- [ ] **Step 3: Implement minimal code**

Create `AirMenusRushBooker` with `init`, `prewarm`, `refreshAfterAvailability`, `verifyBrowserSlotState`, `driveToCheckout`, `fillCheckout`, `clickProceed`, `detectHandoffState`, and `close`. Use injected Puppeteer/API/poller for tests.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for browser driver tests.

### Task 6: Rush CLI

**Files:**
- Create: `src/rush-booker.js`
- Modify: `package.json`
- Test: `test/rush-mode.test.js`

- [ ] **Step 1: Write failing tests**

Test that `package.json` exposes `rush`, that CLI help includes `--venue`, `--release-at`, `--profile`, `--poll-ms`, `--tight-poll-window-ms`, and does not include `--name`, `--email`, or `--phone`.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: FAIL because script and CLI do not exist.

- [ ] **Step 3: Implement minimal code**

Add `npm run rush` pointing at `src/rush-booker.js`. Parse options, validate request, load contact, resolve release timing, instantiate `AirMenusRushBooker`, and run dry-run or live handoff mode.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS for CLI tests.

## Chunk 4: Final Verification

### Task 7: Whole Repo Checks

**Files:**
- Existing test and package files only.

- [ ] **Step 1: Run focused rush tests**

Run: `npm test -- --runTestsByPath test/rush-mode.test.js`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Run audit**

Run: `npm audit`

Expected: 0 vulnerabilities.

- [ ] **Step 5: Syntax-check new CLI**

Run: `node --check src/rush-booker.js`

Expected: no output and exit code 0.
