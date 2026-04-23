#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const moment = require('moment');
const { getVenueProfile, listVenueKeys } = require('./venues/airmenusVenues');
const { resolveReleaseAt } = require('./utils/rushReleaseTiming');
const { loadBookingContact } = require('./utils/bookingContactProfile');
const AirMenusRushBooker = require('./services/AirMenusRushBooker');
const config = require('./config');

function buildProgram({ runnerFactory = options => new AirMenusRushBooker(options) } = {}) {
  const program = new Command();

  program
    .name('airmenus-rush')
    .description('Rush-mode AirMenus booking helper for Naru and Guerilla Diner')
    .version('1.0.0')
    .requiredOption('--venue <venue>', `Venue key (${listVenueKeys().join(', ')})`)
    .requiredOption('--date <YYYY-MM-DD>', 'Booking date')
    .requiredOption('--time <HH:mm>', 'Desired booking time')
    .option('--guests <number>', 'Number of guests')
    .option('--group-title <title>', 'Specific AirMenus slot group title')
    .option('--release-at <datetime>', 'Release time as ISO or "YYYY-MM-DD HH:mm Asia/Kolkata"')
    .option('--profile <name>', 'Ignored local booking contact profile name')
    .option('--prewarm-ms <number>', 'Milliseconds before release to prewarm browser', '180000')
    .option('--poll-ms <number>', 'Polling interval in milliseconds', '500')
    .option('--tight-poll-window-ms <number>', 'High-frequency polling window around release', '90000')
    .option('--timeout-ms <number>', 'Stop polling after this many milliseconds', '60000')
    .option('--handoff-timeout-ms <number>', 'Wait this long after Proceed for Razorpay/UPI handoff', '15000')
    .option('--timing', 'Print timing checkpoints for the rush flow')
    .option('--dry-run', 'Stop after verifying the slot is available and the page is fresh')
    .option('--headed', 'Run the booking browser visibly and keep it open after a live proceed')
    .action(async options => {
      await runRush(options, { runnerFactory });
    });

  return program;
}

async function runRush(options, { runnerFactory = runnerOptions => new AirMenusRushBooker(runnerOptions) } = {}) {
  const venue = getVenueProfile(options.venue);
  const request = normalizeRequest(options, venue);
  const releaseAt = resolveReleaseAt({
    venue,
    bookingDate: request.date,
    releaseAt: options.releaseAt
  });
  const contact = options.dryRun ? null : loadBookingContact({ profileName: options.profile });
  const booker = runnerFactory(buildRunnerOptions(options));
  let result;

  try {
    printStart({ venue, request, releaseAt, dryRun: options.dryRun });
    result = await booker.run({
      venue,
      ...request,
      contact,
      releaseAt,
      dryRun: Boolean(options.dryRun)
    });

    printResult(result, { showTiming: Boolean(options.timing) });
    return result;
  } finally {
    await booker.close({ keepOpen: shouldKeepBrowserOpen(options, result) });
  }
}

function buildRunnerOptions(options) {
  if (!options.headed && options.dryRun) {
    return {};
  }

  return {
    browserConfig: {
      ...config.getBrowserConfig(),
      headless: false
    }
  };
}

function shouldKeepBrowserOpen(options, result) {
  if (options.dryRun) {
    return false;
  }

  return Boolean(
    options.headed
    || result?.status === 'handoff'
    || result?.status === 'proceed-clicked'
  );
}

function normalizeRequest(options, venue) {
  if (!moment(options.date, 'YYYY-MM-DD', true).isValid()) {
    throw new Error('Invalid --date. Use YYYY-MM-DD.');
  }

  if (!moment(options.time, 'HH:mm', true).isValid()) {
    throw new Error('Invalid --time. Use HH:mm.');
  }

  const guests = parseInteger(options.guests || venue.defaultGuests, '--guests');
  const prewarmMs = parseInteger(options.prewarmMs, '--prewarm-ms');
  const pollMs = parseInteger(options.pollMs, '--poll-ms');
  const tightPollWindowMs = parseInteger(options.tightPollWindowMs, '--tight-poll-window-ms');
  const timeoutMs = parseInteger(options.timeoutMs, '--timeout-ms');
  const handoffTimeoutMs = parseInteger(options.handoffTimeoutMs, '--handoff-timeout-ms');

  if (guests < 1) {
    throw new Error('--guests must be at least 1');
  }

  return {
    date: options.date,
    time: options.time,
    groupTitle: options.groupTitle,
    guests,
    prewarmMs,
    pollMs,
    tightPollWindowMs,
    timeoutMs,
    handoffTimeoutMs
  };
}

function parseInteger(value, flagName) {
  const text = String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    throw new Error(`${flagName} must be a whole number`);
  }

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flagName} must be a safe whole number`);
  }
  return parsed;
}

function printStart({ venue, request, releaseAt, dryRun }) {
  console.log(chalk.cyan(`Rush booking: ${venue.name}`));
  console.log(chalk.gray(`Target: ${request.date} ${request.time} for ${request.guests}`));
  console.log(chalk.gray(`Release: ${releaseAt.toISOString()}`));
  if (dryRun) {
    console.log(chalk.yellow('Dry run: will stop before checkout proceed.'));
  }
}

function printResult(result, { showTiming = false } = {}) {
  if (result.status === 'dry-run-ready') {
    console.log(chalk.green('Dry run ready: slot detected and browser state refreshed.'));
    printTiming(result, { showTiming });
    return;
  }

  if (result.status === 'handoff') {
    console.log(chalk.green('Payment/UPI handoff reached. Browser left open for payment.'));
    printTiming(result, { showTiming });
    return;
  }

  if (result.status === 'sold-out-timeout') {
    console.log(chalk.yellow('Timed out before the requested slot became available.'));
    printTiming(result, { showTiming });
    return;
  }

  console.log(chalk.green(`Rush result: ${result.status}`));
  printTiming(result, { showTiming });
}

function printTiming(result, { showTiming = false } = {}) {
  if (!showTiming || !result.timings) {
    return;
  }

  const handoffMark = result.timings.marks.find(mark => mark.label === 'handoff_detected');
  const proceedMark = result.timings.marks.find(mark => mark.label === 'proceed_clicked');
  const targetMark = handoffMark || proceedMark;
  const targetLabel = handoffMark ? 'payment handoff' : 'proceed click';

  console.log(chalk.gray('Timing checkpoints:'));
  result.timings.marks.forEach(mark => {
    console.log(chalk.gray(`  ${mark.label}: ${mark.elapsedMs}ms`));
  });
  console.log(chalk.gray(`  total: ${result.timings.totalMs}ms`));

  if (targetMark) {
    const color = targetMark.elapsedMs <= 5000 ? chalk.green : chalk.yellow;
    console.log(color(`Time to ${targetLabel}: ${targetMark.elapsedMs}ms`));
  }
}

if (require.main === module) {
  buildProgram().parseAsync(process.argv).catch(error => {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  });
}

module.exports = {
  buildProgram,
  runRush,
  normalizeRequest
};
