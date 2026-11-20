import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const run = promisify(execFile);

export const buyLink = (domain) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`;

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const isDomain = (d) => DOMAIN_RE.test(String(d || '').toLowerCase());

let cached = { at: 0, value: false };

// True when the GoDaddy CLI (`gddy`) is installed and callable.
export async function gddyAvailable() {
  if (Date.now() - cached.at < 60_000) return cached.value;
  let value = false;
  try {
    await run(config.gddyBin, ['--version'], { timeout: 10_000 });
    value = true;
  } catch {
    value = false;
  }
  cached = { at: Date.now(), value };
  return value;
}

// Pull domain names out of CLI output, whether it is JSON or plain text.
export function parseDomains(stdout) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      if (isDomain(node)) found.add(node.toLowerCase());
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  try {
    walk(JSON.parse(stdout));
  } catch {
    for (const m of String(stdout).toLowerCase().matchAll(/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+/g)) {
      if (isDomain(m[0])) found.add(m[0]);
    }
  }
  return [...found];
}

export function parseAvailability(stdout) {
  try {
    const json = JSON.parse(stdout);
    const flag = json?.available ?? json?.data?.available;
    if (typeof flag === 'boolean') return { available: flag, price: json?.price ?? json?.data?.price };
  } catch {
    /* fall through to text heuristics */
  }
  const text = String(stdout).toLowerCase();
  if (/(not available|unavailable|taken|\bfalse\b)/.test(text)) return { available: false };
  if (/(available|\btrue\b)/.test(text)) return { available: true };
  return { available: null };
}

const slugWords = (q) =>
  String(q).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

function demoSuggestions(query) {
  const words = slugWords(query).slice(0, 3);
  const base = words.join('') || 'myidea';
  const joined = words.join('-') || 'my-idea';
  return [`${base}.com`, `get${base}.com`, `${joined}.com`, `${base}hq.com`, `try${base}.com`].filter(isDomain);
}

const sanitizeQuery = (q) => slugWords(q).join(' ').slice(0, 60);

export async function suggestDomains(query) {
  const q = sanitizeQuery(query);
  if (!q) return { source: 'demo', domains: [], note: 'Empty query' };

  if (await gddyAvailable()) {
    try {
      const { stdout } = await run(config.gddyBin, ['domain', 'suggest', q, '--tlds', 'com', '--limit', '8'], {
        timeout: 30_000
      });
      const domains = parseDomains(stdout).slice(0, 8);
      if (domains.length) return { source: 'godaddy', domains: domains.map((d) => ({ domain: d, buyLink: buyLink(d) })) };
    } catch (e) {
      return { source: 'demo', note: `gddy failed: ${String(e.message).slice(0, 160)}`, domains: demoSuggestions(q).map((d) => ({ domain: d, buyLink: buyLink(d) })) };
    }
  }
  return {
    source: 'demo',
    note: 'GoDaddy CLI not connected: names are generated locally and availability is unverified.',
    domains: demoSuggestions(q).map((d) => ({ domain: d, buyLink: buyLink(d) }))
  };
}

export async function checkDomain(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!isDomain(d)) return { domain: d, available: null, source: 'demo', error: 'Not a valid domain name' };

  if (await gddyAvailable()) {
    try {
      const { stdout } = await run(config.gddyBin, ['domain', 'available', d], { timeout: 30_000 });
      return { domain: d, source: 'godaddy', ...parseAvailability(stdout), buyLink: buyLink(d) };
    } catch (e) {
      return { domain: d, available: null, source: 'godaddy', error: String(e.message).slice(0, 160), buyLink: buyLink(d) };
    }
  }
  return { domain: d, available: null, source: 'demo', note: 'Unverified: GoDaddy CLI not connected', buyLink: buyLink(d) };
}
