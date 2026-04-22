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
