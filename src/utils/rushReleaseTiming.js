const IST_OFFSET_MINUTES = 330;

function parseReleaseAt(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const localIstMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s+(Asia\/Kolkata|Asia\/Calcutta|IST)$/i);
  if (localIstMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localIstMatch;
    return makeIstDate({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second)
    });
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid release-at value: ${value}`);
  }

  return parsed;
}

function resolveReleaseAt({ venue, bookingDate, releaseAt }) {
  const explicitReleaseAt = parseReleaseAt(releaseAt);
  if (explicitReleaseAt) {
    return explicitReleaseAt;
  }

  if (!venue?.releasePolicy) {
    throw new Error(`Venue ${venue?.key || 'unknown'} has no release policy; pass --release-at`);
  }

  if (venue.releasePolicy.type === 'weekly') {
    return deriveWeeklyReleaseAt(bookingDate, venue.releasePolicy);
  }

  throw new Error(`Venue ${venue.key} requires --release-at until its release rule is verified`);
}

function deriveWeeklyReleaseAt(bookingDate, releasePolicy) {
  if (releasePolicy.day !== 'monday' || releasePolicy.timezone !== 'Asia/Kolkata') {
    throw new Error('Unsupported venue release policy');
  }

  const bookingParts = parseDateParts(bookingDate);
  const bookingUtcNoon = new Date(Date.UTC(bookingParts.year, bookingParts.month - 1, bookingParts.day, 12));
  const dayOfWeek = bookingUtcNoon.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const releaseDay = new Date(bookingUtcNoon.getTime() - (daysSinceMonday * 24 * 60 * 60 * 1000));

  return makeIstDate({
    year: releaseDay.getUTCFullYear(),
    month: releaseDay.getUTCMonth() + 1,
    day: releaseDay.getUTCDate(),
    hour: releasePolicy.hour,
    minute: releasePolicy.minute,
    second: 0
  });
}

function parseDateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Booking date must use YYYY-MM-DD');
  }

  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
}

function makeIstDate({ year, month, day, hour, minute, second }) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute - IST_OFFSET_MINUTES, second || 0));
}

module.exports = {
  parseReleaseAt,
  resolveReleaseAt
};
