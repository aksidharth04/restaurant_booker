#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment');
const config = require('./config');
const logger = require('./utils/logger');
const BookingModel = require('./models/Booking');
const AirMenusBooker = require('./services/AirMenusBooker');
const NotificationService = require('./services/NotificationService');

class BatchBooker {
  constructor(options = {}) {
    this.config = options.config || config;
    this.bookingModel = options.bookingModel || BookingModel;
    this.notificationService = options.notificationService || NotificationService;
    this.bookerFactory = options.bookerFactory || (() => new AirMenusBooker());
    this.spinnerFactory = options.spinnerFactory || ((text) => require('ora')(text).start());

    if (options.autoParse !== false) {
      this.setupCLI();
    }
  }

  setupCLI() {
    const program = new Command();

    program
      .name('batch-booker')
      .description('Batch restaurant table booking system')
      .version('1.0.0');

    program
      .command('book')
      .description('Book multiple tables from a JSON file')
      .requiredOption('-f, --file <path>', 'Path to JSON file with booking data')
      .option('--parallel <number>', 'Number of parallel bookings', '1')
      .option('--delay <ms>', 'Delay between bookings in milliseconds', '5000')
      .option('--no-retry', 'Disable retry logic')
      .option('--no-notifications', 'Disable notifications')
      .action(async (options) => {
        await this.batchBook(options);
      });

    program
      .command('generate-template')
      .description('Generate a template JSON file for batch booking')
      .option('-o, --output <path>', 'Output file path', 'bookings-template.json')
      .action(async (options) => {
        await this.generateTemplate(options);
      });

    program.parse();
  }

