const fs = require('fs');
const path = require('path');
const {
  PRIVATE_FILE_MODE,
  tightenPathMode,
  writePrivateFile
} = require('./privateArtifacts');

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
  const parsed = readProfileData({ profilePath, readProfileFile });
  const profile = parsed.profiles?.[profileName] || parsed[profileName];
  if (!profile) {
    throw new Error(`Booking profile not found: ${profileName}`);
  }

  return profile;
}

function hasBookingProfile({ profileName, profilePath = DEFAULT_PROFILE_PATH, readProfileFile } = {}) {
  try {
    loadBookingContact({ profileName, profilePath, readProfileFile });
    return true;
  } catch (error) {
    if (
      error.message.includes('Booking profile not found') ||
      error.code === 'ENOENT' ||
      error.message.includes('Missing booking contact details')
    ) {
      return false;
    }

    throw error;
  }
}

function saveBookingProfile({
  profileName,
  contact,
  profilePath = DEFAULT_PROFILE_PATH,
  readProfileFile,
  writeProfileFile
} = {}) {
  const normalized = validateContact(contact);
  const parsed = readOptionalProfileData({ profilePath, readProfileFile });
  const nextProfileData = {
    ...parsed,
    profiles: {
      ...(parsed.profiles || {}),
      [profileName]: normalized
    }
  };
  const json = `${JSON.stringify(nextProfileData, null, 2)}\n`;

  if (writeProfileFile) {
    writeProfileFile(json);
  } else {
    writePrivateFile(profilePath, json, PRIVATE_FILE_MODE);
  }

  return normalized;
}

function readOptionalProfileData({ profilePath, readProfileFile }) {
  try {
    return readProfileData({ profilePath, readProfileFile });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { profiles: {} };
    }

    throw error;
  }
}

function readProfileData({ profilePath, readProfileFile }) {
  const readFile = readProfileFile || (() => {
    tightenPathMode(profilePath, PRIVATE_FILE_MODE);
    return fs.readFileSync(profilePath, 'utf8');
  });
  let parsed;

  try {
    parsed = JSON.parse(readFile());
  } catch (error) {
    const wrappedError = new Error(`Could not read booking profile file: ${error.message}`);
    wrappedError.code = error.code || 'INVALID_PROFILE_JSON';
    throw wrappedError;
  }

  return parsed;
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
  DEFAULT_PROFILE_PATH,
  hasBookingProfile,
  loadBookingContact,
  saveBookingProfile
};
