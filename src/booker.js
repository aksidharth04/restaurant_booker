#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const moment = require('moment');
const config = require('./config');
const logger = require('./utils/logger');
const BookingModel = require('./models/Booking');
const AirMenusBooker = require('./services/AirMenusBooker');
const NotificationService = require('./services/NotificationService');

class RestaurantBooker {
  constructor(options = {}) {
    this.booker = options.booker || new AirMenusBooker();

    if (options.autoParse !== false) {
      this.setupCLI();
    }
  }

  setupCLI() {
    const program = new Command();

    program
      .name('restaurant-booker')
      .description('Automated restaurant table booking system')
      .version('1.0.0');

    program
      .command('book')
      .description('Book a table at a restaurant')
      .requiredOption('-r, --restaurant <name>', 'Restaurant name')
      .option('-u, --url <url>', 'Direct restaurant URL')
      .option('-d, --date <date>', 'Booking date (YYYY-MM-DD)', this.getDefaultDate())
      .option('-t, --time <time>', 'Booking time (HH:MM)', config.getBookingConfig().defaultTime)
      .option('-g, --guests <number>', 'Number of guests', config.getBookingConfig().defaultGuests.toString())
      .option('--no-retry', 'Disable retry logic')
      .option('--no-notifications', 'Disable notifications')
      .action(async (options) => {
        await this.bookTable(options);
      });

    program
      .command('favorites')
      .description('Manage favorite restaurants')
      .option('-l, --list', 'List all favorites')
      .option('-a, --add <name>', 'Add a new favorite')
      .option('-u, --url <url>', 'Restaurant URL (required with --add)')
      .option('-t, --time <time>', 'Preferred time (required with --add)')
      .option('-g, --guests <number>', 'Preferred guests (required with --add)')
      .option('-d, --delete <id>', 'Delete favorite by ID')
      .action(async (options) => {
        await this.manageFavorites(options);
      });

    program
      .command('history')
      .description('View booking history')
      .option('-l, --limit <number>', 'Number of bookings to show', '10')
      .option('-s, --status <status>', 'Filter by status (pending, confirmed, failed)')
      .action(async (options) => {
        await this.showHistory(options);
      });

    program.parse();
  }

  getDefaultDate() {
    return moment().add(1, 'day').format('YYYY-MM-DD');
  }

  async bookTable(options) {
    const spinner = ora('Initializing booking system...').start();
    
    try {
      // Validate configuration
      config.validate();
      spinner.text = 'Configuration validated';

      // Prepare booking data
      const bookingData = {
        restaurantName: options.restaurant,
        restaurantUrl: options.url,
        date: options.date,
        time: options.time,
        guests: this.parseGuestCount(options.guests)
      };

      // Validate booking data
      this.validateBookingData(bookingData);
      spinner.text = 'Booking data validated';

      // Create booking record
      const bookingRecord = await BookingModel.create(bookingData);
      spinner.text = 'Booking record created';

      // Attempt booking with retry logic
      const result = await this.attemptBooking(bookingData, options.retry, spinner);

      // Update booking status
      if (result.success) {
        await BookingModel.updateStatus(bookingRecord.id, 'confirmed', result.confirmationNumber);
        spinner.succeed(chalk.green('Booking successful!'));
        
        if (options.notifications !== false) {
          await NotificationService.sendBookingSuccess({
            ...bookingData,
            confirmationNumber: result.confirmationNumber
          });
        }

        this.displaySuccessMessage(bookingData, result.confirmationNumber);
      } else {
        await BookingModel.updateStatus(bookingRecord.id, 'failed');
        spinner.fail(chalk.red('Booking failed'));
        
        if (options.notifications !== false) {
          await NotificationService.sendBookingFailure(bookingData, result.error);
        }
      }

    } catch (error) {
      spinner.fail(chalk.red('Booking failed'));
      logger.error('Booking process failed', { error: error.message, stack: error.stack });
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    } finally {
      await this.booker.close();
    }
  }

  validateBookingData(bookingData) {
    const { restaurantName, date, time, guests } = bookingData;

    if (!restaurantName || restaurantName.trim().length === 0) {
      throw new Error('Restaurant name is required');
    }

    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    if (!moment(time, 'HH:mm', true).isValid()) {
      throw new Error('Invalid time format. Use HH:MM');
    }

    bookingData.guests = this.parseGuestCount(guests);

    if (bookingData.guests < 1 || bookingData.guests > config.getBookingConfig().maxGuests) {
      throw new Error(`Number of guests must be between 1 and ${config.getBookingConfig().maxGuests}`);
    }

    const bookingDate = moment(date);
    const today = moment().startOf('day');
    
    if (bookingDate.isBefore(today)) {
      throw new Error('Cannot book for past dates');
    }

    const maxBookingDate = moment().add(config.getBookingConfig().bookingWindowDays, 'days');
    if (bookingDate.isAfter(maxBookingDate)) {
      throw new Error(`Cannot book more than ${config.getBookingConfig().bookingWindowDays} days in advance`);
    }
  }

