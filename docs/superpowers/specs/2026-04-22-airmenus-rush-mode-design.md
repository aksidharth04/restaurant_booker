# AirMenus Rush Mode Design

Generated: 2026-04-22
Scope: Naru Noodle Bar and Guerilla Diner only
Status: Approved direction, implementation pending

## Goal

Build a rush-mode booking flow for AirMenus reservation pages that does everything up to payment or a visible challenge as fast as possible. The first live smoke target is Guerilla Diner because it uses the same AirMenus booking shell as Naru.

The success target is sub-60 seconds from slot availability to final handoff, assuming AirMenus responds normally and no external payment or visible CAPTCHA challenge blocks progress.

## Non-Goals

- Do not implement NĀVU/District in this phase.
- Do not implement Pizza 4P's/TableCheck in this phase.
- Do not bypass CAPTCHA, payment, OTP, or platform security controls.
- Do not attempt resale, third-party concierge behavior, or booking for unknown users.
- Do not build a general restaurant marketplace bot.

## Source Findings

- Naru's official reservation notes say online bookings open Mondays at 8:00 PM, lunch slots are 12:30 PM, 2:30 PM, and 4:30 PM, dinner slots are 6:30 PM and 8:30 PM, and reservations are online-only with no walk-ins or phone bookings: https://www.narunoodlebar.com/menu
- Naru links reservation traffic to AirMenus: https://bookings.airmenus.in/eatnaru/order
- Guerilla Diner uses the same AirMenus exported Next.js booking page shape: https://bookings.airmenus.in/guerilladiner/order
- AirMenus documents itself as a browser-based web app with no guest app download, online payments through Razorpay, and customer/order handling through its platform: https://about.airmenus.in/faq
- The AirMenus booking bundle exposes shared endpoints for restaurant lookup, reservation config, slot remaining pax, recaptcha verification, customer details, booking creation, booking status, cancellation, and payment verification.

## Architecture

Add a dedicated rush path instead of extending the current generic `AirMenusBooker` selector flow.

Modules:

- `src/venues/airmenusVenues.js`
  - Defines `naru` and `guerilla` venue profiles.
  - Stores AirMenus URL, brand short name, outlet short name, preferred release timing, default slots, and default guest count.

- `src/services/AirMenusApiClient.js`
  - Wraps read-only AirMenus discovery endpoints.
  - Fetches restaurant details by brand short name.
  - Resolves the target outlet by outlet short name.
  - Fetches reservation config by outlet ID.
  - Fetches remaining pax for a group/date/time combination.
  - Does not create bookings in V1 except through the browser-driven checkout flow.

- `src/services/AirMenusRushBooker.js`
  - Owns one persistent Puppeteer browser/page for the whole rush session.
  - Prewarms the AirMenus page before release.
  - Polls availability through `AirMenusApiClient`.
  - Drives the browser through date, slot group, time, guest count, contact details, rules checkbox, and final `PROCEED`.
  - Stops and alerts when payment, Razorpay, OTP, or a visible challenge appears.

- `src/rush-booker.js`
  - CLI entrypoint.
  - Runs one rush attempt for one venue and request.

## CLI

Initial commands:

```bash
npm run rush -- --venue guerilla --date 2026-04-23 --time 19:00 --guests 2
npm run rush -- --venue naru --date 2026-04-27 --time 20:30 --guests 2
```

Useful options:

- `--venue <naru|guerilla>`
- `--date <YYYY-MM-DD>`
- `--time <HH:mm>`
- `--guests <number>`
- `--name <value>` or `BOOKING_NAME`
- `--email <value>` or `BOOKING_EMAIL`
- `--phone <value>` or `BOOKING_PHONE`
- `--prewarm-ms <number>` default 180000
- `--poll-ms <number>` default 500
- `--timeout-ms <number>` default 60000
- `--dry-run` to discover and stop before clicking final proceed

## Data Flow

1. Parse the venue profile and booking request.
2. Validate date, time, guests, and contact details.
3. Resolve the AirMenus outlet:
   - `restaurant/details/bookings/?rest_short_name=<brand>`
   - choose outlet by `<outlet_short_name>`
4. Fetch reservation config:
   - `reservations/config/<outlet_id>/`
5. Find a matching slot group and date.
6. Prewarm a browser page at the venue booking URL.
7. Poll slot remaining pax until a desired slot is available or timeout expires.
8. Drive the browser:
   - select date
   - select group
   - select time
   - select guest count
   - fill name/email/mobile
   - accept house rules/cancellation policy
   - click `PROCEED`
9. If booking status appears, record success details.
10. If Razorpay/payment/visible challenge appears, stop timer, alert, and leave browser open.

## Timing Design

The fast path avoids cold starts:

- Browser starts before release.
- AirMenus config is fetched before release.
- The page is loaded before release.
- Availability polling runs near release.
- Browser actions use stable text/role selectors plus AirMenus-specific CSS fallbacks.
- Progress is timestamped at each stage to show whether the internal path meets the one-minute budget.

Target internal timings:

- Config resolution: before release
- Slot detection after availability appears: under 1 second
- Browser slot/date/guest selection: under 10 seconds
- Checkout form fill and proceed click: under 10 seconds
- Total after availability appears: ideally under 20 seconds, hard goal under 60 seconds

## Error Handling

- If venue config cannot be resolved, fail before the release window.
- If no matching slot group exists, print available groups/times and exit.
- If slot remains sold out until timeout, exit with no booking attempt.
- If final checkout says seats are unavailable, return to polling until timeout.
- If payment or challenge appears, leave the browser open and play/send a loud notification.
- If the browser crashes, log the last successful phase and save a screenshot if possible.

## Testing

Unit tests:

- URL parser extracts brand and outlet short names.
- Venue profiles validate required fields.
- AirMenus API client calls the expected endpoints.
- Config parser finds valid dates, groups, and times from fixture JSON.
- Rush booker stops before final proceed in `--dry-run`.
- Rush booker does not bypass payment/challenge states.

Integration-style tests with fixtures:

- Naru-like config with Monday release and dinner slots.
- Guerilla-like config with the same AirMenus page flow.
- Sold-out slot response.
- Slot becomes available after polling.
- Checkout requires payment.

Manual smoke:

- Run `--dry-run` against Guerilla Diner first.
- Then run a real Guerilla Diner attempt with manual payment handoff.
- Apply the same venue config shape to Naru after Guerilla works.

## Implementation Order

1. Commit current review-finding fixes or keep them as the local baseline.
2. Add venue profiles and request validation.
3. Add `AirMenusApiClient` with fixture-driven tests.
4. Add slot/date/group matching utilities with tests.
5. Add `AirMenusRushBooker` dry-run flow with browser prewarm.
6. Add checkout fill and proceed click.
7. Add loud handoff alerts and screenshots.
8. Run tests, lint, audit, and a Guerilla dry-run smoke.

## Open Risks

- AirMenus can change its bundle/endpoints without warning.
- reCAPTCHA may force a visible challenge.
- Razorpay/payment handoff time is outside the script's control.
- Venue rules and release windows can change.
- Full completion in under one minute depends on network latency and AirMenus response time, but the script should keep its own work well under that budget.
