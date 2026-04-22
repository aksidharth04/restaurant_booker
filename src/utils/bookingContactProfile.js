const fs = require('fs');
const path = require('path');

const DEFAULT_PROFILE_PATH = path.join(process.cwd(), '.booking-profiles.local.json');

function loadBookingContact({
  env = process.env,
  profileName,
  profilePath = DEFAULT_PROFILE_PATH,
  readProfileFile
} = {}) {
  const contact = profileName
    ? loadProfileContact({ profileName, profilePath, readProfileFile })
    : {
        name: env.BOOKING_NAME,
        email: env.BOOKING_EMAIL,
        phone: env.BOOKING_PHONE
      };

  return validateContact(contact);
}

function loadProfileContact({ profileName, profilePath, readProfileFile }) {
  const readFile = readProfileFile || (() => fs.readFileSync(profilePath, 'utf8'));
  let parsed;

  try {
    parsed = JSON.parse(readFile());
  } catch (error) {
    throw new Error(`Could not read booking profile file: ${error.message}`);
  }

  const profile = parsed.profiles?.[profileName] || parsed[profileName];
  if (!profile) {
    throw new Error(`Booking profile not found: ${profileName}`);
  }

  return profile;
}

function validateContact(contact) {
  const normalized = {
    name: String(contact?.name || '').trim(),
    email: String(contact?.email || '').trim(),
    phone: String(contact?.phone || '').trim()
  };

  const missing = [];
  if (!normalized.name) missing.push('BOOKING_NAME');
  if (!normalized.email) missing.push('BOOKING_EMAIL');
  if (!normalized.phone) missing.push('BOOKING_PHONE');

  if (missing.length > 0) {
    throw new Error(`Missing booking contact details: ${missing.join(', ')}`);
  }

  return normalized;
}

module.exports = {
  loadBookingContact
};
