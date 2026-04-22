#!/usr/bin/env node

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const { requireComalBookingDetails } = require('./src/utils/comalBookingDetails');

async function bookComal({ date, time, guests, name, email, phone }) {
  console.log(chalk.cyan('🚀 Starting Comal booking automation...'));
  let browser;
  
  try {
    // Launch browser with more robust settings
    console.log(chalk.yellow('📱 Opening browser...'));
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 720 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set longer timeout and better error handling
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    
    console.log(chalk.yellow('🌐 Navigating to Comal booking page...'));
    
    // Step 1: Go to Comal booking page with retry
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto('https://bookings.airmenus.in/comal/order', { 
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        break;
      } catch (error) {
        retries--;
        console.log(chalk.yellow(`⚠️  Navigation failed, retrying... (${retries} attempts left)`));
        if (retries === 0) throw error;
        await page.waitForTimeout(2000);
      }
    }
    
    console.log(chalk.green('✅ Successfully loaded Comal booking page'));
    console.log(chalk.yellow('🔍 Looking for booking button...'));
    
    // Step 2: Click the "Book" button
    await page.waitForTimeout(3000);
    
    // Try clicking by text content
    const bookClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      console.log('Found buttons:', buttons.map(b => b.textContent.trim()));
      
      const bookButton = buttons.find(btn => 
        btn.textContent.toLowerCase().includes('book') ||
        btn.textContent.toLowerCase().includes('reserve') ||
        btn.textContent.toLowerCase().includes('order') ||
        btn.textContent.toLowerCase().includes('table')
      );
      
      if (bookButton) {
        console.log('Found book button:', bookButton.textContent);
        bookButton.click();
        return true;
      }
      return false;
    });
    
    if (!bookClicked) {
      console.log(chalk.yellow('⚠️  Could not find book button, trying alternative selectors...'));
      // Try alternative selectors
      const selectors = ['.book-button', '[data-testid="book"]', '.btn-book', 'button[type="submit"]', '.booking-button'];
      for (const selector of selectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            console.log(chalk.green('✅ Found and clicked book button'));
            break;
          }
        } catch (e) {
          continue;
        }
      }
    } else {
      console.log(chalk.green('✅ Clicked book button'));
    }
    
    console.log(chalk.yellow('📅 Selecting date and time...'));
    await page.waitForTimeout(3000);
    
    // Step 3: Select date (if date picker is present)
    try {
      await page.evaluate((targetDate) => {
        const dateInput = document.querySelector('input[type="date"]');
        if (dateInput) {
          dateInput.value = targetDate;
          dateInput.dispatchEvent(new Event('change'));
          console.log('Date selected:', targetDate);
        }
      }, date);
    } catch (e) {
      console.log(chalk.yellow('⚠️  No date picker found, continuing...'));
    }
    
    // Step 4: Select time slot
    console.log(chalk.yellow('🕐 Selecting time slot...'));
    await page.waitForTimeout(2000);
    
    const timeSelected = await page.evaluate((targetTime) => {
      const timeElements = document.querySelectorAll('.time-slot, .time-button, [data-time], button');
      console.log('Found time elements:', timeElements.length);
      
      for (const element of timeElements) {
        const text = element.textContent.trim();
        console.log('Checking time element:', text);
        if (text.includes(targetTime) || text.includes(targetTime.replace(':', ''))) {
          element.click();
          return true;
        }
      }
      return false;
    }, time);
    
    if (timeSelected) {
      console.log(chalk.green('✅ Time slot selected'));
    } else {
      console.log(chalk.yellow('⚠️  Could not find exact time, continuing...'));
    }
    
    // Step 5: Select number of guests
    console.log(chalk.yellow('👥 Selecting number of guests...'));
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
    console.log(chalk.yellow('➡️  Proceeding to checkout...'));
    await page.waitForTimeout(2000);
    
    const nextClicked = await page.evaluate(() => {
      const nextButtons = Array.from(document.querySelectorAll('button'));
      const nextButton = nextButtons.find(btn => 
        btn.textContent.toLowerCase().includes('next') ||
        btn.textContent.toLowerCase().includes('continue') ||
        btn.textContent.toLowerCase().includes('proceed')
      );
      if (nextButton) {
        nextButton.click();
        return true;
      }
      return false;
    });
    
    if (nextClicked) {
      console.log(chalk.green('✅ Proceeded to checkout'));
    } else {
      console.log(chalk.yellow('⚠️  Could not find next button, continuing...'));
    }
    
    // Step 7: Wait for checkout page and fill details
    console.log(chalk.yellow('📝 Filling booking details...'));
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
    console.log(chalk.green('\n🎉 Form filled! Complete payment manually.'));
    
    // Don't close browser - let user handle payment
    return { success: true };
    
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    if (browser) {
      console.log(chalk.yellow('Keeping browser open for manual intervention...'));
    }
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
    ...requireComalBookingDetails()
  };

  console.log(chalk.yellow('📅 Booking Details:'));
  console.log(chalk.white(`Date: ${bookingDetails.date} (${nextFriday.toLocaleDateString('en-US', { weekday: 'long' })})`));
  console.log(chalk.white(`Time: ${bookingDetails.time}`));
  console.log(chalk.white(`Guests: ${bookingDetails.guests}`));
  console.log(chalk.white(`Name: ${bookingDetails.name}`));
  console.log('');

  const result = await bookComal(bookingDetails);
  
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
