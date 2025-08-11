const nodemailer = require('nodemailer');
const notifier = require('node-notifier');
const config = require('../config');
const logger = require('../utils/logger');
const path = require('path'); // Added missing import for path

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    if (config.env.ENABLE_EMAIL_NOTIFICATIONS && config.env.EMAIL_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: config.env.EMAIL_HOST,
        port: config.env.EMAIL_PORT,
        secure: config.env.EMAIL_PORT === 465,
        auth: {
          user: config.env.EMAIL_USER,
          pass: config.env.EMAIL_PASS
        }
      });

      // Verify connection
      this.emailTransporter.verify((error, success) => {
        if (error) {
          logger.error('Email transporter verification failed', { error: error.message });
        } else {
          logger.info('Email transporter ready');
        }
      });
    }
  }

  async sendEmailNotification(bookingData) {
    if (!this.emailTransporter || !config.env.ENABLE_EMAIL_NOTIFICATIONS) {
      logger.warn('Email notifications disabled or transporter not configured');
      return false;
    }

    try {
      const { restaurantName, date, time, guests, status, confirmationNumber } = bookingData;
      
      const subject = status === 'confirmed' 
        ? `✅ Booking Confirmed: ${restaurantName}`
        : `❌ Booking Failed: ${restaurantName}`;

      const html = this.generateEmailTemplate(bookingData);

      const mailOptions = {
        from: config.env.EMAIL_USER,
        to: config.env.AIRMENUS_EMAIL,
        subject,
        html
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      logger.info('Email notification sent', { 
        messageId: info.messageId,
        restaurantName,
        status 
      });
      return true;
    } catch (error) {
      logger.error('Failed to send email notification', { 
        error: error.message,
        bookingData 
      });
      return false;
    }
  }

  generateEmailTemplate(bookingData) {
    const { restaurantName, date, time, guests, status, confirmationNumber } = bookingData;
    
    const statusColor = status === 'confirmed' ? '#28a745' : '#dc3545';
    const statusIcon = status === 'confirmed' ? '✅' : '❌';
    const statusText = status === 'confirmed' ? 'Confirmed' : 'Failed';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .status { color: ${statusColor}; font-weight: bold; font-size: 18px; }
          .details { background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
          .detail-row { margin-bottom: 10px; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Restaurant Booking ${statusIcon}</h1>
            <div class="status">Status: ${statusText}</div>
          </div>
          
          <div class="details">
            <div class="detail-row">
              <span class="label">Restaurant:</span>
              <span class="value">${restaurantName}</span>
            </div>
            <div class="detail-row">
              <span class="label">Date:</span>
              <span class="value">${date}</span>
            </div>
            <div class="detail-row">
              <span class="label">Time:</span>
              <span class="value">${time}</span>
            </div>
            <div class="detail-row">
              <span class="label">Guests:</span>
              <span class="value">${guests}</span>
            </div>
            ${confirmationNumber ? `
            <div class="detail-row">
              <span class="label">Confirmation #:</span>
              <span class="value">${confirmationNumber}</span>
            </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>This notification was sent by Restaurant Booker</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  sendDesktopNotification(bookingData) {
    if (!config.env.ENABLE_PUSH_NOTIFICATIONS) {
      return false;
    }

    try {
      const { restaurantName, date, time, guests, status } = bookingData;
      
      const title = status === 'confirmed' 
        ? `✅ Booking Confirmed`
        : `❌ Booking Failed`;

      const message = status === 'confirmed'
        ? `Your table at ${restaurantName} for ${date} at ${time} (${guests} guests) has been confirmed!`
        : `Failed to book table at ${restaurantName} for ${date} at ${time}`;

      notifier.notify({
        title,
        message,
        icon: path.join(__dirname, '../../assets/icon.png'), // Optional: add an icon
        sound: true,
        wait: true
      });

      logger.info('Desktop notification sent', { restaurantName, status });
      return true;
    } catch (error) {
      logger.error('Failed to send desktop notification', { 
        error: error.message,
        bookingData 
      });
      return false;
    }
  }

  async sendNotification(bookingData) {
    const promises = [];

    // Send email notification
    if (config.env.ENABLE_EMAIL_NOTIFICATIONS) {
      promises.push(this.sendEmailNotification(bookingData));
    }

    // Send desktop notification
    if (config.env.ENABLE_PUSH_NOTIFICATIONS) {
      promises.push(this.sendDesktopNotification(bookingData));
    }

    try {
      const results = await Promise.allSettled(promises);
      const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;
      
      logger.info('Notifications sent', { 
        total: promises.length,
        successful: successCount,
        bookingData: {
          restaurantName: bookingData.restaurantName,
          status: bookingData.status
        }
      });

      return successCount > 0;
    } catch (error) {
      logger.error('Error sending notifications', { error: error.message });
      return false;
    }
  }

  async sendBookingSuccess(bookingData) {
    return this.sendNotification({
      ...bookingData,
      status: 'confirmed'
    });
  }

  async sendBookingFailure(bookingData, error) {
    return this.sendNotification({
      ...bookingData,
      status: 'failed',
      error: error.message
    });
  }

  async sendRetryNotification(bookingData, attempt, maxAttempts) {
    if (!config.env.ENABLE_EMAIL_NOTIFICATIONS) {
      return false;
    }

    try {
      const { restaurantName, date, time, guests } = bookingData;
      
      const subject = `🔄 Retrying Booking: ${restaurantName}`;
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="warning">
              <h2>🔄 Retrying Booking</h2>
              <p><strong>Restaurant:</strong> ${restaurantName}</p>
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Time:</strong> ${time}</p>
              <p><strong>Guests:</strong> ${guests}</p>
              <p><strong>Attempt:</strong> ${attempt} of ${maxAttempts}</p>
              <p>We're retrying your booking. You'll receive another notification once complete.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: config.env.EMAIL_USER,
        to: config.env.AIRMENUS_EMAIL,
        subject,
        html
      };

      await this.emailTransporter.sendMail(mailOptions);
      logger.info('Retry notification sent', { attempt, maxAttempts, restaurantName });
      return true;
    } catch (error) {
      logger.error('Failed to send retry notification', { error: error.message });
      return false;
    }
  }
}

module.exports = new NotificationService();
