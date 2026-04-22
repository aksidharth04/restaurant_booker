#!/usr/bin/env node

const inquirer = require('inquirer');
const chalk = require('chalk');
const moment = require('moment');
const config = require('./config');
const logger = require('./utils/logger');
const BookingModel = require('./models/Booking');
const AirMenusBooker = require('./services/AirMenusBooker');
const NotificationService = require('./services/NotificationService');

class InteractiveBooker {
  constructor() {
    this.booker = new AirMenusBooker();
  }

  async start() {
    console.log(chalk.cyan('🍽️  Welcome to Restaurant Booker!'));
    console.log(chalk.gray('Let\'s get you a table at your favorite restaurant.\n'));

    try {
      // Validate configuration
      config.validate();
      
      const choice = await this.showMainMenu();
      
      switch (choice.action) {
        case 'book':
          await this.bookTable();
          break;
        case 'favorites':
          await this.manageFavorites();
          break;
        case 'history':
          await this.showHistory();
          break;
        case 'exit':
          console.log(chalk.yellow('Goodbye! 👋'));
          process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    } finally {
      await this.booker.close();
    }
  }

  async showMainMenu() {
    return inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Book a table', value: 'book' },
          { name: 'Manage favorites', value: 'favorites' },
          { name: 'View booking history', value: 'history' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);
  }

  async bookTable() {
    console.log(chalk.cyan('\n📅 Let\'s book your table!\n'));

    // Check if user wants to use a favorite
    const useFavorite = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useFavorite',
        message: 'Would you like to use one of your favorite restaurants?',
        default: false
      }
    ]);

    let bookingData;

    if (useFavorite.useFavorite) {
      bookingData = await this.selectFromFavorites();
    } else {
      bookingData = await this.getBookingDetails();
    }

    // Confirm booking
    const confirm = await this.confirmBooking(bookingData);
    if (!confirm.confirm) {
      console.log(chalk.yellow('Booking cancelled.'));
      return;
    }

    // Attempt booking
    await this.attemptBooking(bookingData);
  }

  async selectFromFavorites() {
    const favorites = await BookingModel.getFavorites();
    
    if (favorites.length === 0) {
      console.log(chalk.yellow('No favorites found. Let\'s add some details manually.'));
      return await this.getBookingDetails();
    }

    const favoriteChoices = favorites.map(fav => ({
      name: `${fav.name} (${fav.preferred_time} for ${fav.preferred_guests} guests)`,
      value: fav
    }));

    const selectedFavorite = await inquirer.prompt([
      {
        type: 'list',
        name: 'favorite',
        message: 'Select a favorite restaurant:',
        choices: favoriteChoices
      }
    ]);

    // Get additional details
    const additionalDetails = await inquirer.prompt([
      {
        type: 'input',
        name: 'date',
        message: 'What date would you like to book?',
        default: moment().add(1, 'day').format('YYYY-MM-DD'),
        validate: (input) => {
          if (!moment(input, 'YYYY-MM-DD', true).isValid()) {
            return 'Please enter a valid date (YYYY-MM-DD)';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'time',
        message: 'What time would you like to book?',
        default: selectedFavorite.favorite.preferred_time,
        validate: (input) => {
          if (!moment(input, 'HH:mm', true).isValid()) {
            return 'Please enter a valid time (HH:MM)';
          }
          return true;
        }
      },
      {
        type: 'number',
        name: 'guests',
        message: 'How many guests?',
        default: selectedFavorite.favorite.preferred_guests,
        validate: (input) => {
          if (input < 1 || input > config.getBookingConfig().maxGuests) {
            return `Number of guests must be between 1 and ${config.getBookingConfig().maxGuests}`;
          }
          return true;
        }
      }
    ]);

    return {
      restaurantName: selectedFavorite.favorite.name,
      restaurantUrl: selectedFavorite.favorite.url,
      date: additionalDetails.date,
      time: additionalDetails.time,
      guests: additionalDetails.guests
    };
  }

  async getBookingDetails() {
    const questions = [
      {
        type: 'input',
        name: 'restaurantName',
        message: 'What\'s the name of the restaurant?',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Restaurant name is required';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'restaurantUrl',
        message: 'Do you have the direct restaurant URL? (optional)',
        default: ''
      },
      {
        type: 'input',
        name: 'date',
        message: 'What date would you like to book?',
        default: moment().add(1, 'day').format('YYYY-MM-DD'),
        validate: (input) => {
          if (!moment(input, 'YYYY-MM-DD', true).isValid()) {
            return 'Please enter a valid date (YYYY-MM-DD)';
          }
          const bookingDate = moment(input);
          const today = moment().startOf('day');
          
          if (bookingDate.isBefore(today)) {
            return 'Cannot book for past dates';
          }

          const maxBookingDate = moment().add(config.getBookingConfig().bookingWindowDays, 'days');
          if (bookingDate.isAfter(maxBookingDate)) {
            return `Cannot book more than ${config.getBookingConfig().bookingWindowDays} days in advance`;
          }
          
          return true;
        }
      },
      {
        type: 'input',
        name: 'time',
        message: 'What time would you like to book?',
        default: config.getBookingConfig().defaultTime,
        validate: (input) => {
          if (!moment(input, 'HH:mm', true).isValid()) {
            return 'Please enter a valid time (HH:MM)';
          }
          return true;
        }
      },
      {
        type: 'number',
        name: 'guests',
        message: 'How many guests?',
        default: config.getBookingConfig().defaultGuests,
        validate: (input) => {
          if (input < 1 || input > config.getBookingConfig().maxGuests) {
            return `Number of guests must be between 1 and ${config.getBookingConfig().maxGuests}`;
          }
          return true;
        }
      }
    ];

    const answers = await inquirer.prompt(questions);
    
    return {
      restaurantName: answers.restaurantName,
      restaurantUrl: answers.restaurantUrl || null,
      date: answers.date,
      time: answers.time,
      guests: answers.guests
    };
  }

  async confirmBooking(bookingData) {
    console.log(chalk.cyan('\n📋 Booking Summary'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`📍 Restaurant: ${chalk.bold(bookingData.restaurantName)}`));
    console.log(chalk.white(`📅 Date: ${chalk.bold(bookingData.date)}`));
    console.log(chalk.white(`🕐 Time: ${chalk.bold(bookingData.time)}`));
    console.log(chalk.white(`👥 Guests: ${chalk.bold(bookingData.guests)}`));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Does this look correct?',
        default: true
      }
    ]);
  }

  async attemptBooking(bookingData) {
    console.log(chalk.cyan('\n🚀 Attempting to book your table...\n'));

    try {
      // Create booking record
      const bookingRecord = await BookingModel.create(bookingData);

      // Attempt booking with retry logic
      const retryConfig = config.getRetryConfig();
      let lastError = null;

      for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
        try {
          console.log(chalk.yellow(`Attempt ${attempt}/${retryConfig.maxAttempts}...`));
          
          if (attempt > 1) {
            const delay = retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
            console.log(chalk.gray(`Waiting ${delay}ms before retry...`));
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const result = await this.booker.bookTable(bookingData);
          
          // Success!
          await BookingModel.updateStatus(bookingRecord.id, 'confirmed', result.confirmationNumber);
          
          console.log(chalk.green('\n🎉 Booking successful!'));
          this.displaySuccessMessage(bookingData, result.confirmationNumber);
          
          // Send notification
          await NotificationService.sendBookingSuccess({
            ...bookingData,
            confirmationNumber: result.confirmationNumber
          });

          // Ask if user wants to add to favorites
          await this.askToAddFavorite(bookingData);
          
          return;

        } catch (error) {
          lastError = error;
          console.log(chalk.red(`Attempt ${attempt} failed: ${error.message}`));
          
          if (attempt < retryConfig.maxAttempts) {
            console.log(chalk.yellow('Retrying...'));
          }
        }
      }

      // All attempts failed
      await BookingModel.updateStatus(bookingRecord.id, 'failed');
      console.log(chalk.red('\n❌ All booking attempts failed'));
      
      await NotificationService.sendBookingFailure(bookingData, lastError);
      
      // Ask if user wants to try again
      const tryAgain = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'tryAgain',
          message: 'Would you like to try booking again?',
          default: false
        }
      ]);

      if (tryAgain.tryAgain) {
        await this.bookTable();
      }

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  }

  displaySuccessMessage(bookingData, confirmationNumber) {
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

  async askToAddFavorite(bookingData) {
    const addToFavorites = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addToFavorites',
        message: 'Would you like to add this restaurant to your favorites?',
        default: true
      }
    ]);

    if (addToFavorites.addToFavorites) {
      const favoriteData = {
        name: bookingData.restaurantName,
        url: bookingData.restaurantUrl || '',
        preferredTime: bookingData.time,
        preferredGuests: bookingData.guests
      };

      await BookingModel.addFavorite(favoriteData);
      console.log(chalk.green('✅ Added to favorites!'));
    }
  }

  async manageFavorites() {
    const action = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do with favorites?',
        choices: [
          { name: 'List favorites', value: 'list' },
          { name: 'Add favorite', value: 'add' },
          { name: 'Delete favorite', value: 'delete' },
          { name: 'Back to main menu', value: 'back' }
        ]
      }
    ]);

    switch (action.action) {
      case 'list':
        await this.listFavorites();
        break;
      case 'add':
        await this.addFavorite();
        break;
      case 'delete':
        await this.deleteFavorite();
        break;
      case 'back':
        await this.start();
        return;
    }

    // Return to favorites menu
    await this.manageFavorites();
  }

  async listFavorites() {
    const favorites = await BookingModel.getFavorites();
    
    if (favorites.length === 0) {
      console.log(chalk.yellow('\nNo favorites found.'));
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

  async addFavorite() {
    const favoriteData = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Restaurant name:',
        validate: (input) => input.trim().length > 0 ? true : 'Name is required'
      },
      {
        type: 'input',
        name: 'url',
        message: 'Restaurant URL:',
        validate: (input) => input.trim().length > 0 ? true : 'URL is required'
      },
      {
        type: 'input',
        name: 'preferredTime',
        message: 'Preferred time:',
        default: '19:00',
        validate: (input) => {
          if (!moment(input, 'HH:mm', true).isValid()) {
            return 'Please enter a valid time (HH:MM)';
          }
          return true;
        }
      },
      {
        type: 'number',
        name: 'preferredGuests',
        message: 'Preferred number of guests:',
        default: 2,
        validate: (input) => {
          if (input < 1 || input > config.getBookingConfig().maxGuests) {
            return `Number of guests must be between 1 and ${config.getBookingConfig().maxGuests}`;
          }
          return true;
        }
      }
    ]);

    await BookingModel.addFavorite(favoriteData);
    console.log(chalk.green(`✅ Added "${favoriteData.name}" to favorites`));
  }

  async deleteFavorite() {
    const favorites = await BookingModel.getFavorites();
    
    if (favorites.length === 0) {
      console.log(chalk.yellow('\nNo favorites to delete.'));
      return;
    }

    const choices = favorites.map(fav => ({
      name: `${fav.name} (${fav.preferred_time} for ${fav.preferred_guests} guests)`,
      value: fav.id
    }));

    const selected = await inquirer.prompt([
      {
        type: 'list',
        name: 'favoriteId',
        message: 'Select a favorite to delete:',
        choices: choices
      }
    ]);

    await BookingModel.deleteFavorite(selected.favoriteId);
    console.log(chalk.green('✅ Favorite deleted'));
  }

  async showHistory() {
    const options = await inquirer.prompt([
      {
        type: 'number',
        name: 'limit',
        message: 'How many bookings to show?',
        default: 10
      },
      {
        type: 'list',
        name: 'status',
        message: 'Filter by status:',
        choices: [
          { name: 'All statuses', value: '' },
          { name: 'Confirmed', value: 'confirmed' },
          { name: 'Failed', value: 'failed' },
          { name: 'Pending', value: 'pending' }
        ]
      }
    ]);

    const limit = options.limit;
    let bookings;

    if (options.status) {
      bookings = await BookingModel.getByStatus(options.status, limit);
    } else {
      bookings = await BookingModel.getAll(limit);
    }

    if (bookings.length === 0) {
      console.log(chalk.yellow('\nNo bookings found.'));
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
  }
}

// Start the interactive application
const interactiveBooker = new InteractiveBooker();
interactiveBooker.start();
