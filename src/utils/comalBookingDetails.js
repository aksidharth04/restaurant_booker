const CONTACT_ENV = {
  name: process.env.COMAL_BOOKING_NAME || 'Your Name',
  email: process.env.COMAL_BOOKING_EMAIL || 'your-booking-email@example.com',
  phone: process.env.COMAL_BOOKING_PHONE || 'your-phone-number'
};

function getComalBookingDetails() {
  return {
    name: process.env[CONTACT_ENV.name] || '',
    email: process.env[CONTACT_ENV.email] || '',
    phone: process.env[CONTACT_ENV.phone] || ''
  };
}

function requireComalBookingDetails() {
  const details = getComalBookingDetails();
  const missing = Object.entries(CONTACT_ENV)
    .filter(([field]) => !details[field])
    .map(([, envName]) => envName);

  if (missing.length > 0) {
    throw new Error(`Missing Comal booking contact details. Set ${missing.join(', ')} in your environment.`);
  }

  return details;
}

function displayContactValue(value, envName) {
  return value || `<set ${envName}>`;
}

module.exports = {
  CONTACT_ENV,
  displayContactValue,
  getComalBookingDetails,
  requireComalBookingDetails
};
