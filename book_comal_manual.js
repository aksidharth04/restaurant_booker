#!/usr/bin/env node

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const {
  CONTACT_ENV,
  displayContactValue,
  getComalBookingDetails
} = require('./src/utils/comalBookingDetails');

async function openComalBooking() {
  console.log(chalk.cyan('🍽️  Opening Comal Restaurant Booking'));
  console.log(chalk.gray('Manual booking assistance\n'));
  const contactDetails = getComalBookingDetails();
  
  let browser;
  
  try {
    console.log(chalk.yellow('📱 Opening browser...'));
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 720 }
    });
    
    const page = await browser.newPage();
    console.log(chalk.yellow('🌐 Navigating to Comal booking page...'));
    
    // Navigate to Comal booking page
    await page.goto('https://bookings.airmenus.in/comal/order', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log(chalk.green('✅ Comal booking page loaded!'));
    console.log(chalk.cyan('\n📋 Your Booking Details:'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`📍 Restaurant: ${chalk.bold('Comal')}`));
    console.log(chalk.white(`👤 Name: ${chalk.bold(displayContactValue(contactDetails.name, CONTACT_ENV.name))}`));
    console.log(chalk.white(`📧 Email: ${chalk.bold(displayContactValue(contactDetails.email, CONTACT_ENV.email))}`));
    console.log(chalk.white(`📱 Phone: ${chalk.bold(displayContactValue(contactDetails.phone, CONTACT_ENV.phone))}`));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    console.log(chalk.yellow('\n📝 Manual Steps:'));
    console.log(chalk.white('1. Click the "Book" or "Reserve" button'));
    console.log(chalk.white('2. Select your preferred date and time'));
    console.log(chalk.white('3. Choose number of guests (2)'));
    console.log(chalk.white('4. Click "Next" or "Continue"'));
    console.log(chalk.white('5. Fill in your details:'));
    console.log(chalk.gray(`   • Name: ${displayContactValue(contactDetails.name, CONTACT_ENV.name)}`));
    console.log(chalk.gray(`   • Email: ${displayContactValue(contactDetails.email, CONTACT_ENV.email)}`));
    console.log(chalk.gray(`   • Phone: ${displayContactValue(contactDetails.phone, CONTACT_ENV.phone)}`));
    console.log(chalk.white('6. Check the policy checkbox'));
    console.log(chalk.white('7. Click "PROCEED" to complete payment'));
    
    console.log(chalk.green('\n🎉 Browser is ready! Complete your booking manually.'));
    console.log(chalk.gray('The browser will stay open for you to handle everything.'));
    
    // Keep browser open indefinitely
    return { success: true };
    
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    if (browser) {
      console.log(chalk.yellow('Browser opened but navigation failed. You can manually navigate to:'));
      console.log(chalk.cyan('https://bookings.airmenus.in/comal/order'));
    }
    return { success: false, error: error.message };
  }
}

// Main execution
async function main() {
  const result = await openComalBooking();
  
  if (result.success) {
    console.log(chalk.green('\n✅ Browser ready for manual booking!'));
  } else {
    console.log(chalk.red('\n❌ Something went wrong.'));
    console.log(chalk.yellow('You can manually open: https://bookings.airmenus.in/comal/order'));
  }
}

// Run the booking
main().catch(console.error);
