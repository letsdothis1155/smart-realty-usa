(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuoteBack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_RATE_CENTS = 100000000;
  const statuses = ['draft', 'sent', 'won', 'lost'];

  function fail(message) { throw new Error(message); }
  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object.');
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail(label + ' must be a plain object.');
    ['__proto__', 'constructor', 'prototype'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(value, key)) fail(label + ' contains an unsupported field.');
    });
    return value;
  }
  function text(value, label, max, required, multiline) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') fail(label + ' must be text.');
    value = value.trim();
    if (value.length > max) fail(label + ' is too long (maximum ' + max + ' characters).');
    if (required && !value) fail(label + ' is required.');
    if ((multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/).test(value)) fail(label + ' contains an unsupported character.');
    return value;
  }
  function hundredths(value, label, max) {
    if (typeof value !== 'number' && typeof value !== 'string') fail(label + ' must be a number.');
    const source = String(value).trim();
    if (source.length > 20) fail(label + ' is too long.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(source)) fail(label + ' must have at most two decimal places.');
    const parts = source.split('.');
    const scaled = BigInt(parts[0]) * 100n + BigInt((parts[1] || '').padEnd(2, '0'));
    if (scaled > BigInt(max) * 100n) fail(label + ' exceeds the allowed maximum.');
    return Number(scaled);
  }
  function parseMoney(value) {
    if (typeof value !== 'string') fail('Enter an amount as text.');
    return hundredths(value, 'Amount', 1000000);
  }
  function integer(value, label, max) {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(label + ' must be a valid nonnegative integer.');
    return value;
  }
  function roundRatio(value, denominator) {
    return (value + denominator / 2n) / denominator;
  }
  function safeNumber(value) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) fail('The estimate total is too large.');
    return Number(value);
  }
  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) fail('Add between 1 and 100 line items.');
    return items.map(function (item) {
      record(item, 'Line item');
      const quantityHundredths = hundredths(item.quantity, 'Quantity', 10000);
      if (quantityHundredths === 0) fail('Quantity must be greater than zero.');
      return {
        description: text(item.description, 'Item description', 300, true),
        quantity: quantityHundredths / 100,
        rateCents: integer(item.rateCents, 'Item rate', MAX_RATE_CENTS)
      };
    });
  }
  function calculate(items, taxPercent, depositPercent) {
    const normalized = normalizeItems(items);
    const taxBasisPoints = hundredths(taxPercent === undefined ? 0 : taxPercent, 'Tax percentage', 100);
    const depositBasisPoints = hundredths(depositPercent === undefined ? 0 : depositPercent, 'Deposit percentage', 100);
    const subtotal = normalized.reduce(function (sum, item) {
      const quantity = BigInt(hundredths(item.quantity, 'Quantity', 10000));
      return sum + roundRatio(quantity * BigInt(item.rateCents), 100n);
    }, 0n);
    const tax = roundRatio(subtotal * BigInt(taxBasisPoints), 10000n);
    const total = subtotal + tax;
    const deposit = roundRatio(total * BigInt(depositBasisPoints), 10000n);
    return {
      subtotalCents: safeNumber(subtotal),
      taxCents: safeNumber(tax),
      totalCents: safeNumber(total),
      depositCents: safeNumber(deposit),
      balanceCents: safeNumber(total - deposit)
    };
  }
  function money(cents) {
    integer(cents, 'Amount', Number.MAX_SAFE_INTEGER);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }
  function date(value, label, optional) {
    if (optional && (value === undefined || value === null || value === '')) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') fail(label + ' must be a valid date.');
    const parsed = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(label + ' must be a valid date.');
    return value;
  }
  function today() {
    const now = new Date();
    return String(now.getFullYear()).padStart(4, '0') + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function addDays(value, days) {
    date(value, 'Date');
    if (!Number.isSafeInteger(days) || Math.abs(days) > 36500) fail('Day offset is invalid.');
    const parsed = new Date(value + 'T12:00:00Z');
    parsed.setUTCDate(parsed.getUTCDate() + days);
    const result = parsed.toISOString().slice(0, 10);
    return date(result, 'Result date');
  }
  function email(value, label) {
    const result = text(value, label, 254, false);
    if (result && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result)) fail(label + ' is invalid.');
    return result;
  }
  function validateQuote(raw) {
    record(raw, 'Estimate');
    const id = text(raw.id, 'Estimate ID', 80, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail('Estimate ID contains an unsupported character.');
    if (!statuses.includes(raw.status)) fail('Estimate status is invalid.');
    const quote = {
      id: id,
      number: text(raw.number, 'Estimate number', 40, true),
      client: text(raw.client, 'Customer name', 120, true),
      email: email(raw.email, 'Customer email'),
      phone: text(raw.phone, 'Customer phone', 40, false),
      service: text(raw.service, 'Job name', 160, true),
      created: date(raw.created, 'Created date'),
      followup: date(raw.followup, 'Follow-up date', true),
      status: raw.status,
      items: normalizeItems(raw.items),
      taxPercent: hundredths(raw.taxPercent === undefined ? 0 : raw.taxPercent, 'Tax percentage', 100) / 100,
      depositPercent: hundredths(raw.depositPercent === undefined ? 0 : raw.depositPercent, 'Deposit percentage', 100) / 100,
      notes: text(raw.notes, 'Notes', 4000, false, true)
    };
    calculate(quote.items, quote.taxPercent, quote.depositPercent);
    return quote;
  }
  function normalizeSettings(raw) {
    record(raw, 'Business settings');
    return {
      business: text(raw.business, 'Business name', 160, false),
      owner: text(raw.owner, 'Your name', 120, false),
      email: email(raw.email, 'Business email'),
      phone: text(raw.phone, 'Business phone', 40, false),
      terms: text(raw.terms, 'Terms', 4000, false, true)
    };
  }
  function validateBackup(raw) {
    record(raw, 'Backup');
    if (raw.version !== 1) fail('This backup version is unsupported.');
    if (!Array.isArray(raw.quotes) || raw.quotes.length > 500) fail('A backup may contain at most 500 estimates.');
    const quotes = raw.quotes.map(validateQuote);
    if (new Set(quotes.map(function (quote) { return quote.id; })).size !== quotes.length) fail('The backup contains duplicate estimate IDs.');
    return { version: 1, settings: normalizeSettings(raw.settings), quotes: quotes };
  }
  function followupMessage(raw, rawSettings) {
    const quote = validateQuote(raw);
    const settings = normalizeSettings(rawSettings);
    const total = calculate(quote.items, quote.taxPercent, quote.depositPercent).totalCents;
    const signature = settings.owner || settings.business || 'Thanks';
    return {
      subject: 'Following up: ' + quote.service + ' — estimate ' + quote.number,
      body: 'Hi ' + quote.client + ',\n\nJust checking in on the ' + money(total) + ' estimate for ' + quote.service + '. Do you have any questions, or would you like to discuss a time for the work?\n\nIf your plans have changed, no problem — just let me know.\n\n' + signature + (settings.business && signature !== settings.business ? '\n' + settings.business : '') + (settings.phone ? '\n' + settings.phone : '')
    };
  }
  function escapeHTML(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  return Object.freeze({ parseMoney: parseMoney, calculate: calculate, money: money, today: today, addDays: addDays, validateQuote: validateQuote, validateBackup: validateBackup, followupMessage: followupMessage, escapeHTML: escapeHTML });
});
