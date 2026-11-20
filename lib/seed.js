import { db, persist, newId, getProject, variantsOf } from './db.js';

// Plausible, clearly-flagged simulated traffic so the dashboard and analysis
// can be demonstrated without waiting days for real visitors.
const RATES = [0.14, 0.07, 0.03];
const INTENT_MIX = [
  { definitely: 0.35, probably: 0.35, not_sure: 0.2, no: 0.1 },
  { definitely: 0.15, probably: 0.3, not_sure: 0.35, no: 0.2 },
  { definitely: 0.05, probably: 0.2, not_sure: 0.4, no: 0.35 }
];
const NOTES = [
  'Does it work for small orders?',
  'Would love a trial first',
  'Is there a student discount?',
  'How soon can I start?',
  'Is the price per person or per household?',
  'Can I pay weekly instead of monthly?',
  'Do you deliver outside the city centre?',
  'Looks useful, please tell me when it launches'
];

function pick(mix, r) {
  let acc = 0;
  for (const [k, p] of Object.entries(mix)) {
    acc += p;
    if (r < acc) return k;
  }
  return 'not_sure';
}

export function seedDemoData(projectId, visitsPerVariant = 120) {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found');
  clearDemoData(projectId);
  const state = db();
  let n = 0;
  variantsOf(projectId).forEach((variant, i) => {
    const rate = RATES[i % RATES.length];
    const mix = INTENT_MIX[i % INTENT_MIX.length];
    variant.views = (variant.views || 0) + visitsPerVariant;
    variant.demoViews = visitsPerVariant;
    const signups = Math.round(visitsPerVariant * rate);
    for (let j = 0; j < signups; j++) {
      n++;
      state.signups.push({
        id: newId(),
        projectId,
        variantId: variant.id,
        email: `demo.user${n}@example.com`,
        name: `Demo User ${n}`,
        intent: pick(mix, Math.random()),
        note: Math.random() < 0.45 ? NOTES[Math.floor(Math.random() * NOTES.length)] : '',
        demo: true,
        createdAt: new Date().toISOString()
      });
    }
    for (let j = 0; j < Math.max(1, Math.round(signups / 5)); j++) {
      state.messages.push({
        id: newId(),
        projectId,
        variantId: variant.id,
        name: `Demo Visitor ${j + 1}`,
        email: `demo.visitor${i}${j}@example.com`,
        text: NOTES[(i + j) % NOTES.length],
        demo: true,
        createdAt: new Date().toISOString()
      });
    }
  });
  persist();
}

export function clearDemoData(projectId) {
  const state = db();
  state.signups = state.signups.filter((s) => !(s.projectId === projectId && s.demo));
  state.messages = state.messages.filter((m) => !(m.projectId === projectId && m.demo));
  for (const v of variantsOf(projectId)) {
    v.views = Math.max(0, (v.views || 0) - (v.demoViews || 0));
    v.demoViews = 0;
  }
  persist();
}
