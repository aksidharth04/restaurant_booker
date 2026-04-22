const AirMenusApiClient = require('../services/AirMenusApiClient');
const { getDateSetting, makeBookingDateTime } = require('./airmenusSlotMatcher');

async function getAvailableRushSlots({
  venue,
  date,
  guests = 1,
  groupTitle,
  apiClient = new AirMenusApiClient()
}) {
  const outlet = await apiClient.resolveOutlet(venue.brandShortName, venue.outletShortName);
  const reserveConfig = await apiClient.getReservationConfig(outlet.id);
  const dateSetting = getDateSetting(reserveConfig, date);

  if (!dateSetting?.is_open) {
    throw new Error(`AirMenus date is not open: ${date}`);
  }

  const requestedGroupTitle = normalize(groupTitle);
  const groups = (dateSetting.slot_groups || [])
    .filter(group => !requestedGroupTitle || normalize(group.title) === requestedGroupTitle);
  const slots = [];

  for (const group of groups) {
    const times = (group.available_times || [])
      .map(slot => slot.time)
      .filter(Boolean)
      .sort();

    if (times.length === 0) {
      continue;
    }

    const remainingPax = await apiClient.getSlotRemainingPax({
      groupTitle: group.title,
      bookingDt: makeBookingDateTime(date, times[0]),
      outletId: outlet.id
    });

    times.forEach(time => {
      const remaining = getRemainingPax(remainingPax, time);
      if (remaining >= guests) {
        slots.push({
          date,
          time,
          groupTitle: group.title,
          remaining
        });
      }
    });
  }

  return {
    outlet,
    dateSetting,
    slots: slots.sort((left, right) => left.time.localeCompare(right.time))
  };
}

function getRemainingPax(response, time) {
  const value = response?.[time] ?? response?.total_pax_left ?? response?.pax ?? 0;
  if (typeof value === 'number') {
    return value;
  }

  return Number(value.total_pax_left ?? value.pax ?? value.remaining ?? 0);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = {
  getAvailableRushSlots
};
