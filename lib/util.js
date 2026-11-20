export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Trim, drop control characters, cap length.
export const clean = (s, max = 500) =>
  String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

// Prevent header/CRLF injection in anything placed in an email header.
export const headerSafe = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);

export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(s);

export const isHexColor = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s ?? ''));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const pct = (x, digits = 1) => `${(x * 100).toFixed(digits)}%`;

// Pick black or white text, whichever has the higher WCAG contrast on the colour.
export function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const whiteContrast = 1.05 / (L + 0.05);
  const darkContrast = (L + 0.05) / 0.06;
  return whiteContrast >= darkContrast ? '#ffffff' : '#111827';
}

export function parsePriceHint(hint) {
  const text = String(hint || '');
  const m = text.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let currency = 'INR';
  if (/\$|usd/i.test(text)) currency = 'USD';
  else if (/€|eur/i.test(text)) currency = 'EUR';
  else if (/£|gbp/i.test(text)) currency = 'GBP';
  const unitMatch = text.match(/\b(month|week|day|year|hour|session|class)\b/i);
  const unit = unitMatch ? `per ${unitMatch[1].toLowerCase()}` : '';
  return { amount, currency, unit };
}

export function formatPrice(price) {
  if (!price || !price.amount) return '';
  const sym = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[price.currency] || `${price.currency || ''} `;
  return `${sym}${price.amount}${price.unit ? ` ${price.unit}` : ''}`;
}

export const logger = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARN', ...a),
  error: (...a) => console.error(new Date().toISOString(), 'ERROR', ...a)
};
