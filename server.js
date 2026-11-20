import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, ROOT, smtpConfigured } from './lib/config.js';
import { initDb, db, persist, flush, newId, getProject, variantsOf, getVariantBySlug, deleteProject } from './lib/db.js';
import { clean, isEmail, logger } from './lib/util.js';
import { llmAvailable } from './lib/llm.js';
import { gddyAvailable, suggestDomains, checkDomain, isDomain } from './lib/godaddy.js';
import { runLaunchAgent, variantUrl, logEvent } from './lib/agent.js';
import { generateReport, latestReport } from './lib/report.js';
import { computeStats, INTENTS, THRESHOLDS } from './lib/stats.js';
import { seedDemoData, clearDemoData } from './lib/seed.js';
import { renderLanding, renderNotFound, renderHome } from './lib/landing.js';
import { notifyOwnerOfSignup, welcomeSignup, notifyOwnerOfMessage } from './lib/mail.js';

const ADMIN_DIR = path.join(ROOT, 'admin');
const STATIC = {
  '/admin': ['index.html', 'text/html; charset=utf-8'],
  '/admin/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/admin/styles.css': ['styles.css', 'text/css; charset=utf-8']
};

/* ---------- small helpers ---------- */

const clientIp = (req) =>
  (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

function limiter(max, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) {
      const fresh = v.filter((t) => t > cutoff);
      fresh.length ? hits.set(k, fresh) : hits.delete(k);
    }
  }, windowMs);
  timer.unref?.();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => t > now - windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
}

