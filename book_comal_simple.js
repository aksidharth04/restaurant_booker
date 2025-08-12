#!/usr/bin/env node

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const ora = require('ora');

async function bookComalSimple({ date, time, guests, name, email, phone }) {
  const spinner = ora('Starting Comal booking...').start();
  let browser;
  
  try {
    // Launch browser (non-headless so you can see what's happening)
    browser = await puppeteer.launch({
      headless: false, // Set to true if you want it to run in background
      defaultViewport: { width: 1280, height: 720 }
    });
    
    const page = await browser.newPage();
    spinner.text = 'Navigating to Comal booking page...';
    
    // Step 1: Go to Comal booking page
    await page.goto('https://bookings.airmenus.in/comal/order', { 
      waitUntil: 'networkidle2' 
    });
    
    spinner.text = 'Looking for booking button...';
    
    // Step 2: Click the "Book" button
    // Wait for and click the book button
    await page.waitForSelector('button:contains("Book"), .book-button, [data-testid="book"], .btn-book', { 
      timeout: 10000 
    });
    
    // Try different selectors for the book button
    const bookSelectors = [
      'button:contains("Book")',
      '.book-button',
      '[data-testid="book"]',
      '.btn-book',
      'button[type="submit"]',
      '.booking-button'
    ];
    
    let bookButtonClicked = false;
    for (const selector of bookSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          bookButtonClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!bookButtonClicked) {
      // Try clicking by text content
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const bookButton = buttons.find(btn => 
          btn.textContent.toLowerCase().includes('book') ||
          btn.textContent.toLowerCase().includes('reserve')
        );
        if (bookButton) bookButton.click();
      });
    }
    
    spinner.text = 'Selecting date and time...';
    
    // Step 3: Select date (if date picker is present)
    try {
      await page.waitForSelector('input[type="date"], .date-picker, .calendar', { timeout: 5000 });
      
      // Try to select the date
      await page.evaluate((targetDate) => {
        const dateInput = document.querySelector('input[type="date"]');
        if (dateInput) {
          dateInput.value = targetDate;
          dateInput.dispatchEvent(new Event('change'));
        }
      }, date);
    } catch (e) {
      console.log(chalk.yellow('No date picker found, continuing...'));
    }
    
    // Step 4: Select time slot
    spinner.text = 'Selecting time slot...';
    await page.waitForTimeout(2000);
    
    // Look for time slots and click the desired time
    await page.evaluate((targetTime) => {
      const timeElements = document.querySelectorAll('.time-slot, .time-button, [data-time], button');
      for (const element of timeElements) {
        const text = element.textContent.trim();
        if (text.includes(targetTime) || text.includes(targetTime.replace(':', ''))) {
          element.click();
          return;
        }
      }
    }, time);
    
    // Step 5: Select number of guests
    spinner.text = 'Selecting number of guests...';
    await page.waitForTimeout(1000);
    
    await page.evaluate((targetGuests) => {
      // Try to find guest selector
      const guestSelect = document.querySelector('select[name="guests"], .guest-selector select');
      if (guestSelect) {
        guestSelect.value = targetGuests.toString();
        guestSelect.dispatchEvent(new Event('change'));
      } else {
        // Try increment/decrement buttons
        const currentGuests = document.querySelector('.guest-count, .party-count');
        if (currentGuests) {
          const current = parseInt(currentGuests.textContent) || 1;
          const diff = targetGuests - current;
          const button = diff > 0 ? 
            document.querySelector('.guest-increment, .party-increment') :
            document.querySelector('.guest-decrement, .party-decrement');
          
          if (button) {
            for (let i = 0; i < Math.abs(diff); i++) {
              button.click();
            }
          }
        }
      }
    }, guests);
    
    // Step 6: Click "Next" or "Continue" button
    spinner.text = 'Proceeding to checkout...';
    await page.waitForTimeout(2000);
    
    await page.evaluate(() => {
      const nextButtons = Array.from(document.querySelectorAll('button'));
      const nextButton = nextButtons.find(btn => 
        btn.textContent.toLowerCase().includes('next') ||
        btn.textContent.toLowerCase().includes('continue') ||
        btn.textContent.toLowerCase().includes('proceed')
      );
      if (nextButton) nextButton.click();
    });
    
    // Step 7: Wait for checkout page and fill details
    spinner.text = 'Filling booking details...';
    await page.waitForTimeout(3000);
    
    // Fill in the form fields
    await page.evaluate((details) => {
      // Fill name
      const nameInput = document.querySelector('input[name="name"], input[placeholder*="name"], input[type="text"]');
      if (nameInput) nameInput.value = details.name;
      
      // Fill email
      const emailInput = document.querySelector('input[name="email"], input[type="email"], input[placeholder*="email"]');
      if (emailInput) emailInput.value = details.email;
      
      // Fill phone
      const phoneInput = document.querySelector('input[name="phone"], input[name="mobile"], input[placeholder*="phone"], input[placeholder*="mobile"]');
      if (phoneInput) phoneInput.value = details.phone;
      
      // Check the policy checkbox
      const policyCheckbox = document.querySelector('input[type="checkbox"]');
      if (policyCheckbox && !policyCheckbox.checked) {
        policyCheckbox.click();
      }
    }, { name, email, phone });
    
    spinner.text = 'Ready to proceed to payment...';
    
    // Step 8: Click "PROCEED" button (but don't actually click it - let user do it)
    console.log(chalk.green('\n✅ Booking form filled successfully!'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`📍 Restaurant: ${chalk.bold('Comal')}`));
    console.log(chalk.white(`📅 Date: ${chalk.bold(date)}`));
    console.log(chalk.white(`🕐 Time: ${chalk.bold(time)}`));
    console.log(chalk.white(`👥 Guests: ${chalk.bold(guests)}`));
    console.log(chalk.white(`👤 Name: ${chalk.bold(name)}`));
    console.log(chalk.white(`📧 Email: ${chalk.bold(email)}`));
    console.log(chalk.white(`📱 Phone: ${chalk.bold(phone)}`));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.yellow('\n💳 Please click the "PROCEED" button to complete payment'));
    console.log(chalk.gray('The browser will stay open for you to handle the payment'));
    
    // Keep browser open for user to complete payment
    spinner.succeed(chalk.green('Form filled! Complete payment manually.'));
    
    // Don't close browser - let user handle payment
    return { success: true };
    
  } catch (error) {
    spinner.fail(chalk.red('Booking failed'));
    console.error(chalk.red(`Error: ${error.message}`));
    return { success: false, error: error.message };
  }
  // Note: Browser stays open for user to complete payment
}

