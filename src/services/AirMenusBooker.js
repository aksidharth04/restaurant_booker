const puppeteer = require('puppeteer');
const moment = require('moment');
const config = require('../config');
const logger = require('../utils/logger');

class AirMenusBooker {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async init() {
    try {
      logger.info('Initializing browser...');
      
      this.browser = await puppeteer.launch({
        headless: config.getBrowserConfig().headless,
        args: [
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        defaultViewport: config.getBrowserConfig().viewport
      });

      this.page = await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent(config.getBrowserConfig().userAgent);
      
      // Set timeout
      this.page.setDefaultTimeout(config.getBrowserConfig().timeout);
      
      // Enable request interception for better performance
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      logger.info('Browser initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize browser', { error: error.message });
      throw error;
    }
  }

  async login() {
    try {
      logger.info('Logging into AirMenus...');
      
      await this.page.goto('https://airmenus.com/login', { waitUntil: 'networkidle2' });
      
      // Wait for login form to load
      await this.page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      // Fill in credentials
      await this.page.type('input[type="email"]', config.env.AIRMENUS_EMAIL);
      await this.page.type('input[type="password"]', config.env.AIRMENUS_PASSWORD);
      
      // Submit form
      await this.page.click('button[type="submit"]');
      
      // Wait for login to complete
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      // Check if login was successful
      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('.login-form') && 
               (document.querySelector('.user-menu') || document.querySelector('.logout'));
      });
      
