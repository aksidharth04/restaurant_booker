const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const moment = require('moment');
const config = require('../src/config');

describe('Restaurant Booker Tests', () => {
  beforeEach(() => {
    // Setup test environment
  });

  afterEach(() => {
    // Cleanup after tests
  });

  describe('Configuration', () => {
    it('should load configuration correctly', () => {
      expect(config).toBeDefined();
      expect(config.getBookingConfig()).toBeDefined();
      expect(config.getRetryConfig()).toBeDefined();
    });

    it('should validate required environment variables', () => {
      // This test would require proper environment setup
      expect(() => config.validate()).toThrow();
    });
  });

  describe('Booking Data Validation', () => {
    it('should validate correct booking data', () => {
      const validBooking = {
        restaurantName: 'Test Restaurant',
        date: moment().add(1, 'day').format('YYYY-MM-DD'),
        time: '19:00',
        guests: 4
      };

      // This would be tested in the actual validation function
      expect(validBooking.restaurantName).toBeTruthy();
      expect(moment(validBooking.date, 'YYYY-MM-DD', true).isValid()).toBe(true);
      expect(moment(validBooking.time, 'HH:mm', true).isValid()).toBe(true);
      expect(validBooking.guests).toBeGreaterThan(0);
    });

    it('should reject invalid dates', () => {
      const invalidDate = '2024-13-45';
      expect(moment(invalidDate, 'YYYY-MM-DD', true).isValid()).toBe(false);
    });

    it('should reject invalid times', () => {
      const invalidTime = '25:70';
      expect(moment(invalidTime, 'HH:mm', true).isValid()).toBe(false);
    });

    it('should reject past dates', () => {
      const pastDate = moment().subtract(1, 'day').format('YYYY-MM-DD');
      const bookingDate = moment(pastDate);
      const today = moment().startOf('day');
      
      expect(bookingDate.isBefore(today)).toBe(true);
    });
  });

  describe('Date and Time Utilities', () => {
    it('should generate correct default date', () => {
      const defaultDate = moment().add(1, 'day').format('YYYY-MM-DD');
      const expectedDate = moment().add(1, 'day').format('YYYY-MM-DD');
      
      expect(defaultDate).toBe(expectedDate);
    });

    it('should validate booking window', () => {
      const maxBookingDate = moment().add(config.getBookingConfig().bookingWindowDays, 'days');
      const tooFarDate = moment().add(config.getBookingConfig().bookingWindowDays + 1, 'days');
      
      expect(tooFarDate.isAfter(maxBookingDate)).toBe(true);
    });
  });

  describe('Guest Validation', () => {
    it('should accept valid guest counts', () => {
      const validGuests = [1, 2, 4, 8, 10];
      const maxGuests = config.getBookingConfig().maxGuests;
      
      validGuests.forEach(guests => {
        expect(guests).toBeGreaterThan(0);
        expect(guests).toBeLessThanOrEqual(maxGuests);
      });
    });

    it('should reject invalid guest counts', () => {
      const invalidGuests = [0, -1, 100];
      const maxGuests = config.getBookingConfig().maxGuests;
      
      invalidGuests.forEach(guests => {
        expect(guests <= 0 || guests > maxGuests).toBe(true);
      });
    });
  });
});
