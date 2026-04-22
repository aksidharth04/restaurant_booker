#!/usr/bin/env node

const moment = require('moment');
const chalk = require('chalk');
const ora = require('ora');
const config = require('./src/config');
const AirMenusBooker = require('./src/services/AirMenusBooker');
const BookingModel = require('./src/models/Booking');
const { requireComalBookingDetails } = require('./src/utils/comalBookingDetails');

async function bookComal({ date, time, guests, name, email, phone }) {
  const spinner = ora('Initializing booking system...').start();
  const booker = new AirMenusBooker();
  
  try {
    // Validate configuration
    config.validate();
    spinner.text = 'Configuration validated';

    // Initialize browser
    await booker.init();
    spinner.text = 'Browser initialized';

    // Login to AirMenus
    await booker.login();
    spinner.text = 'Logged into AirMenus';

    // Comal restaurant URL
    const restaurantUrl = 'https://bookings.airmenus.in/comal/order';

    const bookingData = {
      restaurantName: 'Comal',
      restaurantUrl,
      date,
      time,
      guests,
      additionalData: {
        name,
        email,
        phone
      }
    };

    // Create booking record
    const bookingRecord = await BookingModel.create(bookingData);
    spinner.text = 'Booking record created';

    // Attempt booking
    spinner.text = 'Attempting to book your table...';
    const result = await booker.bookTable(bookingData);

    if (result.success) {
      await BookingModel.updateStatus(bookingRecord.id, 'confirmed', result.confirmationNumber);
      spinner.succeed(chalk.green('🎉 Booking successful!'));
      
      console.log(chalk.cyan('\n📋 Booking Details:'));
      console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.white(`📍 Restaurant: ${chalk.bold('Comal')}`));
      console.log(chalk.white(`📅 Date: ${chalk.bold(date)}`));
      console.log(chalk.white(`🕐 Time: ${chalk.bold(time)}`));
      console.log(chalk.white(`👥 Guests: ${chalk.bold(guests)}`));
      console.log(chalk.white(`👤 Name: ${chalk.bold(name)}`));
      console.log(chalk.white(`📧 Email: ${chalk.bold(email)}`));
      console.log(chalk.white(`📱 Phone: ${chalk.bold(phone)}`));
      if (result.confirmationNumber) {
        console.log(chalk.white(`🔢 Confirmation: ${chalk.bold(result.confirmationNumber)}`));
      }
      console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      
      return { success: true, confirmationNumber: result.confirmationNumber };
    } else {
      await BookingModel.updateStatus(bookingRecord.id, 'failed');
      spinner.fail(chalk.red('❌ Booking failed'));
      return { success: false, error: 'Booking failed' };
    }

  } catch (error) {
    spinner.fail(chalk.red('Booking failed'));
    console.error(chalk.red(`Error: ${error.message}`));
    return { success: false, error: error.message };
  } finally {
    await booker.close();
  }
}

// Main execution
async function main() {
  console.log(chalk.cyan('🍽️  Comal Restaurant Booking'));
  console.log(chalk.gray('Automated booking for Comal via AirMenus\n'));

  // Get next Friday
  const nextFriday = moment().day(5).format('YYYY-MM-DD');
  const contactDetails = requireComalBookingDetails();

  const bookingDetails = {
    date: nextFriday,
    time: '19:30',    // Change to '13:00' for lunch
    guests: 2,
    ...contactDetails
  };

  console.log(chalk.yellow('📅 Booking Details:'));
  console.log(chalk.white(`Date: ${bookingDetails.date} (${moment(bookingDetails.date).format('dddd')})`));
  console.log(chalk.white(`Time: ${bookingDetails.time}`));
  console.log(chalk.white(`Guests: ${bookingDetails.guests}`));
  console.log(chalk.white(`Name: ${bookingDetails.name}`));
  console.log('');

  const result = await bookComal(bookingDetails);
  
  if (result.success) {
    console.log(chalk.green('\n✅ Your table at Comal has been booked successfully!'));
    console.log(chalk.gray('You should receive a confirmation email shortly.'));
  } else {
    console.log(chalk.red('\n❌ Booking was unsuccessful.'));
    console.log(chalk.yellow('Please check your AirMenus credentials and try again.'));
  }
}

// Run the booking
main().catch(console.error);