      if (isLoggedIn) {
        this.isLoggedIn = true;
        logger.info('Successfully logged into AirMenus');
        return true;
      } else {
        throw new Error('Login failed - invalid credentials or login form not found');
      }
    } catch (error) {
      logger.error('Login failed', { error: error.message });
      throw error;
    }
  }

  async searchRestaurant(restaurantName) {
    try {
      logger.info('Searching for restaurant', { restaurantName });
      
      // Navigate to search page
      await this.page.goto('https://airmenus.com/search', { waitUntil: 'networkidle2' });
      
      // Wait for search input
      await this.page.waitForSelector('input[placeholder*="restaurant"]', { timeout: 10000 });
      
      // Type restaurant name
      await this.page.type('input[placeholder*="restaurant"]', restaurantName);
      
      // Press Enter or click search button
      await this.page.keyboard.press('Enter');
      
      // Wait for search results
      await this.page.waitForSelector('.restaurant-card, .search-result', { timeout: 15000 });
      
      // Get first result
      const firstResult = await this.page.$('.restaurant-card, .search-result');
      if (!firstResult) {
        throw new Error('No restaurants found');
      }
      
      // Click on first result
      await firstResult.click();
      
      // Wait for restaurant page to load
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      logger.info('Restaurant found and selected', { restaurantName });
      return true;
    } catch (error) {
      logger.error('Failed to search restaurant', { error: error.message, restaurantName });
      throw error;
    }
  }

  async navigateToRestaurant(restaurantUrl) {
    try {
      const url = parseAllowedRestaurantUrl(restaurantUrl);
      logger.info('Navigating to restaurant page', { url: url.toString() });
      
      await this.page.goto(url.toString(), { waitUntil: 'networkidle2' });
      
      // Wait for page to load
      await this.page.waitForSelector('.booking-button, .reserve-button, [data-testid="book-table"]', { 
        timeout: 15000 
      });
      
      logger.info('Successfully navigated to restaurant page');
      return true;
    } catch (error) {
      logger.error('Failed to navigate to restaurant', { error: error.message, url: restaurantUrl });
      throw error;
    }
  }

  async selectDate(date) {
    try {
      logger.info('Selecting date', { date });
      
      // Wait for date picker
      await this.page.waitForSelector('.date-picker, input[type="date"], .calendar', { timeout: 10000 });
      
      // Try different date selection methods
      const dateSelectors = [
        'input[type="date"]',
        '.date-picker input',
        '.calendar input'
      ];
      
      let dateSelected = false;
      for (const selector of dateSelectors) {
        try {
          const dateInput = await this.page.$(selector);
          if (dateInput) {
            await dateInput.click();
            await this.page.$eval(selector, (input, targetDate) => {
              input.value = targetDate;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }, date);
            await this.page.keyboard.press('Enter');
            dateSelected = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!dateSelected) {
        // Try clicking on calendar date
        const formattedDate = moment(date).format('YYYY-MM-DD');
        const dateElement = await this.page.$(`[data-date="${formattedDate}"]`);
        if (dateElement) {
          await dateElement.click();
          dateSelected = true;
        }
      }
      
      if (!dateSelected) {
        throw new Error('Could not select date');
      }
      
      // Wait for date selection to register
      await this.page.waitForTimeout(1000);
      
      logger.info('Date selected successfully', { date });
      return true;
    } catch (error) {
      logger.error('Failed to select date', { error: error.message, date });
      throw error;
    }
  }

  async selectTime(time) {
    try {
      logger.info('Selecting time', { time });
      
      // Wait for time slots to load
      await this.page.waitForSelector('.time-slot, .time-button, [data-time]', { timeout: 10000 });
      
      // Try to find exact time match
      const timeSelectors = [
        `[data-time="${time}"]`,
        `.time-slot[data-time="${time}"]`,
        `.time-button[data-time="${time}"]`
      ];
      
      let timeSelected = false;
      for (const selector of timeSelectors) {
        try {
          const timeElement = await this.page.$(selector);
          if (timeElement) {
            await timeElement.click();
            timeSelected = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!timeSelected) {
        const selectedTime = await this.page.evaluate((requestedTime) => {
          const toMinutes = (value) => {
            const match = String(value || '').match(/(\d{1,2}):?(\d{2})/);
            if (!match) {
              return null;
            }

            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) {
              return null;
            }

            return (hours * 60) + minutes;
          };

          const targetMinutes = toMinutes(requestedTime);
          if (targetMinutes === null) {
            return null;
          }

          const timeElements = Array.from(document.querySelectorAll('.time-slot, .time-button, [data-time]'));
          let closest = null;
          let minDiff = Infinity;

          for (const element of timeElements) {
            const optionText = element.getAttribute('data-time') || element.textContent.trim();
            const optionMinutes = toMinutes(optionText);
            if (optionMinutes === null) {
              continue;
            }

            const diff = Math.abs(targetMinutes - optionMinutes);
            if (diff < minDiff) {
              minDiff = diff;
              closest = { element, time: optionText };
            }
          }

          if (!closest) {
            return null;
          }

          closest.element.click();
          return closest.time;
        }, time);

        if (selectedTime) {
          timeSelected = true;
          logger.info('Selected closest available time', { 
            requested: time, 
            selected: selectedTime
          });
        }
      }
      
      if (!timeSelected) {
        throw new Error('No available time slots found');
      }
      
      // Wait for time selection to register
      await this.page.waitForTimeout(1000);
      
      logger.info('Time selected successfully', { time });
      return true;
    } catch (error) {
      logger.error('Failed to select time', { error: error.message, time });
      throw error;
    }
  }

  async selectGuests(guests) {
    try {
      logger.info('Selecting number of guests', { guests });
      
      // Wait for guest selector
      await this.page.waitForSelector('.guest-selector, .party-size, select[name="guests"]', { timeout: 10000 });
      
      // Try different guest selection methods
      const guestSelectors = [
        'select[name="guests"]',
        '.guest-selector select',
        '.party-size select'
      ];
      
      let guestsSelected = false;
      for (const selector of guestSelectors) {
        try {
          const guestSelect = await this.page.$(selector);
          if (guestSelect) {
            await guestSelect.select(guests.toString());
            guestsSelected = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!guestsSelected) {
        // Try increment/decrement buttons
        const incrementButton = await this.page.$('.guest-increment, .party-increment');
        const decrementButton = await this.page.$('.guest-decrement, .party-decrement');
        
        if (incrementButton && decrementButton) {
          // Get current guest count
          const currentGuests = await this.page.evaluate(() => {
            const guestDisplay = document.querySelector('.guest-count, .party-count');
            return guestDisplay ? parseInt(guestDisplay.textContent) : 1;
          });
          
          // Adjust to target number
          const diff = guests - currentGuests;
          const button = diff > 0 ? incrementButton : decrementButton;
          const clicks = Math.abs(diff);
          
          for (let i = 0; i < clicks; i++) {
            await button.click();
            await this.page.waitForTimeout(200);
          }
          
          guestsSelected = true;
        }
      }
      
      if (!guestsSelected) {
        throw new Error('Could not select number of guests');
      }
      
      // Wait for guest selection to register
      await this.page.waitForTimeout(1000);
      
      logger.info('Guests selected successfully', { guests });
      return true;
    } catch (error) {
      logger.error('Failed to select guests', { error: error.message, guests });
      throw error;
    }
  }

  async submitBooking() {
    try {
      logger.info('Submitting booking...');
      
      // Wait for book button
      await this.page.waitForSelector('.book-button, .reserve-button, button[type="submit"]', { timeout: 10000 });
      
      // Click book button
      await this.page.click('.book-button, .reserve-button, button[type="submit"]');
      
      // Wait for confirmation or error
      await this.page.waitForSelector('.confirmation, .success, .error, .booking-confirmed', { timeout: 15000 });
      
      // Check if booking was successful
      const isSuccess = await this.page.evaluate(() => {
        const successElements = document.querySelectorAll('.confirmation, .success, .booking-confirmed');
        const errorElements = document.querySelectorAll('.error, .booking-failed');
        
        return successElements.length > 0 && errorElements.length === 0;
      });
      
      if (isSuccess) {
        // Extract confirmation number
        const confirmationNumber = await this.page.evaluate(() => {
          const confirmationElement = document.querySelector('.confirmation-number, .booking-id');
          return confirmationElement ? confirmationElement.textContent.trim() : null;
        });
        
        logger.info('Booking submitted successfully', { confirmationNumber });
        return { success: true, confirmationNumber };
      } else {
        // Get error message
        const errorMessage = await this.page.evaluate(() => {
          const errorElement = document.querySelector('.error, .booking-failed');
          return errorElement ? errorElement.textContent.trim() : 'Unknown error';
        });
        
        throw new Error(`Booking failed: ${errorMessage}`);
      }
    } catch (error) {
      logger.error('Failed to submit booking', { error: error.message });
      throw error;
    }
  }

  async bookTable(bookingData) {
    const { restaurantName, restaurantUrl, date, time, guests } = bookingData;
    
    try {
      logger.startBooking(restaurantName, date, time, guests);
      
      // Initialize browser if not already done
      if (!this.browser) {
        await this.init();
      }
      
      // Login if not already logged in
      if (!this.isLoggedIn) {
        await this.login();
      }
      
      // Navigate to restaurant
      if (restaurantUrl) {
        await this.navigateToRestaurant(restaurantUrl);
      } else {
        await this.searchRestaurant(restaurantName);
      }
      
      // Select booking details
      await this.selectDate(date);
      await this.selectTime(time);
      await this.selectGuests(guests);
      
      // Submit booking
      const result = await this.submitBooking();
      
      logger.bookingSuccess(result.confirmationNumber, restaurantName, date, time, guests);
      
      return {
        success: true,
        confirmationNumber: result.confirmationNumber,
        bookingData
      };
      
    } catch (error) {
      logger.bookingFailed(restaurantName, date, time, guests, error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}

function parseAllowedRestaurantUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`Invalid restaurant URL: ${error.message}`);
  }

  if (url.protocol !== 'https:' || !isAllowedAirMenusHost(url.hostname)) {
    throw new Error('Restaurant URL must be an HTTPS AirMenus booking URL');
  }

  return url;
}

function isAllowedAirMenusHost(hostname) {
  return hostname === 'airmenus.com' ||
    hostname.endsWith('.airmenus.com') ||
    hostname === 'airmenus.in' ||
    hostname.endsWith('.airmenus.in');
}

module.exports = AirMenusBooker;
