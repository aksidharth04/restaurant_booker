#!/usr/bin/env node

const { buildProgram } = require('./rush-booker');

const DEFAULT_ARGS = [
  '--venue', 'guerilla',
  '--date', process.env.GUERILLA_DATE || '2026-04-24',
  '--time', process.env.GUERILLA_TIME || '17:00',
  '--guests', process.env.GUERILLA_GUESTS || '1',
  '--release-at', process.env.GUERILLA_RELEASE_AT || '2026-04-22 20:00 Asia/Kolkata',
  '--profile', process.env.GUERILLA_PROFILE || 'sidharth',
  '--timeout-ms', process.env.GUERILLA_TIMEOUT_MS || '12000',
  '--poll-ms', process.env.GUERILLA_POLL_MS || '500',
  '--handoff-timeout-ms', process.env.GUERILLA_HANDOFF_TIMEOUT_MS || '45000'
];

if (!isFalse(process.env.GUERILLA_HEADED)) {
  DEFAULT_ARGS.push('--headed');
}

if (!isFalse(process.env.GUERILLA_TIMING)) {
  DEFAULT_ARGS.push('--timing');
}

if (isTrue(process.env.GUERILLA_DRY_RUN)) {
  DEFAULT_ARGS.push('--dry-run');
}

buildProgram()
  .parseAsync(['node', 'guerilla-diner', ...DEFAULT_ARGS, ...process.argv.slice(2)])
  .catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });

function isTrue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function isFalse(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value || '').toLowerCase());
}
