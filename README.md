# Restaurant Booker

An automated restaurant table booking system that can instantly reserve tables at restaurants using AirMenus integration.

## Features

- 🚀 **Instant Booking**: Automatically book tables at your favorite restaurants
- 📅 **Flexible Scheduling**: Book for any date and time
- 👥 **Party Size Support**: Handle bookings for 1-20+ people
- 🔄 **Retry Logic**: Automatic retry if initial booking fails
- 📱 **Notifications**: Get notified when booking is confirmed
- 🗄️ **Booking History**: Track all your past and upcoming reservations
- ⚡ **Fast Execution**: Optimized for speed and reliability
- 🔒 **Secure**: Encrypted storage of sensitive information

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Chrome/Chromium browser (for web automation)
- Valid AirMenus account

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd restaurant_booker
```

2. Install dependencies:
```bash
npm install
```

3. Configure your settings:
```bash
cp config.example.json config.json
# Edit config.json with your preferences
```

4. Set up environment variables:
```bash
cp .env.example .env
# Add your AirMenus credentials and other sensitive data
```

## Usage

### Quick Booking
```bash
npm run book -- --restaurant "Restaurant Name" --date "2024-01-15" --time "19:00" --guests 4
```

### Interactive Mode
```bash
npm run book-interactive
```

### Batch Booking
```bash
npm run book-batch -- --file bookings.json
```

## Configuration

Edit `config.json` to customize:
- Default booking preferences
- Retry settings
- Notification preferences
- Favorite restaurants

## Supported Restaurants

The system works with restaurants that use AirMenus for their booking system. Popular chains and local restaurants are supported.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This tool is for educational purposes. Please respect restaurant policies and terms of service when using automated booking systems.
