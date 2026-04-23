#!/usr/bin/env node

const inquirer = require('inquirer');
const { buildProgram } = require('./rush-booker');
const { getVenueProfile } = require('./venues/airmenusVenues');
const { getAvailableRushSlots } = require('./utils/airmenusAvailableSlots');
const {
  DEFAULT_PROFILE_PATH,
  hasBookingProfile,
  saveBookingProfile
} = require('./utils/bookingContactProfile');

const DEFAULT_TIME = '17:00';
const DEFAULT_GUESTS = '1';
const MAX_GUERILLA_GUESTS = 6;
const DEFAULT_PROFILE = 'sidharth';
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;

async function main() {
  const userArgs = process.argv.slice(2);
  const defaultDate = getOptionValue(userArgs, '--date') || process.env.GUERILLA_DATE || getDefaultBookingDate();
  const baseArgs = buildDefaultArgs(userArgs, { defaultDate });
  await ensureContactProfile([...baseArgs, ...userArgs]);

  const selectedGuestArgs = await getSelectedGuestArgs(userArgs);
  const choiceArgs = [...selectedGuestArgs, ...userArgs];
  const selectedSlotArgs = await getSelectedSlotArgs(choiceArgs, { defaultDate });
  const args = buildDefaultArgs([...selectedSlotArgs, ...choiceArgs], { defaultDate });
  const finalArgs = [...args, ...selectedSlotArgs, ...choiceArgs];

  await buildProgram().parseAsync(['node', 'guerilla-diner', ...finalArgs]);
}

