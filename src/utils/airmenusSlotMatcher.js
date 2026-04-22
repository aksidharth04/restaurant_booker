const IST_OFFSET_MINUTES = 330;

function findRushSlot(config, { date, time, groupTitle }) {
  const dateSetting = getDateSetting(config, date);
  if (!dateSetting?.is_open) {
    throw new Error(`AirMenus date is not open: ${date}`);
  }

  const groups = dateSetting.slot_groups || [];
  const group = groups.find(candidate => {
    const hasRequestedTime = (candidate.available_times || []).some(slotTime => slotTime.time === time);
    if (groupTitle) {
      return normalize(candidate.title) === normalize(groupTitle) && hasRequestedTime;
    }
    return hasRequestedTime;
  });

  if (!group) {
    throw new Error(`AirMenus slot group not found for ${date} ${time}`);
  }

  const timeOption = (group.available_times || []).find(slotTime => slotTime.time === time);

  return {
    date,
    dateSetting,
    group,
    groupTitle: group.title,
    time: timeOption,
    bookingDt: makeBookingDateTime(date, time)
  };
}

function getDateSetting(config, date) {
  const settings = config?.setting || {};
  if (settings[date]) {
    return settings[date];
  }

  const weekday = new Date(`${date}T12:00:00.000Z`)
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    .toLowerCase();

  return settings[weekday];
}

function makeBookingDateTime(date, time) {
  const dateMatch = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time).match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    throw new Error('Booking date/time must use YYYY-MM-DD and HH:mm');
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute) - IST_OFFSET_MINUTES,
    0
  )).toISOString();
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = {
  findRushSlot,
  getDateSetting,
  makeBookingDateTime
};
