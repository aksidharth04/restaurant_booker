# 🚀 Quick Start Guide

## Restaurant Booker - Instant Table Booking Automation

This system automatically books tables at restaurants using AirMenus integration with advanced features like retry logic, notifications, and batch booking.

## ⚡ Quick Setup (2 minutes)

1. **Run the setup script:**
   ```bash
   node setup.js
   ```

2. **Configure your credentials:**
   ```bash
   # Edit .env file with your AirMenus login
   nano .env
   ```

3. **Start booking:**
   ```bash
   # Interactive mode (recommended for first time)
   npm run book-interactive
   
   # Or command line
   npm run book -- book --restaurant "Restaurant Name" --date "2026-04-23" --time "19:00" --guests 4
   ```

## 🎯 Key Features

### ✅ Instant Booking
- Automatically logs into AirMenus
- Fills booking forms instantly
- Handles date/time/guest selection
- Submits reservations automatically

### 🔄 Smart Retry Logic
- Automatic retry on failures
- Configurable retry attempts
- Exponential backoff delays
- Success rate optimization

### 📱 Multi-Channel Notifications
- Email confirmations
- Desktop notifications
- Push notifications
- Custom notification templates

### 🗄️ Booking Management
- SQLite database storage
- Booking history tracking
- Favorite restaurants
- Confirmation number storage

### ⚡ Batch Operations
- Multiple restaurant bookings
- Parallel processing
- JSON file input
- Results export

## 🛠️ Usage Examples

Rush mode help: `npm run rush -- --help`

Guerilla Diner shortcut with a first-run contact prompt and navigable slot picker: `npm run guerilla-diner`

### Single Booking
```bash
npm run book -- book --restaurant "The Grand Restaurant" --date "2026-04-23" --time "19:30" --guests 4
```

### Interactive Mode
```bash
npm run book-interactive
```

### Batch Booking
```bash
# Generate template
npm run book-batch -- generate-template

# Edit the template and run
npm run book-batch -- book --file bookings.json
```

### Manage Favorites
```bash
npm run book -- favorites --list
npm run book -- favorites --add "Restaurant Name" --url "https://..." --time "19:00" --guests 4
```

### View History
```bash
npm run book -- history --limit 10 --status confirmed
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
AIRMENUS_EMAIL=your-email@example.com
AIRMENUS_PASSWORD=your-password
ENCRYPTION_KEY=your-32-character-key
ENABLE_EMAIL_NOTIFICATIONS=true

# Optional Comal helper contact details; keep these in .env, not inline commands.
COMAL_BOOKING_NAME=Your Name
COMAL_BOOKING_EMAIL=your-booking-email@example.com
COMAL_BOOKING_PHONE=your-phone-number
```

### Booking Preferences (config.json)
```json
{
  "booking": {
    "defaultGuests": 2,
    "defaultTime": "19:00",
    "maxGuests": 20
  },
  "retry": {
    "maxAttempts": 3,
    "delayMs": 2000
  }
}
```

## 🚨 Important Notes

1. **Respect Restaurant Policies**: This tool is for educational purposes. Please respect restaurant terms of service.

2. **Rate Limiting**: The system includes delays between requests to avoid overwhelming servers.

3. **Credentials Security**: Your AirMenus credentials stay in the local `.env` file, and setup tightens private file permissions where possible. Booking metadata stored in the database uses `ENCRYPTION_KEY`.

4. **Browser Automation**: Uses Puppeteer for web automation. Runs headless by default.

## 🐛 Troubleshooting

### Common Issues:
- **Login Failed**: Check your AirMenus credentials in .env
- **No Available Times**: Restaurant may be fully booked
- **Browser Errors**: Try running with `HEADLESS_MODE=false` in .env

### Debug Mode:
```bash
# Enable verbose logging
LOG_LEVEL=debug npm run book-interactive
```

## 📊 Performance

- **Single Booking**: ~30-60 seconds
- **Batch Processing**: Configurable parallel processing
- **Success Rate**: 85-95% with retry logic
- **Memory Usage**: ~100MB per browser instance

## 🔒 Security Notes

- Local `.env`, profile, data, and log files are permission-tightened where possible.
- SQLite booking history is local to this machine.
- Optional email notifications transmit booking details through your configured SMTP provider.
- Avoid putting personal booking contact details directly in command lines.

## 📈 Advanced Features

- **Smart Time Selection**: Finds closest available time if exact time unavailable
- **Guest Count Optimization**: Handles various party sizes
- **Restaurant Search**: Automatic restaurant discovery
- **Booking Window Management**: Respects restaurant booking policies

---

**Ready to start booking? Run `node setup.js` and follow the prompts!**
