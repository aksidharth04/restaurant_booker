const https = require('https');

const DEFAULT_BASE_URL = 'https://apis.airmenus.in/api/';
const DEFAULT_TIMEOUT_MS = 10000;

class AirMenusApiClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, request, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.request = request || defaultRequest;
    this.timeoutMs = timeoutMs;
  }

  async getRestaurantDetails(brandShortName) {
    const url = this.makeUrl('restaurant/details/bookings/');
    url.searchParams.set('rest_short_name', brandShortName);
    return this.request({ method: 'GET', url, timeoutMs: this.timeoutMs });
  }

  async resolveOutlet(brandShortName, outletShortName) {
    const details = await this.getRestaurantDetails(brandShortName);
    const outlet = (details.outlets || []).find(item => item.short_name === outletShortName);

    if (!outlet) {
      throw new Error(`AirMenus outlet not found: ${brandShortName}/${outletShortName}`);
    }

    return outlet;
  }

  async getReservationConfig(outletId) {
    return this.request({
      method: 'GET',
      url: this.makeUrl(`reservations/config/${outletId}/`),
      timeoutMs: this.timeoutMs
    });
  }

  async getSlotRemainingPax({ groupTitle, bookingDt, outletId }) {
    const url = this.makeUrl('reservations/slot_group/remaining/paxs/');
    url.searchParams.set('group_title', groupTitle);
    url.searchParams.set('booking_dt', bookingDt);
    url.searchParams.set('outlet_id', String(outletId));

    return this.request({ method: 'GET', url, timeoutMs: this.timeoutMs });
  }

  makeUrl(path) {
    return new URL(path, this.baseUrl);
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function defaultRequest({ method, url, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };
    const request = https.request(url, { method }, response => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          const error = new Error(`AirMenus API returned HTTP ${status}`);
          error.status = status;
          error.body = body;
          settle(reject, error);
          return;
        }

        try {
          settle(resolve, body ? JSON.parse(body) : {});
        } catch (error) {
          settle(reject, new Error(`Invalid AirMenus JSON response: ${error.message}`));
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`AirMenus API request timed out after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', error => settle(reject, error));
    request.end();
  });
}

module.exports = AirMenusApiClient;
