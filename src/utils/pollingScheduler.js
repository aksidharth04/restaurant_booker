const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_POLL_MS = 500;
const DEFAULT_MIN_POLL_MS = 250;
const DEFAULT_TIGHT_WINDOW_MS = 90000;

async function pollForAvailability({
  check,
  isAvailable,
  releaseAt,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  minPollMs = DEFAULT_MIN_POLL_MS,
  tightPollWindowMs = DEFAULT_TIGHT_WINDOW_MS,
  now = () => Date.now(),
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  random = Math.random
}) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const releaseMs = releaseAt ? new Date(releaseAt).getTime() : startedAt;
  const tightWindowStart = releaseMs - tightPollWindowMs;
  let attempts = 0;
  let transientFailures = 0;

  while (now() < deadline) {
    if (now() < tightWindowStart) {
      await sleepBounded(tightWindowStart - now(), deadline, now, sleep);
      continue;
    }

    attempts += 1;

    try {
      const response = await check({ attempt: attempts });
      transientFailures = 0;

      if (isAvailable(response)) {
        return {
          available: true,
          response,
          attempts,
          elapsedMs: now() - startedAt
        };
      }
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }

      transientFailures += 1;
      await sleepBounded(getBackoffDelay(error, transientFailures, pollMs, minPollMs), deadline, now, sleep);
      continue;
    }

    await sleepBounded(getPollDelay(pollMs, minPollMs, random), deadline, now, sleep);
  }

  return {
    available: false,
    response: null,
    attempts,
    elapsedMs: now() - startedAt
  };
}

function getPollDelay(pollMs, minPollMs, random) {
  const baseDelay = Math.max(Number(pollMs) || 0, Number(minPollMs) || DEFAULT_MIN_POLL_MS);
  const jitterFactor = 0.9 + (random() * 0.2);
  return Math.max(minPollMs, Math.round(baseDelay * jitterFactor));
}

function getBackoffDelay(error, transientFailures, pollMs, minPollMs) {
  const baseDelay = Math.max(Number(pollMs) || 0, Number(minPollMs) || DEFAULT_MIN_POLL_MS);

  if (error.status === 429) {
    return Math.max(1000, baseDelay * 4);
  }

  return Math.min(5000, Math.max(500, baseDelay * Math.pow(2, transientFailures)));
}

function isRetryable(error) {
  return error.status === 429 || (error.status >= 500 && error.status < 600);
}

async function sleepBounded(delay, deadline, now, sleep) {
  const remaining = deadline - now();
  const boundedDelay = Math.max(0, Math.min(delay, remaining));

  if (boundedDelay > 0) {
    await sleep(boundedDelay);
  }
}

module.exports = {
  pollForAvailability,
  getPollDelay,
  getBackoffDelay
};