  parseGuestCount(value) {
    const maxGuests = config.getBookingConfig().maxGuests;
    let guests;

    if (typeof value === 'number') {
      guests = value;
    } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      guests = Number(value.trim());
    } else {
      throw new Error(`Number of guests must be a whole number between 1 and ${maxGuests}`);
    }

    if (!Number.isSafeInteger(guests) || guests < 1 || guests > maxGuests) {
      throw new Error(`Number of guests must be a whole number between 1 and ${maxGuests}`);
    }

    return guests;
  }

  async attemptBooking(bookingData, retryEnabled, spinner) {
    const retryConfig = config.getRetryConfig();
    const maxAttempts = retryEnabled ? retryConfig.maxAttempts : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        spinner.text = `Attempting booking (${attempt}/${maxAttempts})...`;
        
        if (attempt > 1) {
          logger.retryAttempt(attempt, maxAttempts, bookingData.restaurantName);
          const delay = retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await this.booker.bookTable(bookingData);
        return result;

      } catch (error) {
        lastError = error;
        logger.error(`Booking attempt ${attempt} failed`, { 
          error: error.message,
          attempt,
          maxAttempts 
        });

        if (attempt < maxAttempts) {
          spinner.text = `Attempt ${attempt} failed, retrying...`;
        }
      }
    }

    return {
      success: false,
      error: lastError
    };
  }

  displaySuccessMessage(bookingData, confirmationNumber) {
    console.log('\n' + chalk.green('🎉 Booking Confirmed!'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`📍 Restaurant: ${chalk.bold(bookingData.restaurantName)}`));
    console.log(chalk.white(`📅 Date: ${chalk.bold(bookingData.date)}`));
    console.log(chalk.white(`🕐 Time: ${chalk.bold(bookingData.time)}`));
    console.log(chalk.white(`👥 Guests: ${chalk.bold(bookingData.guests)}`));
    if (confirmationNumber) {
      console.log(chalk.white(`🔢 Confirmation: ${chalk.bold(confirmationNumber)}`));
    }
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.gray('You will receive a confirmation email shortly.'));
  }

  async manageFavorites(options) {
    try {
      if (options.list) {
        await this.listFavorites();
      } else if (options.add) {
        await this.addFavorite(options);
      } else if (options.delete) {
        await this.deleteFavorite(options.delete);
      } else {
        console.log(chalk.yellow('Use --list to view favorites, --add to add new, or --delete to remove'));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  }

  async listFavorites() {
    const favorites = await BookingModel.getFavorites();
    
    if (favorites.length === 0) {
      console.log(chalk.yellow('No favorites found.'));
      return;
    }

    console.log(chalk.cyan('\n📋 Your Favorite Restaurants'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    favorites.forEach((favorite, index) => {
      console.log(chalk.white(`${index + 1}. ${chalk.bold(favorite.name)}`));
      console.log(chalk.gray(`   URL: ${favorite.url}`));
      console.log(chalk.gray(`   Preferred: ${favorite.preferred_time} for ${favorite.preferred_guests} guests`));
      console.log(chalk.gray(`   ID: ${favorite.id}`));
      console.log('');
    });
  }

  async addFavorite(options) {
    if (!options.url || !options.time || !options.guests) {
      throw new Error('URL, time, and guests are required when adding a favorite');
    }

    const favoriteData = {
      name: options.add,
      url: options.url,
      preferredTime: options.time,
      preferredGuests: this.parseGuestCount(options.guests)
    };

    await BookingModel.addFavorite(favoriteData);
    console.log(chalk.green(`✅ Added "${options.add}" to favorites`));
  }

  async deleteFavorite(id) {
    await BookingModel.deleteFavorite(id);
    console.log(chalk.green(`✅ Deleted favorite with ID ${id}`));
  }

  async showHistory(options) {
    try {
      const limit = parseInt(options.limit);
      let bookings;

      if (options.status) {
        bookings = await BookingModel.getByStatus(options.status, limit);
      } else {
        bookings = await BookingModel.getAll(limit);
      }

      if (bookings.length === 0) {
        console.log(chalk.yellow('No bookings found.'));
        return;
      }

      console.log(chalk.cyan('\n📚 Booking History'));
      console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      
      bookings.forEach((booking, index) => {
        const statusColor = booking.status === 'confirmed' ? 'green' : 
                           booking.status === 'failed' ? 'red' : 'yellow';
        
        console.log(chalk.white(`${index + 1}. ${chalk.bold(booking.restaurant_name)}`));
        console.log(chalk.gray(`   Date: ${booking.booking_date} at ${booking.booking_time}`));
        console.log(chalk.gray(`   Guests: ${booking.guests}`));
        console.log(chalk[statusColor](`   Status: ${booking.status.toUpperCase()}`));
        if (booking.confirmation_number) {
          console.log(chalk.gray(`   Confirmation: ${booking.confirmation_number}`));
        }
        console.log(chalk.gray(`   Created: ${booking.created_at}`));
        console.log('');
      });

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new RestaurantBooker();
}

module.exports = RestaurantBooker;