const publicLimit = limiter(30, 60_000);
const authFailLimit = limiter(10, 5 * 60_000);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function adminAuthorized(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), config.adminUser);
  const passOk = safeEqual(decoded.slice(i + 1), config.adminPassword);
  return userOk && passOk;
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(body);
}
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readJson(req, limit = 32 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|headless/i;
const seenToday = new Set();

function countView(req, variant) {
  if (BOT_RE.test(String(req.headers['user-agent'] || ''))) return;
  const key = sha(`${clientIp(req)}|${req.headers['user-agent']}|${variant.id}|${new Date().toISOString().slice(0, 10)}`).toString('hex');
  if (seenToday.has(key)) return;
  if (seenToday.size > 50_000) seenToday.clear();
  seenToday.add(key);
  variant.views = (variant.views || 0) + 1;
  persist();
}

/* ---------- views ---------- */

function projectSummary(p) {
  const stats = computeStats(p.id);
  return {
    id: p.id,
    title: p.title,
    idea: p.idea,
    status: p.status,
    createdAt: p.createdAt,
    views: stats.totals.views,
    signups: stats.totals.signups,
    verdict: stats.verdict.code
  };
}

// Prefer the configured public URL; otherwise use the address this request came in on.
function baseUrlFor(req) {
  if (config.publicBaseUrl) return config.baseUrl;
  const host = String((config.trustProxy && req.headers['x-forwarded-host']) || req.headers.host || '').split(',')[0].trim();
  if (!host || /^(localhost|127\.)/.test(host)) return config.baseUrl;
  const proto = String((config.trustProxy && req.headers['x-forwarded-proto']) || 'https').split(',')[0].trim();
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

function projectView(p, req) {
  const state = db();
  const base = baseUrlFor(req);
  const variants = variantsOf(p.id).map((v) => ({ ...v, url: `${base}/v/${v.slug}` }));
  const links = Object.fromEntries(variants.map((v) => [v.label, v.url]));
  const shareKit = Object.fromEntries(
    Object.entries(p.shareKit || {}).map(([label, posts]) => [
      label,
      Object.fromEntries(Object.entries(posts).map(([ch, text]) => [ch, text.replace(/\{\{LINK_([ABC])\}\}/g, (_, l) => links[l] || '')]))
    ])
  );
  const labelOf = (id) => variants.find((v) => v.id === id)?.label || '?';
  return {
    project: { ...p, shareKit },
    variants,
    stats: computeStats(p.id),
    thresholds: THRESHOLDS,
    signups: state.signups.filter((s) => s.projectId === p.id).slice(-100).reverse().map((s) => ({ ...s, variantLabel: labelOf(s.variantId) })),
    messages: state.messages.filter((m) => m.projectId === p.id).slice(-100).reverse().map((m) => ({ ...m, variantLabel: labelOf(m.variantId) })),
    report: latestReport(p.id)
  };
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/* ---------- route handlers ---------- */

async function handlePublic(req, res, url) {
  const landing = url.pathname.match(/^\/v\/([a-f0-9]{8})$/);
  if (req.method === 'GET' && landing) {
    const variant = getVariantBySlug(landing[1]);
    const project = variant && getProject(variant.projectId);
    if (!variant || !project) return send(res, 404, renderNotFound(), { 'Content-Type': 'text/html; charset=utf-8' });
    countView(req, variant);
    const nonce = crypto.randomBytes(16).toString('base64');
    return send(res, 200, renderLanding({ project, variant, nonce }), {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
    });
  }

  const post = url.pathname.match(/^\/api\/public\/v\/([a-f0-9]{8})\/(signup|message)$/);
  if (req.method === 'POST' && post) {
    if (!publicLimit(clientIp(req))) return json(res, 429, { error: 'Too many requests. Please try again in a minute.' });
    const variant = getVariantBySlug(post[1]);
    const project = variant && getProject(variant.projectId);
    if (!variant || !project) return json(res, 404, { error: 'Not found' });
    const body = await readJson(req, 8 * 1024);
    if (clean(body.website, 50)) return json(res, 200, { ok: true }); // honeypot: pretend success to bots
    const email = clean(body.email, 254).toLowerCase();
    if (!isEmail(email)) return json(res, 400, { error: 'Please enter a valid email address.' });

    if (post[2] === 'signup') {
      const intent = INTENTS.includes(body.intent) ? body.intent : '';
      const state = db();
      let signup = state.signups.find((s) => s.variantId === variant.id && s.email === email && !s.demo);
      if (signup) {
        Object.assign(signup, { name: clean(body.name, 80) || signup.name, intent: intent || signup.intent, note: clean(body.note, 500) || signup.note });
      } else {
        signup = { id: newId(), projectId: project.id, variantId: variant.id, email, name: clean(body.name, 80), intent, note: clean(body.note, 500), demo: false, createdAt: new Date().toISOString() };
        state.signups.push(signup);
        notifyOwnerOfSignup(project, variant, signup).catch(() => {});
        welcomeSignup(project, variant, signup).catch(() => {});
      }
      persist();
      return json(res, 200, { ok: true });
    }

    const text = clean(body.text, 1000);
    if (!text) return json(res, 400, { error: 'Please type your question.' });
    const message = { id: newId(), projectId: project.id, variantId: variant.id, name: clean(body.name, 80), email, text, demo: false, createdAt: new Date().toISOString() };
    db().messages.push(message);
    persist();
    notifyOwnerOfMessage(project, variant, message).catch(() => {});
    return json(res, 200, { ok: true });
  }
  return false;
}

async function handleAdmin(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && STATIC[pathname]) {
    const [file, type] = STATIC[pathname];
    return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, file)), {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    });
  }

  if (!pathname.startsWith('/api/admin/')) return false;
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'validatefirst') return json(res, 403, { error: 'Missing CSRF header' });

  if (req.method === 'GET' && pathname === '/api/admin/status') {
    return json(res, 200, {
      claude: llmAvailable(),
      model: config.model,
      godaddy: await gddyAvailable(),
      mail: smtpConfigured(),
      baseUrl: config.baseUrl
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/projects') {
    return json(res, 200, { projects: [...db().projects].reverse().map(projectSummary) });
  }

  if (req.method === 'POST' && pathname === '/api/admin/projects') {
    const body = await readJson(req);
    const idea = clean(body.idea, 1000);
    if (idea.length < 10) return json(res, 400, { error: 'Describe your idea in at least a sentence.' });
    if (db().projects.length >= 50) return json(res, 400, { error: 'Project limit reached. Delete an old project first.' });
    const project = {
      id: newId(),
      idea,
      audience: clean(body.audience, 200),
      city: clean(body.city, 100),
      priceHint: clean(body.priceHint, 100),
      title: idea.length > 40 ? `${idea.slice(0, 37).trimEnd()}...` : idea,
      status: 'planning',
      price: null,
      domain: { candidates: [], checks: {}, recommended: null, chosen: null },
      shareKit: {},
      agentLog: [],
      createdAt: new Date().toISOString()
    };
    db().projects.push(project);
    persist();
    runLaunchAgent(project.id); // runs in the background; the dashboard polls progress
    return json(res, 201, { id: project.id });
  }

  const m = pathname.match(/^\/api\/admin\/projects\/([a-f0-9]{12})(?:\/([a-z-]+(?:\/[a-z]+)?))?$/);
  if (!m) return json(res, 404, { error: 'Not found' });
  const project = getProject(m[1]);
  if (!project) return json(res, 404, { error: 'Project not found' });
  const action = m[2] || '';

  if (req.method === 'GET' && action === '') return json(res, 200, projectView(project, req));

  if (req.method === 'DELETE' && action === '') {
    deleteProject(project.id);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && action === 'export') {
    const variants = variantsOf(project.id);
    const rows = [['variant', 'name', 'email', 'intent', 'note', 'simulated', 'created_at']];
    for (const s of db().signups.filter((x) => x.projectId === project.id)) {
      rows.push([variants.find((v) => v.id === s.variantId)?.label, s.name, s.email, s.intent, s.note, s.demo ? 'yes' : 'no', s.createdAt]);
    }
    return send(res, 200, rows.map((r) => r.map(csvCell).join(',')).join('\n'), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="signups.csv"',
      'Cache-Control': 'no-store'
    });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  if (action === 'seed') {
    if (project.status === 'planning') return json(res, 409, { error: 'The agent is still working.' });
    seedDemoData(project.id);
    return json(res, 200, { ok: true });
  }
  if (action === 'clear-demo') {
    clearDemoData(project.id);
    return json(res, 200, { ok: true });
  }
  if (action === 'analyze') {
    try {
      return json(res, 200, { report: await generateReport(project.id) });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (action === 'domain/search') {
    const body = await readJson(req);
    return json(res, 200, await suggestDomains(clean(body.query, 80)));
  }
  if (action === 'domain/check') {
    const body = await readJson(req);
    const result = await checkDomain(clean(body.domain, 100));
    project.domain.checks = { ...project.domain.checks, [result.domain]: { available: result.available, source: result.source } };
    persist();
    return json(res, 200, result);
  }
  if (action === 'domain/choose') {
    const body = await readJson(req);
    const domain = clean(body.domain, 100).toLowerCase();
    if (!isDomain(domain)) return json(res, 400, { error: 'Not a valid domain name' });
    project.domain.chosen = domain;
    logEvent(project, 'status', `Domain chosen: ${domain}`);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Not found' });
}

export function createApp() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

      // Public home page: also what the hosting platform's health check requests.
      if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
        return send(res, 200, renderHome(), {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
        });
      }

      if ((await handlePublic(req, res, url)) !== false) return;

      if (url.pathname === '/admin/') url.pathname = '/admin';
      const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/');
      if (!isAdminPath) return json(res, 404, { error: 'Not found' });

      const ip = clientIp(req);
      if (!adminAuthorized(req)) {
        if (req.headers.authorization && !authFailLimit(ip)) return json(res, 429, { error: 'Too many failed attempts. Wait a few minutes.' });
        return send(res, 401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="ValidateFirst admin", charset="UTF-8"', 'Content-Type': 'text/plain' });
      }
      if ((await handleAdmin(req, res, url)) === false) json(res, 404, { error: 'Not found' });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) logger.error('request failed:', e);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Internal error' : e.message });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  initDb();
  const server = createApp();
  server.listen(config.port, () => {
    logger.info(`ValidateFirst running on ${config.baseUrl}  (port ${config.port})`);
    logger.info(`Claude: ${llmAvailable() ? 'connected' : 'DEMO MODE (set ANTHROPIC_API_KEY)'} | Mail: ${smtpConfigured() ? 'SMTP' : 'outbox file (set SMTP_USER/SMTP_PASS)'}`);
    if (config.adminPasswordGenerated) {
      logger.warn(`ADMIN_PASSWORD not set. Temporary admin login: ${config.adminUser} / ${config.adminPassword}`);
    }
  });
  const shutdown = () => {
    flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
