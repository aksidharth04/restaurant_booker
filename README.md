# Restaurant Booker

Automated restaurant table booking utilities for AirMenus-powered booking pages.

This is a Node.js CLI project. It uses Puppeteer for browser automation, SQLite for local booking history, local encrypted configuration for sensitive values, and optional email or desktop notifications after booking attempts.

## Features

- Interactive booking flow for first-time use
- Command-line booking for repeatable bookings
- Batch booking from a JSON file
- Favorite restaurant management
- Local booking history in SQLite
- Retry logic with configurable backoff
- Optional email, push, and desktop notifications
- Comal-specific helper scripts for direct AirMenus booking flows

## Requirements

- Node.js 16 or newer
- npm
- AirMenus account credentials

Puppeteer downloads and runs a Chromium browser during setup/install. On some machines this can take a few minutes.

## Setup

Install dependencies:

```bash
npm install
```

Create local config files:

```bash
node setup.js
```

Edit `.env` with your AirMenus credentials and local settings:

```bash
AIRMENUS_EMAIL=your-email@example.com
AIRMENUS_PASSWORD=your-password
ENCRYPTION_KEY=your-32-character-encryption-key-here
ENABLE_EMAIL_NOTIFICATIONS=true
```

Review `config.json` for booking defaults, retry behavior, browser settings, and favorite restaurants.

## Usage

Interactive booking:

```bash
npm run book-interactive
```

Single booking:

```bash
npm run book -- book \
  --restaurant "Restaurant Name" \
  --date "2026-04-23" \
  --time "19:00" \
  --guests 4
```

Single booking with a direct restaurant URL:

```bash
npm run book -- book \
  --restaurant "Comal" \
  --url "https://bookings.airmenus.in/comal/order" \
  --date "2026-04-23" \
  --time "19:00" \
  --guests 2
```

Batch booking:

```bash
npm run book-batch -- generate-template
npm run book-batch -- book --file bookings.json
```

Favorites:

```bash
npm run book -- favorites --list
npm run book -- favorites --add "Restaurant Name" --url "https://..." --time "19:00" --guests 4
```

History:

```bash
npm run book -- history --limit 10
npm run book -- history --status confirmed
```

Comal helper scripts:

```bash
COMAL_BOOKING_NAME="Your Name" \
COMAL_BOOKING_EMAIL="your-booking-email@example.com" \
COMAL_BOOKING_PHONE="your-phone-number" \
node book_comal_manual.js

node book_comal_simple.js
node book_comal_final.js
node book_comal_robust.js
```

The Comal scripts read contact details from `COMAL_BOOKING_NAME`, `COMAL_BOOKING_EMAIL`, and `COMAL_BOOKING_PHONE`; they do not store personal booking details in source.

AirMenus rush mode for Guerilla Diner or Naru:

Create a local-only contact profile first:

```bash
cp .booking-profiles.local.example.json .booking-profiles.local.json
```

Edit `.booking-profiles.local.json` with the contact details AirMenus should use. The local file is gitignored; only the placeholder example is committed. You can also skip this manual step: the first live `npm run guerilla-diner` run prompts for booking name, email, and phone, saves them to `.booking-profiles.local.json`, and future runs reuse that saved profile without asking again.

Use the tested Guerilla Diner shortcut:

```bash
npm run guerilla-diner
```

By default, the shortcut checks live AirMenus availability for the configured date and opens an arrow-key slot picker in the terminal. Press Up/Down to choose a slot, then Enter to continue into the fast booking flow.

For a dry run, use:

```bash
GUERILLA_DRY_RUN=true npm run guerilla-diner
```

To skip the slot picker, pass the time explicitly:

```bash
npm run guerilla-diner -- --time 17:00
```

Override the target without rewriting the command:

```bash
GUERILLA_DATE=2026-04-24 \
GUERILLA_GUESTS=1 \
GUERILLA_RELEASE_AT="2026-04-22 20:00 Asia/Kolkata" \
npm run guerilla-diner
```

The full equivalent rush command is:

```bash
npm run rush -- \
  --venue guerilla \
  --date 2026-04-24 \
  --time 17:00 \
  --guests 1 \
  --group-title "Bench Seats" \
  --release-at "2026-04-22 20:00 Asia/Kolkata" \
  --profile sidharth \
  --headed \
  --timeout-ms 12000 \
  --poll-ms 500 \
  --handoff-timeout-ms 45000 \
  --timing
```

Store rush-mode contact details in `.booking-profiles.local.json` or `BOOKING_NAME`, `BOOKING_EMAIL`, and `BOOKING_PHONE`; do not pass personal details on the command line. In a live Guerilla Diner run for the 2026-04-24 17:00 slot, this command reached the payment/UPI handoff in 3,877 ms.

## Project Structure

```text
.
├── src/
│   ├── booker.js                 # Main CLI commands
│   ├── interactive.js            # Guided interactive flow
│   ├── batch-booker.js           # Batch booking CLI
│   ├── config/                   # Environment and JSON config loader
│   ├── models/                   # SQLite booking model
│   ├── services/                 # AirMenus automation and notifications
│   └── utils/                    # Logging helpers
├── test/                         # Jest tests
├── book_comal*.js                # Comal-specific helper scripts
├── config.example.json           # Example app config
├── env.example                   # Example environment file
├── setup.js                      # Local setup helper
└── QUICK_START.md                # Short usage guide
```

## Configuration

Local environment variables live in `.env`:

```bash
AIRMENUS_EMAIL=your-email@example.com
AIRMENUS_PASSWORD=your-password
DATABASE_PATH=./data/bookings.db
ENCRYPTION_KEY=your-32-character-encryption-key-here
HEADLESS_MODE=true
LOG_LEVEL=info
```

Booking preferences live in `config.json`:

```json
{
  "booking": {
    "defaultGuests": 2,
    "defaultTime": "19:00",
    "bookingWindowDays": 30
  },
  "retry": {
    "maxAttempts": 3,
    "delayMs": 2000,
    "backoffMultiplier": 1.5
  }
}
```

## Development

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

## Security Notes

- Do not commit `.env`.
- Use a unique `ENCRYPTION_KEY` with at least 32 characters.
- Booking history is stored locally in SQLite.
- Respect restaurant and AirMenus terms when using browser automation.

## Repository

GitHub: https://github.com/aksidharth04/restaurant_booker

## License

MIT
