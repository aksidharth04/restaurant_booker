const puppeteer = require('puppeteer');
const config = require('../config');
const AirMenusApiClient = require('./AirMenusApiClient');
const { findRushSlot } = require('../utils/airmenusSlotMatcher');
const { pollForAvailability } = require('../utils/pollingScheduler');

class AirMenusRushBooker {
  constructor({
    browser,
    page,
    apiClient = new AirMenusApiClient(),
    puppeteerClient = puppeteer,
    pollForAvailability: poller = pollForAvailability,
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
    now = () => Date.now(),
    browserConfig = config.getBrowserConfig()
  } = {}) {
    this.browser = browser || null;
    this.page = page || null;
    this.apiClient = apiClient;
    this.puppeteer = puppeteerClient;
    this.pollForAvailability = poller;
    this.sleep = sleep;
    this.now = now;
    this.browserConfig = browserConfig;
  }

  async init() {
    if (this.page) {
      return;
    }

    this.browser = await this.puppeteer.launch({
      headless: this.browserConfig.headless,
      defaultViewport: this.browserConfig.viewport,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(this.browserConfig.userAgent);
    this.page.setDefaultTimeout(this.browserConfig.timeout);

    await this.page.setRequestInterception(true);
    this.page.on('request', request => {
      if (['image', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
        return;
      }

      request.continue();
    });
  }

  async run({
    venue,
    date,
    time,
    guests,
    contact,
    releaseAt,
    dryRun = false,
    prewarmMs = 180000,
    pollMs = 500,
    minPollMs = 250,
    tightPollWindowMs = 90000,
    timeoutMs = 60000,
    handoffTimeoutMs = 15000
  }) {
    const timings = createRunTimings(this.now);
    const prewarmPromise = this.startPrewarm({ venue, releaseAt, prewarmMs, timings });
    prewarmPromise.catch(() => undefined);

    try {
      const outlet = await this.apiClient.resolveOutlet(venue.brandShortName, venue.outletShortName);
      timings.mark('outlet_resolved');

      const reserveConfig = await this.apiClient.getReservationConfig(outlet.id);
      const slot = findRushSlot(reserveConfig, { date, time });
      timings.mark('reservation_config_ready');

      await prewarmPromise;

      const availability = await this.pollForAvailability({
        releaseAt,
        timeoutMs,
        pollMs,
        minPollMs,
        tightPollWindowMs,
        check: () => this.apiClient.getSlotRemainingPax({
          groupTitle: slot.groupTitle,
          bookingDt: slot.bookingDt,
          outletId: outlet.id
        }),
        isAvailable: response => getRemainingPax(response, time) >= guests
      });
      timings.mark('availability_confirmed');

      if (!availability.available) {
        return {
          status: 'sold-out-timeout',
          outlet,
          slot,
          availability,
          timings: timings.finish()
        };
      }

      if (this.shouldRefreshAfterAvailability(releaseAt)) {
        await this.refreshAfterAvailability(venue);
        timings.mark('browser_refreshed');
      } else {
        timings.mark('browser_fresh_after_release');
      }

      await this.verifyBrowserSlotState({ date, time, slot });
      timings.mark('browser_state_verified');
      await this.driveToCheckout({ date, time, guests, slot });
      timings.mark('checkout_reached');

      if (dryRun) {
        return {
          status: 'dry-run-ready',
          outlet,
          slot,
          availability,
          timings: timings.finish()
        };
      }

      await this.fillCheckout(contact);
      timings.mark('checkout_filled');
      await this.clickProceed();
      timings.mark('proceed_clicked');

      const handoff = await this.waitForHandoffState({ timeoutMs: handoffTimeoutMs });
      if (handoff.type !== 'none') {
        timings.mark('handoff_detected');
      }

      return {
        status: handoff.type === 'none' ? 'proceed-clicked' : 'handoff',
        outlet,
        slot,
        availability,
        handoff,
        timings: timings.finish()
      };
    } catch (error) {
      await prewarmPromise.catch(() => undefined);
      throw error;
    }
  }

  async startPrewarm({ venue, releaseAt, prewarmMs, timings }) {
    await this.waitUntilPrewarm(releaseAt, prewarmMs);
    await this.prewarm(venue);
    timings.mark('browser_prewarmed');
  }

  shouldRefreshAfterAvailability(releaseAt) {
    if (!releaseAt || !this.lastPrewarmStartedAt) {
      return true;
    }

    return this.lastPrewarmStartedAt < new Date(releaseAt).getTime();
  }

  async waitForHandoffState({ timeoutMs = 15000, intervalMs = 250 } = {}) {
    const startedAt = this.now();
    const deadline = startedAt + timeoutMs;

    while (this.now() <= deadline) {
      const handoff = await this.detectHandoffState();
      if (handoff.type !== 'none') {
        return {
          ...handoff,
          elapsedMs: this.now() - startedAt
        };
      }

      if (timeoutMs === 0) {
        break;
      }

      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) {
        break;
      }

      await this.sleep(Math.min(intervalMs, remainingMs));
    }

    return {
      type: 'none',
      message: 'No payment handoff detected before timeout',
      elapsedMs: this.now() - startedAt
    };
  }

  async waitUntilPrewarm(releaseAt, prewarmMs) {
    if (!releaseAt) {
      return;
    }

    const prewarmAt = new Date(releaseAt).getTime() - prewarmMs;
    const delay = prewarmAt - this.now();
    if (delay > 0) {
      await this.sleep(delay);
    }
  }

  async prewarm(venue) {
    await this.init();
    this.lastPrewarmStartedAt = this.now();
    await this.page.goto(venue.bookingUrl, { waitUntil: 'domcontentloaded' });
  }

  async refreshAfterAvailability(venue) {
    const url = new URL(venue.bookingUrl);
    url.searchParams.set('rush_refresh', String(this.now()));
    await this.page.goto(url.toString(), { waitUntil: 'networkidle2' });
  }

  async verifyBrowserSlotState({ date, slot }) {
    const verified = await this.page.evaluate(({ targetDate, groupTitle }) => {
      const bodyText = document.body.innerText || '';
      const normalizedBodyText = bodyText.toLowerCase();
      const hasGroup = normalizedBodyText.includes(String(groupTitle || '').toLowerCase());
      const hasDate = normalizedBodyText.includes(String(Number(targetDate.slice(-2)))) ||
        normalizedBodyText.includes(targetDate);

      return hasDate && hasGroup;
    }, {
      targetDate: date,
      groupTitle: slot.groupTitle
    });

    if (!verified) {
      throw new Error('Browser page did not refresh to the target AirMenus date/group state');
    }

    return true;
  }

  async driveToCheckout({ date, time, guests, slot }) {
    await this.clickDate(date);
    await this.clickGroupBook(slot.groupTitle);
    await this.waitForRouteFragment('/slots');
    await this.clickTime(time);
    await this.waitForGuestSelectionReady();
    await this.setGuestCount(guests);
    await this.clickContinue();
    await this.waitForRouteFragment('/checkout');
  }

  async clickDate(date) {
    await this.page.evaluate(targetDate => {
      const day = String(Number(targetDate.slice(-2)));
      const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      const match = candidates.find(element => {
        const text = (element.innerText || element.textContent || '').trim();
        const label = element.getAttribute('aria-label') || '';
        return text === day || label.includes(targetDate);
      });

      if (!match) {
        throw new Error(`Date button not found: ${targetDate}`);
      }

      match.click();
    }, date);
  }

  async clickGroupBook(groupTitle) {
    await this.page.evaluate(targetGroupTitle => {
      const cards = Array.from(document.querySelectorAll('div, section, article'));
      const card = cards.find(element => {
        const text = (element.innerText || '').toLowerCase();
        return text.includes(String(targetGroupTitle).toLowerCase()) && text.includes('book');
      });
      const button = card && Array.from(card.querySelectorAll('button, [role="button"]'))
        .find(element => (element.innerText || element.textContent || '').trim().toLowerCase() === 'book');

      if (!button) {
        throw new Error(`BOOK button not found for group: ${targetGroupTitle}`);
      }

      button.click();
    }, groupTitle);
  }

  async clickTime(time) {
    await this.page.evaluate(timeLabels => {
      const normalizedLabels = timeLabels.map(label => label.toLowerCase());
      const candidates = Array.from(document.querySelectorAll('p, button, [role="button"], span, div'));
      const matches = candidates
        .map(element => {
          const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const exact = normalizedLabels.some(label => text === label);
          const startsWith = normalizedLabels.some(label => text.startsWith(label));
          const includes = normalizedLabels.some(label => text.includes(label));
          const isTimeBox = (element.getAttribute('class') || '').includes('time_box');

          let score = 0;
          if (exact) score = 4;
          else if (isTimeBox && startsWith) score = 3;
          else if (startsWith) score = 2;
          else if (includes) score = 1;

          return { element, score, textLength: text.length };
        })
        .filter(match => match.score > 0)
        .sort((left, right) => right.score - left.score || left.textLength - right.textLength);

      const match = matches[0]?.element;

      if (!match) {
        throw new Error(`Time option not found: ${timeLabels[0]}`);
      }

      const clickable = match.closest?.('[class*="time_box"], button, [role="button"]') || match;
      clickable.click();
    }, getTimeLabels(time));
  }

  async setGuestCount(guests) {
    const updated = await this.page.evaluate(targetGuests => {
      const bodyText = document.body.innerText || '';
      if (bodyText.includes(`${targetGuests} Guest`) || bodyText.includes(`${targetGuests} guest`)) {
        return true;
      }

      const plusButtons = Array.from(document.querySelectorAll(
        'button, [role="button"], [class*="action_btns"], span[aria-label], svg[data-icon]'
      ))
        .map(element => {
          if (element.matches?.('button, [role="button"], a')) {
            return element;
          }

          return element.closest?.('button, [role="button"], a') || element;
        })
        .filter((element, index, elements) => elements.indexOf(element) === index)
        .filter(element => {
          const label = [
            element.innerText,
            element.textContent,
            element.getAttribute('aria-label'),
            element.getAttribute('data-icon'),
            element.querySelector('[aria-label]')?.getAttribute('aria-label'),
            element.querySelector('[data-icon]')?.getAttribute('data-icon')
          ].filter(Boolean).join(' ').toLowerCase();

          return ['+', 'add', 'increase', 'plus'].some(token => label.includes(token));
        });

      if (plusButtons.length === 0) {
        return false;
      }

      const hasCustomGuestCounters = [
        'vegetarian preference',
        'non-vegetarian preference',
        'male guests',
        'female guests',
        'number of couples'
      ].some(label => bodyText.toLowerCase().includes(label));

      const clicksNeeded = hasCustomGuestCounters ? targetGuests : Math.max(0, targetGuests - 1);
      for (let index = 0; index < clicksNeeded; index += 1) {
        plusButtons[0].click();
      }

      return true;
    }, guests);

    if (!updated) {
      const controls = await this.describeGuestControls();
      throw new Error(`Guest increment button not found for ${guests} guest(s). Controls: ${controls}`);
    }

    await this.sleep(250);
  }

  async waitForGuestSelectionReady() {
    if (!this.page.waitForFunction) {
      return;
    }

    await this.page.waitForFunction(() => {
      const bodyText = (document.body.innerText || '').toLowerCase();
      const hasGuestSection = bodyText.includes('number of guest(s)') ||
        bodyText.includes('vegetarian preference') ||
        bodyText.includes('non-vegetarian preference');
      const isCheckingAvailability = bodyText.includes('checking slot availability');

      return hasGuestSection && !isCheckingAvailability;
    }, { timeout: 10000 });
  }

  async describeGuestControls() {
    if (!this.page.evaluate) {
      return 'unavailable';
    }

    try {
      return await this.page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll(
          'button, [role="button"], a, [class*="action_btns"], span[aria-label], svg[data-icon]'
        ))
          .map(element => ({
            tag: element.tagName,
            text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
            ariaLabel: element.getAttribute('aria-label'),
            className: element.getAttribute('class'),
            childAria: element.querySelector('[aria-label]')?.getAttribute('aria-label'),
            childIcon: element.querySelector('[data-icon]')?.getAttribute('data-icon')
          }))
          .slice(0, 20)
          .map(item => [
            item.tag,
            item.text && `text=${item.text}`,
            item.ariaLabel && `aria=${item.ariaLabel}`,
            item.className && `class=${item.className}`,
            item.childAria && `childAria=${item.childAria}`,
            item.childIcon && `childIcon=${item.childIcon}`
          ].filter(Boolean).join(' '))
          .join(' | ');

        const html = document.body.innerHTML || '';
        const guestIndex = html.toLowerCase().indexOf('number of guest');
        const guestHtml = guestIndex >= 0
          ? html.slice(Math.max(0, guestIndex - 500), guestIndex + 1500).replace(/\s+/g, ' ')
          : '';

        return `${controls} :: guestHtml=${guestHtml.slice(0, 1500)}`;
      });
    } catch (error) {
      return `could not read controls: ${error.message}`;
    }
  }

  async clickContinue() {
    await this.clickButtonByText(['continue', 'proceed']);
  }

  async fillCheckout(contact) {
    await this.typeFirstMatching([
      'input[name="name"]',
      'input[placeholder*="Name" i]',
      'input[aria-label*="Name" i]'
    ], contact.name);

    await this.typeFirstMatching([
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="Email" i]'
    ], contact.email);

    await this.typeFirstMatching([
      'input[name="mobile"]',
      'input[name="phone"]',
      'input[type="tel"]',
      'input[placeholder*="Mobile" i]',
      'input[placeholder*="Phone" i]'
    ], contact.phone);
  }

  async typeFirstMatching(selectors, value) {
    for (const selector of selectors) {
      const element = await this.page.$(selector);
      if (element) {
        await element.click({ clickCount: 3 });
        await element.type(value);
        return true;
      }
    }

    throw new Error(`Checkout input not found for value: ${value}`);
  }

  async clickProceed() {
    await this.page.evaluate(() => {
      Array.from(document.querySelectorAll('input[type="checkbox"]')).forEach(input => {
        if (!input.checked) {
          input.click();
        }
      });
    });

    await this.clickButtonByText(['proceed', 'confirm booking', 'pay now']);
  }

  async clickButtonByText(labels) {
    await this.page.evaluate(targetLabels => {
      const normalizedLabels = targetLabels.map(label => label.toLowerCase());
      const button = Array.from(document.querySelectorAll('button, [role="button"]')).find(element => {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        return normalizedLabels.some(label => text.includes(label));
      });

      if (!button) {
        throw new Error(`Button not found: ${targetLabels.join(', ')}`);
      }

      button.click();
    }, labels);
  }

  async waitForRouteFragment(fragment) {
    if (!this.page.waitForFunction) {
      return;
    }

    try {
      await this.page.waitForFunction(routeFragment => window.location.pathname.includes(routeFragment), {}, fragment);
    } catch (error) {
      const pageState = await this.describePageState();
      throw new Error(
        `Timed out waiting for AirMenus route ${fragment}. ` +
        `Current URL: ${pageState.url}. ` +
        `Visible text: ${pageState.visibleText}. ` +
        `Original error: ${error.message}`
      );
    }
  }

  async describePageState() {
    if (!this.page.evaluate) {
      return { url: 'unknown', visibleText: 'unavailable' };
    }

    try {
      return await this.page.evaluate(() => ({
        url: window.location.href,
        visibleText: (document.body.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400)
      }));
    } catch (error) {
      return {
        url: 'unavailable',
        visibleText: `could not read page state: ${error.message}`
      };
    }
  }

  async detectHandoffState() {
    return this.page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      const href = window.location.href.toLowerCase();
      const frames = Array.from(document.querySelectorAll('iframe')).map(frame => ({
        src: frame.getAttribute('src') || '',
        title: frame.getAttribute('title') || '',
        name: frame.getAttribute('name') || ''
      }));
      const hasPaymentFrame = frames.some(frame => {
        const value = `${frame.src} ${frame.title} ${frame.name}`.toLowerCase();
        return value.includes('razorpay') || value.includes('payment') || value.includes('upi');
      });
      const hasVisiblePaymentContainer = Array.from(document.querySelectorAll(
        '[class*="razorpay" i], [id*="razorpay" i], [class*="payment" i], [id*="payment" i]'
      )).some(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0;
      });

      if (
        hasPaymentFrame ||
        hasVisiblePaymentContainer ||
        href.includes('razorpay') ||
        href.includes('payment') ||
        text.includes('razorpay') ||
        text.includes('upi')
      ) {
        return { type: 'payment', message: 'Payment handoff detected' };
      }

      if (text.includes('captcha') || text.includes('challenge') || text.includes('otp')) {
        return { type: 'challenge', message: 'Challenge or OTP handoff detected' };
      }

      return { type: 'none', message: '' };
    });
  }

  async close({ keepOpen = false } = {}) {
    if (!this.browser) {
      return;
    }

    if (keepOpen) {
      const browserProcess = typeof this.browser.process === 'function' ? this.browser.process() : null;
      if (typeof this.browser.disconnect === 'function') {
        this.browser.disconnect();
      }
      if (browserProcess && typeof browserProcess.unref === 'function') {
        browserProcess.unref();
      }
      return;
    }

    await this.browser.close();
  }
}

function getRemainingPax(response, time) {
  const value = response?.[time] ?? response?.total_pax_left ?? response?.pax ?? 0;
  if (typeof value === 'number') {
    return value;
  }

  return Number(value.total_pax_left ?? value.pax ?? value.remaining ?? 0);
}

function getTimeLabels(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 || 12;

  return [
    time,
    `${twelveHour}:${String(minutes).padStart(2, '0')} ${suffix}`,
    `${String(twelveHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`
  ];
}

function createRunTimings(now) {
  const startedAt = now();
  const marks = [];

  return {
    mark(label) {
      marks.push({
        label,
        elapsedMs: now() - startedAt
      });
    },
    finish() {
      return {
        totalMs: now() - startedAt,
        marks: [...marks]
      };
    }
  };
}

module.exports = AirMenusRushBooker;