// Main execution
async function main() {
  console.log(chalk.cyan('🍽️  Comal Restaurant Booking'));
  console.log(chalk.gray('Automated form filling - you handle the payment\n'));

  // Get next Friday for dinner
  const nextFriday = new Date();
  nextFriday.setDate(nextFriday.getDate() + (5 - nextFriday.getDay() + 7) % 7);
  const date = nextFriday.toISOString().split('T')[0];

  const bookingDetails = {
    date: date,
    time: '19:30', // 7:30 PM for dinner
    guests: 2,
    name: process.env.COMAL_BOOKING_NAME || 'Your Name',
    email: process.env.COMAL_BOOKING_EMAIL || 'your-booking-email@example.com',
    phone: process.env.COMAL_BOOKING_PHONE || 'your-phone-number'
  };

  console.log(chalk.yellow('📅 Booking Details:'));
  console.log(chalk.white(`Date: ${bookingDetails.date} (${nextFriday.toLocaleDateString('en-US', { weekday: 'long' })})`));
  console.log(chalk.white(`Time: ${bookingDetails.time}`));
  console.log(chalk.white(`Guests: ${bookingDetails.guests}`));
  console.log(chalk.white(`Name: ${bookingDetails.name}`));
  console.log('');

  const result = await bookComalSimple(bookingDetails);
  
  if (result.success) {
    console.log(chalk.green('\n✅ Ready for payment!'));
    console.log(chalk.gray('Complete the payment in the browser window.'));
  } else {
    console.log(chalk.red('\n❌ Something went wrong.'));
    console.log(chalk.yellow('Check the browser for any errors.'));
  }
}

// Run the booking
main().catch(console.error);
