import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real environment variables always win.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

// Treat empty values and obvious placeholders (YOUR_..., changeme) as "not set".
const real = (v) => {
  const s = String(v ?? '').trim();
  return !s || /^(your[_-]|<|changeme|placeholder)/i.test(s) ? '' : s;
};
const env = (k, d = '') => real(process.env[k]) || d;

// Generated once per process so the admin dashboard is never open by default.
const generatedPassword = crypto.randomBytes(9).toString('base64url');

export const config = {
  get port() { return Number(process.env.PORT) || 3000; },
  get publicBaseUrl() { return env('PUBLIC_BASE_URL'); },
  get baseUrl() { return env('PUBLIC_BASE_URL', `http://localhost:${this.port}`).replace(/\/+$/, ''); },
  get dataDir() { return env('DATA_DIR', path.join(ROOT, 'data')); },
  get trustProxy() { return env('TRUST_PROXY', 'true') !== 'false'; },

  get adminUser() { return env('ADMIN_USER', 'admin'); },
  get adminPassword() { return env('ADMIN_PASSWORD', generatedPassword); },
  get adminPasswordGenerated() { return !env('ADMIN_PASSWORD'); },

  get anthropicKey() { return env('ANTHROPIC_API_KEY'); },
  get model() { return env('CLAUDE_MODEL', 'claude-sonnet-4-5'); },

  get gddyBin() { return env('GDDY_BIN', 'gddy'); },

  get smtpHost() { return env('SMTP_HOST', 'smtpout.secureserver.net'); },
  get smtpPort() { return Number(env('SMTP_PORT', '465')); },
  get smtpUser() { return env('SMTP_USER'); },
  get smtpPass() { return env('SMTP_PASS'); },
  get mailFrom() { return env('MAIL_FROM', this.smtpUser); },
  get ownerEmail() { return env('OWNER_EMAIL', this.smtpUser); }
};

export const smtpConfigured = () => !!(config.smtpUser && config.smtpPass);
