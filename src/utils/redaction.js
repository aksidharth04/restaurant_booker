const REDACTED = '[REDACTED]';
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CONTACT_KEY_PATTERN = /^(email|phone|mobile|telephone)$/i;
const SENSITIVE_KEY_PATTERN = /^(password|pass|secret|token|apiKey|api_key|bookingId|booking_id|confirmationNumber|confirmation_number|encryptedData|encrypted_data|additionalData|additional_data)$/i;

function redactSensitive(value, key = '') {
  if (isSensitiveKey(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item));
  }

  if (value && typeof value === 'object' && isPlainObject(value)) {
    return redactObject(value);
  }

  return value;
}

function redactObject(value) {
  const hasContactFields = Object.keys(value).some(key => CONTACT_KEY_PATTERN.test(key));

  return Object.entries(value).reduce((redacted, [key, item]) => ({
    ...redacted,
    [key]: shouldRedactObjectKey(key, hasContactFields)
      ? REDACTED
      : redactSensitive(item, key)
  }), {});
}

function redactText(value) {
  return value.replace(EMAIL_PATTERN, REDACTED);
}

function shouldRedactObjectKey(key, hasContactFields) {
  return isSensitiveKey(key) || (hasContactFields && /^name$/i.test(key));
}

function isSensitiveKey(key) {
  return CONTACT_KEY_PATTERN.test(key) || SENSITIVE_KEY_PATTERN.test(key);
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  REDACTED,
  redactSensitive,
  redactText
};
