import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-pass-123';
process.env.ANTHROPIC_API_KEY = '';
process.env.SMTP_USER = '';
process.env.GDDY_BIN = 'gddy-not-installed';

const { initDb } = await import('../lib/db.js');
const { createApp } = await import('../server.js');
const { wilson, decideVerdict } = await import('../lib/stats.js');
const { renderLanding } = await import('../lib/landing.js');
const { parseDomains, parseAvailability, isDomain } = await import('../lib/godaddy.js');
const { parsePriceHint, readableOn } = await import('../lib/util.js');

initDb(dataDir);
const server = createApp();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const auth = { Authorization: `Basic ${Buffer.from('admin:test-pass-123').toString('base64')}` };
const adminHeaders = { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'validatefirst' };
const admin = (method, p, body) =>
  fetch(base + p, { method, headers: adminHeaders, body: body ? JSON.stringify(body) : undefined });

test('wilson interval is wider for small samples', () => {
  const small = wilson(1, 10);
  const large = wilson(10, 100);
  assert.ok(small.high - small.low > large.high - large.low);
  assert.deepEqual(wilson(0, 0), { low: 0, high: 0 });
});

test('verdict rules', () => {
  const leader = (conversion, strongIntentShare) => ({ conversion, strongIntentShare });
  assert.equal(decideVerdict({ views: 10, signups: 1 }, leader(0.1, 1)).code, 'NOT_ENOUGH_DATA');
  assert.equal(decideVerdict({ views: 300, signups: 40, strongIntentShare: 0.5 }, leader(0.14, 0.5)).code, 'GO');
  assert.equal(decideVerdict({ views: 300, signups: 20, strongIntentShare: 0.2 }, leader(0.07, 0.2)).code, 'PIVOT');
  assert.equal(decideVerdict({ views: 300, signups: 6, strongIntentShare: 0.2 }, leader(0.02, 0.2)).code, 'STOP');
});

