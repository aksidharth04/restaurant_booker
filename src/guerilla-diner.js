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

const DEFAULT_DATE = '2026-04-24';
const DEFAULT_TIME = '17:00';
const DEFAULT_GUESTS = '1';
const DEFAULT_RELEASE_AT = '2026-04-22 20:00 Asia/Kolkata';
const DEFAULT_PROFILE = 'sidharth';

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const userArgs = process.argv.slice(2);
  const selectedSlotArgs = await getSelectedSlotArgs(userArgs);
  const args = buildDefaultArgs([...selectedSlotArgs, ...userArgs]);
  const finalArgs = [...args, ...selectedSlotArgs, ...userArgs];

  await ensureContactProfile(finalArgs);
  await buildProgram().parseAsync(['node', 'guerilla-diner', ...finalArgs]);
}

async function ensureContactProfile(args) {
  if (hasAnyFlag(args, ['--help', '-h', '--dry-run'])) {
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
      name: process.env.COMAL_BOOKING_NAME || 'Your Name',
      message: 'Booking name',
      validate: value => Boolean(String(value || '').trim()) || 'Booking name is required'
    },
    {
      type: 'input',
      name: process.env.COMAL_BOOKING_NAME || 'Your Name',
      message: 'Booking email',
      validate: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()) ||
        'Enter a valid email address'
    },
    {
      type: 'input',
      name: process.env.COMAL_BOOKING_NAME || 'Your Name',
      message: 'Booking phone',
      validate: value => Boolean(String(value || '').trim()) || 'Booking phone is required'
    }
  ]);

  saveBookingProfile({ profileName, contact });
  console.log(`Saved booking profile "${profileName}" to ${DEFAULT_PROFILE_PATH}`);
}

async function getSelectedSlotArgs(userArgs) {
  if (hasAnyFlag(userArgs, ['--help', '-h']) || getOptionValue(userArgs, '--time') || process.env.GUERILLA_TIME) {
    return [];
  }

  if (!process.stdin.isTTY) {
    return ['--time', DEFAULT_TIME];
  }

  const date = getOptionValue(userArgs, '--date') || process.env.GUERILLA_DATE || DEFAULT_DATE;
  const guests = Number(getOptionValue(userArgs, '--guests') || process.env.GUERILLA_GUESTS || DEFAULT_GUESTS);
  const groupTitle = getOptionValue(userArgs, '--group-title') || process.env.GUERILLA_GROUP_TITLE;
  const venue = getVenueProfile('guerilla');
  const { slots } = await getAvailableRushSlots({ venue, date, guests, groupTitle });

  if (slots.length === 0) {
    throw new Error(`No Guerilla Diner slots with at least ${guests} seat(s) are available for ${date}`);
  }

  const answer = await inquirer.prompt([{
    type: 'list',
    name: process.env.COMAL_BOOKING_NAME || 'Your Name',
    message: `Select Guerilla Diner slot for ${date}`,
    pageSize: 10,
    choices: slots.map(slot => ({
      name: `${formatSlotTime(slot.time)} - ${slot.remaining} left (${slot.groupTitle})`,
      value: slot
    }))
  }]);

  return ['--time', answer.slot.time, '--group-title', answer.slot.groupTitle];
}

function buildDefaultArgs(overrideArgs) {
  const args = [];

  pushDefault(args, overrideArgs, '--venue', 'guerilla');
  pushDefault(args, overrideArgs, '--date', process.env.GUERILLA_DATE || DEFAULT_DATE);
  pushDefault(args, overrideArgs, '--time', process.env.GUERILLA_TIME);
  pushDefault(args, overrideArgs, '--guests', process.env.GUERILLA_GUESTS || DEFAULT_GUESTS);
  pushDefault(args, overrideArgs, '--group-title', process.env.GUERILLA_GROUP_TITLE);
  pushDefault(args, overrideArgs, '--release-at', process.env.GUERILLA_RELEASE_AT || DEFAULT_RELEASE_AT);
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
