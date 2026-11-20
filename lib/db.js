import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

// Tiny JSON-file store: fine for a validation tool with modest traffic,
// and needs no native modules so it deploys as a plain zip.
const EMPTY = () => ({ projects: [], variants: [], signups: [], messages: [], reports: [] });

let state = EMPTY();
let file = null;
let timer = null;

export function initDb(dir = config.dataDir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'db.json');
  state = EMPTY();
  if (fs.existsSync(file)) {
    try {
      state = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    }
  }
  return state;
}

export const db = () => state;

export function persist() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
  timer.unref?.();
}

export function flush() {
  if (!file) return;
  clearTimeout(timer);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

export const newId = (bytes = 6) => crypto.randomBytes(bytes).toString('hex');

export const getProject = (id) => state.projects.find((p) => p.id === id);
export const variantsOf = (projectId) =>
  state.variants.filter((v) => v.projectId === projectId).sort((a, b) => a.label.localeCompare(b.label));
export const getVariantBySlug = (slug) => state.variants.find((v) => v.slug === slug);

export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  for (const key of ['variants', 'signups', 'messages', 'reports']) {
    state[key] = state[key].filter((x) => x.projectId !== id);
  }
  persist();
}