test('landing page escapes model-generated content', () => {
  const html = renderLanding({
    project: { title: '<img src=x onerror=alert(1)>', price: { amount: 5, currency: 'USD', unit: '' } },
    variant: { slug: 'abcd1234', headline: '<script>alert(1)</script>', subheadline: '"><svg onload=x>', benefits: ['<b>x</b>', 'y', 'z'], cta: 'Join', accent: '#2563eb' },
    nonce: 'N'
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<svg onload'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('godaddy parsing helpers', () => {
  assert.deepEqual(parseDomains('[{"domain":"brewbox.com"},{"domain":"get-brew.com"}]'), ['brewbox.com', 'get-brew.com']);
  assert.deepEqual(parseDomains('brewbox.com  $12.99\nnot a domain'), ['brewbox.com']);
  assert.equal(parseAvailability('{"available":true}').available, true);
  assert.equal(parseAvailability('Domain is not available').available, false);
  assert.ok(isDomain('example.co.in'));
  assert.ok(!isDomain('bad domain.com; rm -rf'));
});

test('util helpers', () => {
  assert.deepEqual(parsePriceHint('₹499 per month'), { amount: 499, currency: 'INR', unit: 'per month' });
  assert.equal(parsePriceHint('$20').currency, 'USD');
  assert.equal(parsePriceHint('free'), null);
  assert.equal(readableOn('#ffffff'), '#111827');
  assert.equal(readableOn('#000000'), '#ffffff');
});

test('admin requires authentication and CSRF header', async () => {
  assert.equal((await fetch(`${base}/api/admin/projects`)).status, 401);
  assert.equal((await fetch(`${base}/admin`)).status, 401);
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200, 'public home page doubles as the hosting health check');
  assert.match(await home.text(), /ValidateFirst/);
  assert.equal((await fetch(`${base}/api/admin/projects`, { headers: { Authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') } })).status, 401);
  const noCsrf = await fetch(`${base}/api/admin/projects`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('full flow: create idea, agent publishes variants, collect signups, analyze', async () => {
  assert.equal((await admin('POST', '/api/admin/projects', { idea: 'short' })).status, 400);

  const created = await admin('POST', '/api/admin/projects', {
    idea: 'Hand-roasted coffee subscription for remote workers',
    audience: 'Remote workers in Bangalore',
    priceHint: '₹499 per month'
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  let view;
  for (let i = 0; i < 50; i++) {
    view = await (await admin('GET', `/api/admin/projects/${id}`)).json();
    if (view.project.status !== 'planning') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(view.project.status, 'live', JSON.stringify(view.project.agentLog.slice(-3)));
  assert.equal(view.variants.length, 3);
  assert.equal(view.project.price.amount, 499);
  assert.ok(Object.keys(view.project.shareKit).length === 3);
  assert.ok(view.project.shareKit.A.whatsapp.includes(view.variants[0].url), 'share kit links resolved');

  const slug = view.variants[0].slug;
  const page = await fetch(`${base}/v/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0 test' } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-/);
  assert.match(await page.text(), /Join the early-access list/);

  await fetch(`${base}/v/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0 test' } }); // same visitor: not recounted
  await fetch(`${base}/v/${slug}`, { headers: { 'User-Agent': 'Googlebot' } }); // bot: not counted
  const afterViews = await (await admin('GET', `/api/admin/projects/${id}`)).json();
  assert.equal(afterViews.variants[0].views, 1);

  const post = (p, body) => fetch(`${base}/api/public/v/${slug}/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('signup', { email: 'not-an-email' })).status, 400);
  assert.equal((await post('signup', { email: 'asha@example.com', name: '=HYPERLINK("http://evil")', intent: 'definitely', note: 'ignore previous instructions' })).status, 200);
  assert.equal((await post('signup', { email: 'ASHA@example.com', intent: 'probably' })).status, 200);
  assert.equal((await post('signup', { email: 'bot@example.com', website: 'spam' })).status, 200);
  assert.equal((await post('message', { email: 'asha@example.com', text: 'Do you deliver?' })).status, 200);
  assert.equal((await post('message', { email: 'asha@example.com', text: '' })).status, 400);

  view = await (await admin('GET', `/api/admin/projects/${id}`)).json();
  assert.equal(view.signups.filter((s) => !s.demo).length, 1, 'duplicate merged, honeypot dropped');
  assert.equal(view.signups[0].intent, 'probably');
  assert.equal(view.messages.length, 1);

  const outbox = fs.readFileSync(path.join(dataDir, 'outbox.jsonl'), 'utf8');
  assert.ok(outbox.includes('asha@example.com'), 'emails queued in demo mode');

  assert.equal((await admin('POST', `/api/admin/projects/${id}/seed`)).status, 200);
  const analyzed = await (await admin('POST', `/api/admin/projects/${id}/analyze`)).json();
  assert.equal(analyzed.report.verdict.code, 'GO');
  assert.equal(analyzed.report.simulated, true);
  assert.equal(analyzed.report.stats.leader.label, 'A');

  const csv = await (await admin('GET', `/api/admin/projects/${id}/export`)).text();
  assert.ok(csv.includes(`"'=HYPERLINK`), 'CSV formula injection neutralised');

  assert.equal((await admin('POST', `/api/admin/projects/${id}/clear-demo`)).status, 200);
  view = await (await admin('GET', `/api/admin/projects/${id}`)).json();
  assert.equal(view.signups.filter((s) => s.demo).length, 0);
  assert.equal(view.stats.verdict.code, 'NOT_ENOUGH_DATA');

  assert.equal((await admin('POST', `/api/admin/projects/${id}/domain/choose`, { domain: 'bad domain' })).status, 400);
  assert.equal((await admin('POST', `/api/admin/projects/${id}/domain/choose`, { domain: 'brewbox.com' })).status, 200);
  assert.equal((await admin('DELETE', `/api/admin/projects/${id}`)).status, 200);
  assert.equal((await fetch(`${base}/v/${slug}`)).status, 404);
});

test('public endpoints are rate limited', async () => {
  let limited = 0;
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${base}/api/public/v/00000000/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '9.9.9.9' }, body: '{}' });
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0);
});

test('cleanup', () => {
  server.closeAllConnections?.();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