  async batchBook(options) {
    const spinner = this.spinnerFactory('Loading booking data...');
    
    try {
      // Validate configuration
      this.config.validate();
      spinner.text = 'Configuration validated';

      // Load and validate booking data
      const bookings = await this.loadBookings(options.file);
      spinner.text = `Loaded ${bookings.length} bookings`;

      // Validate all bookings
      this.validateBookings(bookings);
      spinner.text = 'All bookings validated';

      // Process bookings
      const results = await this.processBookings(bookings, options, spinner);

      // Display results
      this.displayResults(results);

    } catch (error) {
      spinner.fail(chalk.red('Batch booking failed'));
      logger.error('Batch booking process failed', { error: error.message, stack: error.stack });
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  }

  async loadBookings(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      const bookings = JSON.parse(fileContent);

      if (!Array.isArray(bookings)) {
        throw new Error('JSON file must contain an array of booking objects');
      }

      return bookings;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in file: ${filePath}`);
      }
      throw error;
    }
  }

  validateBookings(bookings) {
    const errors = [];

    bookings.forEach((booking, index) => {
      try {
        this.validateSingleBooking(booking);
      } catch (error) {
        errors.push(`Booking ${index + 1}: ${error.message}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join('\n')}`);
    }
  }

  validateSingleBooking(booking) {
    const required = ['restaurantName', 'date', 'time', 'guests'];
    const missing = required.filter(field => !booking[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (!moment(booking.date, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    if (!moment(booking.time, 'HH:mm', true).isValid()) {
      throw new Error('Invalid time format. Use HH:MM');
    }

    if (booking.guests < 1 || booking.guests > this.config.getBookingConfig().maxGuests) {
      throw new Error(`Number of guests must be between 1 and ${this.config.getBookingConfig().maxGuests}`);
    }

    const bookingDate = moment(booking.date);
    const today = moment().startOf('day');
    
    if (bookingDate.isBefore(today)) {
      throw new Error('Cannot book for past dates');
    }

    const maxBookingDate = moment().add(this.config.getBookingConfig().bookingWindowDays, 'days');
    if (bookingDate.isAfter(maxBookingDate)) {
      throw new Error(`Cannot book more than ${this.config.getBookingConfig().bookingWindowDays} days in advance`);
    }
  }

  async processBookings(bookings, options, spinner) {
    const parallelLimit = Math.max(1, parseInt(options.parallel, 10) || 1);
    const delay = Math.max(0, parseInt(options.delay, 10) || 0);
    const results = {
      successful: [],
      failed: [],
      total: bookings.length
    };

    spinner.text = `Processing ${bookings.length} bookings (${parallelLimit} parallel, ${delay}ms delay)...`;

    // Process bookings in batches
    for (let i = 0; i < bookings.length; i += parallelLimit) {
      const batch = bookings.slice(i, i + parallelLimit);
      const batchPromises = batch.map(booking => this.processSingleBooking(booking, options));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, batchIndex) => {
        const bookingIndex = i + batchIndex;
        const booking = bookings[bookingIndex];
        
        if (result.status === 'fulfilled' && result.value.success) {
          results.successful.push({
            ...booking,
            confirmationNumber: result.value.confirmationNumber
          });
        } else {
          results.failed.push({
            ...booking,
            error: result.value?.error || result.reason?.message || 'Unknown error'
          });
        }
      });

      // Update progress
      const processed = Math.min(i + parallelLimit, bookings.length);
      spinner.text = `Processed ${processed}/${bookings.length} bookings...`;

      // Delay between batches (except for the last batch)
      if (i + parallelLimit < bookings.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  async processSingleBooking(bookingData, options) {
    const booker = this.bookerFactory();

    try {
      // Create booking record
      const bookingRecord = await this.bookingModel.create(bookingData);
      await booker.init();
      await booker.login();

      // Attempt booking with retry logic
      const retryConfig = this.config.getRetryConfig();
      const maxAttempts = options.retry !== false ? retryConfig.maxAttempts : 1;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt > 1) {
            logger.retryAttempt(attempt, maxAttempts, bookingData.restaurantName);
            const delay = retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const result = await booker.bookTable(bookingData);
          
          // Success!
          await this.bookingModel.updateStatus(bookingRecord.id, 'confirmed', result.confirmationNumber);
          
          logger.bookingSuccess(result.confirmationNumber, bookingData.restaurantName, bookingData.date, bookingData.time, bookingData.guests);
          
          // Send notification if enabled
          if (options.notifications !== false) {
            await this.notificationService.sendBookingSuccess({
              ...bookingData,
              confirmationNumber: result.confirmationNumber
            });
          }

          return {
            success: true,
            confirmationNumber: result.confirmationNumber
          };

        } catch (error) {
          lastError = error;
          logger.error(`Booking attempt ${attempt} failed`, { 
            error: error.message,
            attempt,
            maxAttempts,
            bookingData 
          });
        }
      }

      // All attempts failed
      await this.bookingModel.updateStatus(bookingRecord.id, 'failed');
      logger.bookingFailed(bookingData.restaurantName, bookingData.date, bookingData.time, bookingData.guests, lastError);
      
      if (options.notifications !== false) {
        await this.notificationService.sendBookingFailure(bookingData, lastError);
      }

      throw lastError;

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await booker.close();
    }
  }

  displayResults(results) {
    console.log('\n' + chalk.cyan('📊 Batch Booking Results'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`Total Bookings: ${chalk.bold(results.total)}`));
    console.log(chalk.green(`✅ Successful: ${chalk.bold(results.successful.length)}`));
    console.log(chalk.red(`❌ Failed: ${chalk.bold(results.failed.length)}`));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    if (results.successful.length > 0) {
      console.log(chalk.green('\n🎉 Successful Bookings:'));
      results.successful.forEach((booking, index) => {
        console.log(chalk.white(`${index + 1}. ${chalk.bold(booking.restaurantName)}`));
        console.log(chalk.gray(`   Date: ${booking.date} at ${booking.time}`));
        console.log(chalk.gray(`   Guests: ${booking.guests}`));
        console.log(chalk.green(`   Confirmation: ${booking.confirmationNumber}`));
        console.log('');
      });
    }

    if (results.failed.length > 0) {
      console.log(chalk.red('\n❌ Failed Bookings:'));
      results.failed.forEach((booking, index) => {
        console.log(chalk.white(`${index + 1}. ${chalk.bold(booking.restaurantName)}`));
        console.log(chalk.gray(`   Date: ${booking.date} at ${booking.time}`));
        console.log(chalk.gray(`   Guests: ${booking.guests}`));
        console.log(chalk.red(`   Error: ${booking.error}`));
        console.log('');
      });
    }

    // Save results to file
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const resultsFile = `batch-results-${timestamp}.json`;
    
    const resultsData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length
      },
      successful: results.successful,
      failed: results.failed
    };

    fs.writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));
    console.log(chalk.gray(`\nResults saved to: ${resultsFile}`));
  }

  async generateTemplate(options) {
    const template = [
      {
        "restaurantName": "Example Restaurant",
        "restaurantUrl": "https://airmenus.com/restaurant/example",
        "date": moment().add(1, 'day').format('YYYY-MM-DD'),
        "time": "19:00",
        "guests": 4,
        "notes": "Optional notes about this booking"
      },
      {
        "restaurantName": "Another Restaurant",
        "restaurantUrl": "https://airmenus.com/restaurant/another",
        "date": moment().add(2, 'days').format('YYYY-MM-DD'),
        "time": "20:00",
        "guests": 2
      }
    ];

    try {
      fs.writeFileSync(options.output, JSON.stringify(template, null, 2));
      console.log(chalk.green(`✅ Template generated: ${options.output}`));
      console.log(chalk.gray('\nEdit the file with your booking details and run:'));
      console.log(chalk.cyan(`npm run book-batch -- book --file ${options.output}`));
    } catch (error) {
      console.error(chalk.red(`Error generating template: ${error.message}`));
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new BatchBooker();
}

module.exports = BatchBooker;
