const VENUES = {
  naru: {
    key: 'naru',
    name: process.env.COMAL_BOOKING_NAME || 'Your Name',
    bookingUrl: 'https://bookings.airmenus.in/eatnaru/order',
    brandShortName: 'eatnaru',
    outletShortName: 'order',
    defaultGuests: 2,
    releasePolicy: {
      type: 'weekly',
      day: 'monday',
      hour: 20,
      minute: 0,
      timezone: 'Asia/Kolkata'
    }
  },
  guerilla: {
    key: 'guerilla',
    name: process.env.COMAL_BOOKING_NAME || 'Your Name',
    bookingUrl: 'https://bookings.airmenus.in/guerilladiner/order',
    brandShortName: 'guerilladiner',
    outletShortName: 'order',
    defaultGuests: 2,
    releasePolicy: {
      type: 'explicit'
    }
  }
};

function getVenueProfile(key) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  const venue = VENUES[normalizedKey];

  if (!venue) {
    throw new Error(`Unknown AirMenus venue: ${key}`);
  }

  return { ...venue, releasePolicy: { ...venue.releasePolicy } };
}

function listVenueKeys() {
  return Object.keys(VENUES);
}

module.exports = {
  getVenueProfile,
  listVenueKeys
};
