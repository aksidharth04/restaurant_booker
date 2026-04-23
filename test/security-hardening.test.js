/* eslint-env jest */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../src/config');
const notificationService = require('../src/services/NotificationService');
const {
  saveBookingProfile
} = require('../src/utils/bookingContactProfile');
const {
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE
} = require('../src/utils/privateArtifacts');
const { REDACTED, redactSensitive } = require('../src/utils/redaction');

const repoRoot = path.resolve(__dirname, '..');

function modeOf(targetPath) {
  return fs.statSync(targetPath).mode & 0o777;
}

describe('security hardening regressions', () => {
  test('setup creates local private artifacts with restricted modes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurant-booker-setup-'));

    try {
      fs.copyFileSync(path.join(repoRoot, 'env.example'), path.join(tempDir, 'env.example'));
      fs.copyFileSync(path.join(repoRoot, 'config.example.json'), path.join(tempDir, 'config.example.json'));

      execFileSync(process.execPath, [path.join(repoRoot, 'setup.js')], {
        cwd: tempDir,
        encoding: 'utf8'
      });

      expect(modeOf(path.join(tempDir, 'data'))).toBe(PRIVATE_DIR_MODE);
      expect(modeOf(path.join(tempDir, 'logs'))).toBe(PRIVATE_DIR_MODE);
      expect(modeOf(path.join(tempDir, 'screenshots'))).toBe(PRIVATE_DIR_MODE);
      expect(modeOf(path.join(tempDir, '.env'))).toBe(PRIVATE_FILE_MODE);
      expect(modeOf(path.join(tempDir, 'config.json'))).toBe(PRIVATE_FILE_MODE);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('saving an existing booking contact profile tightens its file mode', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurant-booker-profile-'));
    const profilePath = path.join(tempDir, '.booking-profiles.local.json');

    try {
      fs.writeFileSync(profilePath, JSON.stringify({ profiles: {} }), { mode: 0o644 });

      saveBookingProfile({
        profileName: 'rush',
        profilePath,
        contact: {
          name: 'Private User',
          email: 'private@example.com',
          phone: '9876543210'
        }
      });

      expect(modeOf(profilePath)).toBe(PRIVATE_FILE_MODE);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('log redaction removes contact and confirmation payloads', () => {
    const redacted = redactSensitive({
      bookingData: {
        restaurantName: 'Private Bistro',
        contact: {
          name: 'Private User',
          email: 'private@example.com',
          phone: '9876543210'
        },
        confirmationNumber: 'ABC-123',
        additionalData: {
          notes: 'window seat'
        }
      },
      message: 'Email private@example.com should be hidden'
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('Private User');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('9876543210');
    expect(serialized).not.toContain('ABC-123');
    expect(redacted.bookingData.restaurantName).toBe('Private Bistro');
    expect(redacted.bookingData.contact.email).toBe(REDACTED);
  });

  test('notification email templates escape booking fields', () => {
    const html = notificationService.generateEmailTemplate({
      restaurantName: '<img src=x onerror=alert(1)>',
      date: '2026-04-23<script>',
      time: '19:00',
      guests: '2"><script>',
      status: 'confirmed',
      confirmationNumber: 'ABC<123>'
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('2026-04-23&lt;script&gt;');
    expect(html).toContain('2&quot;&gt;&lt;script&gt;');
    expect(html).toContain('ABC&lt;123&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('ABC<123>');
  });

  test('retry notification template escapes booking fields', async () => {
    const originalEmailEnabled = config.env.ENABLE_EMAIL_NOTIFICATIONS;
    const originalTransporter = notificationService.emailTransporter;
    const sendMail = jest.fn(async () => ({ messageId: 'test-message' }));

    config.env.ENABLE_EMAIL_NOTIFICATIONS = true;
    notificationService.emailTransporter = { sendMail };

    try {
      await expect(notificationService.sendRetryNotification({
        restaurantName: '<b>Private Bistro</b>',
        date: '2026-04-23',
        time: '19:00<script>',
        guests: '2'
      }, 1, 3)).resolves.toBe(true);

      const mailOptions = sendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('&lt;b&gt;Private Bistro&lt;/b&gt;');
      expect(mailOptions.html).toContain('19:00&lt;script&gt;');
      expect(mailOptions.html).not.toContain('<b>Private Bistro</b>');
      expect(mailOptions.html).not.toContain('19:00<script>');
    } finally {
      config.env.ENABLE_EMAIL_NOTIFICATIONS = originalEmailEnabled;
      notificationService.emailTransporter = originalTransporter;
    }
  });

  test('legacy Comal helper artifacts are not tracked', () => {
    const trackedFiles = execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim().split('\n');

    expect(trackedFiles.filter(file => (
      /^book_comal.*\.js$/.test(file)
      || file === 'src/utils/comalBookingDetails.js'
    ))).toEqual([]);
  });

  test('local config stays ignored instead of tracked', () => {
    const trackedConfig = execFileSync('git', ['ls-files', 'config.json'], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim();
    const ignoreRule = execFileSync('git', ['check-ignore', '-v', 'config.json'], {
      cwd: repoRoot,
      encoding: 'utf8'
    }).trim();

    expect(trackedConfig).toBe('');
    expect(ignoreRule).toContain('config.json');
  });

  test('package does not carry vulnerable desktop notification UUID chain', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

    expect(pkg.dependencies).not.toHaveProperty('node-notifier');
    expect(pkg.dependencies).not.toHaveProperty('uuid');
  });
});