async function ensureContactProfile(args) {
  if (hasAnyFlag(args, ['--help', '-h'])) {
    return;
  }

  const profileName = getOptionValue(args, '--profile') || DEFAULT_PROFILE;
  if (hasBookingProfile({ profileName })) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Booking profile "${profileName}" is missing. ` +
      'Run npm run guerilla-diner in an interactive terminal once to create it.'
    );
  }

  const contact = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Booking name',
      validate: value => Boolean(String(value || '').trim()) || 'Booking name is required'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Booking email',
      validate: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()) ||
        'Enter a valid email address'
    },
    {
      type: 'input',
      name: 'phone',
      message: 'Booking phone',
      validate: value => Boolean(String(value || '').trim()) || 'Booking phone is required'
    }
  ]);

  saveBookingProfile({ profileName, contact });
  console.log(`Saved booking profile "${profileName}" to ${DEFAULT_PROFILE_PATH}`);
}

async function getSelectedGuestArgs(
  userArgs,
  {
    prompt = inquirer.prompt,
    stdin = process.stdin,
    env = process.env
  } = {}
) {
  if (hasAnyFlag(userArgs, ['--help', '-h']) || getOptionValue(userArgs, '--guests')) {
    return [];
  }

  const defaultGuests = env.GUERILLA_GUESTS || DEFAULT_GUESTS;
  if (!stdin.isTTY) {
    return ['--guests', defaultGuests];
  }

  const answer = await prompt([{
    type: 'input',
    name: 'guests',
    message: 'How many guests?',
    default: defaultGuests,
    validate: validateGuestCount
  }]);

  return ['--guests', String(parseGuestCount(answer.guests))];
}

async function getSelectedSlotArgs(userArgs, { defaultDate }) {
  if (hasAnyFlag(userArgs, ['--help', '-h']) || getOptionValue(userArgs, '--time') || process.env.GUERILLA_TIME) {
    return [];
  }

  if (!process.stdin.isTTY) {
    return ['--time', DEFAULT_TIME];
  }

  const date = getOptionValue(userArgs, '--date') || process.env.GUERILLA_DATE || defaultDate;
  const guests = Number(getOptionValue(userArgs, '--guests') || process.env.GUERILLA_GUESTS || DEFAULT_GUESTS);
  const groupTitle = getOptionValue(userArgs, '--group-title') || process.env.GUERILLA_GROUP_TITLE;
  const venue = getVenueProfile('guerilla');
  const { slots } = await getAvailableRushSlots({ venue, date, guests, groupTitle });

  if (slots.length === 0) {
    throw new Error(`No Guerilla Diner slots with at least ${guests} seat(s) are available for ${date}`);
  }

  const answer = await inquirer.prompt([{
    type: 'list',
    name: 'slot',
    message: `Select Guerilla Diner slot for ${date}`,
    pageSize: 10,
    choices: slots.map(slot => ({
      name: `${formatSlotTime(slot.time)} - ${slot.remaining} left (${slot.groupTitle})`,
      value: slot
    }))
  }]);

  return ['--time', answer.slot.time, '--group-title', answer.slot.groupTitle];
}

function buildDefaultArgs(overrideArgs, { defaultDate = process.env.GUERILLA_DATE || getDefaultBookingDate() } = {}) {
  const args = [];

  pushDefault(args, overrideArgs, '--venue', 'guerilla');
  pushDefault(args, overrideArgs, '--date', process.env.GUERILLA_DATE || defaultDate);
  pushDefault(args, overrideArgs, '--time', process.env.GUERILLA_TIME);
  pushDefault(args, overrideArgs, '--guests', process.env.GUERILLA_GUESTS || DEFAULT_GUESTS);
  pushDefault(args, overrideArgs, '--group-title', process.env.GUERILLA_GROUP_TITLE);
  pushDefault(args, overrideArgs, '--release-at', process.env.GUERILLA_RELEASE_AT || getDefaultReleaseAt(defaultDate));
  pushDefault(args, overrideArgs, '--profile', process.env.GUERILLA_PROFILE || DEFAULT_PROFILE);
  pushDefault(args, overrideArgs, '--timeout-ms', process.env.GUERILLA_TIMEOUT_MS || '12000');
  pushDefault(args, overrideArgs, '--poll-ms', process.env.GUERILLA_POLL_MS || '500');
  pushDefault(args, overrideArgs, '--handoff-timeout-ms', process.env.GUERILLA_HANDOFF_TIMEOUT_MS || '45000');

  if (!isFalse(process.env.GUERILLA_HEADED) && !hasAnyFlag(overrideArgs, ['--headed'])) {
    args.push('--headed');
  }

  if (!isFalse(process.env.GUERILLA_TIMING) && !hasAnyFlag(overrideArgs, ['--timing'])) {
    args.push('--timing');
  }

  if (isTrue(process.env.GUERILLA_DRY_RUN) && !hasAnyFlag(overrideArgs, ['--dry-run'])) {
    args.push('--dry-run');
  }

  return args;
}

function pushDefault(args, overrideArgs, flag, value) {
  if (!value || getOptionValue(overrideArgs, flag)) {
    return;
  }

  args.push(flag, value);
}

function getOptionValue(args, flag) {
  const exactIndex = args.indexOf(flag);
  if (exactIndex >= 0) {
    return args[exactIndex + 1];
  }

  const prefix = `${flag}=`;
  const match = args.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasAnyFlag(args, flags) {
  return flags.some(flag => args.includes(flag));
}

function validateGuestCount(value) {
  return parseGuestCount(value) === null
    ? `Enter a whole number between 1 and ${MAX_GUERILLA_GUESTS}`
    : true;
}

function parseGuestCount(value) {
  const text = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(text)) {
    return null;
  }

  const guests = Number(text);
  if (!Number.isSafeInteger(guests) || guests < 1 || guests > MAX_GUERILLA_GUESTS) {
    return null;
  }

  return guests;
}

function formatSlotTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 || 12;
  return `${String(twelveHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function isFalse(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value || '').toLowerCase());
}

function getDefaultBookingDate(now = new Date()) {
  const istDate = new Date(now.getTime() + IST_OFFSET_MS);
  const istNoon = Date.UTC(
    istDate.getUTCFullYear(),
    istDate.getUTCMonth(),
    istDate.getUTCDate(),
    12
  );
  const day = new Date(istNoon).getUTCDay();
  const daysUntilFriday = (FRIDAY - day + 7) % 7;

  return formatDate(new Date(istNoon + (daysUntilFriday * DAY_MS)));
}

function getDefaultReleaseAt(bookingDate) {
  const [year, month, day] = bookingDate.split('-').map(Number);
  const bookingNoon = Date.UTC(year, month - 1, day, 12);
  const releaseDate = new Date(bookingNoon - (2 * DAY_MS));
  return `${formatDate(releaseDate)} 20:00 Asia/Kolkata`;
}

function formatDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getSelectedGuestArgs,
  parseGuestCount,
  validateGuestCount
};
