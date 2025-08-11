const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const config = require('../config');
const logger = require('../utils/logger');

class Booking {
  constructor() {
    this.dbPath = config.env.DATABASE_PATH;
    this.initDatabase();
  }

  initDatabase() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        logger.error('Error opening database', { error: err.message });
        throw err;
      }
      logger.info('Connected to SQLite database');
      this.createTables();
    });
  }

  createTables() {
    const createBookingsTable = `
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        restaurant_name TEXT NOT NULL,
        restaurant_url TEXT,
        booking_date TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        guests INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        confirmation_number TEXT,
        encrypted_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createFavoritesTable = `
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        preferred_time TEXT,
        preferred_guests INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createBookingsTable, (err) => {
        if (err) {
          logger.error('Error creating bookings table', { error: err.message });
        } else {
          logger.info('Bookings table created or already exists');
        }
      });

      this.db.run(createFavoritesTable, (err) => {
        if (err) {
          logger.error('Error creating favorites table', { error: err.message });
        } else {
          logger.info('Favorites table created or already exists');
        }
      });
    });
  }

  encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), config.env.ENCRYPTION_KEY).toString();
  }

  decryptData(encryptedData) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, config.env.ENCRYPTION_KEY);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
      logger.error('Error decrypting data', { error: error.message });
      return null;
    }
  }

  async create(bookingData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        restaurantName,
        restaurantUrl,
        date,
        time,
        guests,
        additionalData = {}
      } = bookingData;

      const encryptedData = this.encryptData(additionalData);

      const sql = `
        INSERT INTO bookings (id, restaurant_name, restaurant_url, booking_date, booking_time, guests, encrypted_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [id, restaurantName, restaurantUrl, date, time, guests, encryptedData], function(err) {
        if (err) {
          logger.error('Error creating booking', { error: err.message, bookingData });
          reject(err);
        } else {
          logger.info('Booking created successfully', { id, restaurantName, date, time, guests });
          resolve({ id, ...bookingData });
        }
      });
    });
  }

  async updateStatus(id, status, confirmationNumber = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE bookings 
        SET status = ?, confirmation_number = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(sql, [status, confirmationNumber, id], function(err) {
        if (err) {
          logger.error('Error updating booking status', { error: err.message, id, status });
          reject(err);
        } else {
          logger.info('Booking status updated', { id, status, confirmationNumber });
          resolve({ id, status, confirmationNumber });
        }
      });
    });
  }

  async getById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM bookings WHERE id = ?';
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Error getting booking by ID', { error: err.message, id });
          reject(err);
        } else {
          if (row && row.encrypted_data) {
            row.additionalData = this.decryptData(row.encrypted_data);
          }
          resolve(row);
        }
      });
    });
  }

  async getAll(limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM bookings 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      
      this.db.all(sql, [limit, offset], (err, rows) => {
        if (err) {
          logger.error('Error getting all bookings', { error: err.message });
          reject(err);
        } else {
          const bookings = rows.map(row => {
            if (row.encrypted_data) {
              row.additionalData = this.decryptData(row.encrypted_data);
            }
            return row;
          });
          resolve(bookings);
        }
      });
    });
  }

  async getByStatus(status, limit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM bookings 
        WHERE status = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      this.db.all(sql, [status, limit], (err, rows) => {
        if (err) {
          logger.error('Error getting bookings by status', { error: err.message, status });
          reject(err);
        } else {
          const bookings = rows.map(row => {
            if (row.encrypted_data) {
              row.additionalData = this.decryptData(row.encrypted_data);
            }
            return row;
          });
          resolve(bookings);
        }
      });
    });
  }

  async addFavorite(favoriteData) {
    return new Promise((resolve, reject) => {
      const { name, url, preferredTime, preferredGuests } = favoriteData;
      
      const sql = `
        INSERT INTO favorites (name, url, preferred_time, preferred_guests)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(sql, [name, url, preferredTime, preferredGuests], function(err) {
        if (err) {
          logger.error('Error adding favorite', { error: err.message, favoriteData });
          reject(err);
        } else {
          logger.info('Favorite added successfully', { name, url });
          resolve({ id: this.lastID, ...favoriteData });
        }
      });
    });
  }

  async getFavorites() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM favorites ORDER BY name';
      
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Error getting favorites', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async deleteFavorite(id) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM favorites WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Error deleting favorite', { error: err.message, id });
          reject(err);
        } else {
          logger.info('Favorite deleted successfully', { id });
          resolve({ id });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          logger.error('Error closing database', { error: err.message });
        } else {
          logger.info('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Booking();
