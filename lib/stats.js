import { db, variantsOf } from './db.js';

// Heuristic benchmarks for a cold-traffic waitlist landing page. They are
// deliberately simple and are shown to the user so the verdict is transparent.
export const THRESHOLDS = {
  minViews: 30,
  minSignups: 5,
  goConversion: 0.1,
  pivotConversion: 0.04,
  goStrongIntent: 0.35
};

export const INTENT_WEIGHTS = { definitely: 1, probably: 0.6, not_sure: 0.2, no: 0 };
export const INTENTS = Object.keys(INTENT_WEIGHTS);

// Wilson score interval: honest uncertainty for small samples.
export function wilson(k, n, z = 1.96) {
  if (!n) return { low: 0, high: 0 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { low: Math.max(0, (c - m) / d), high: Math.min(1, (c + m) / d) };
}

export function computeStats(projectId) {
  const state = db();
  const variants = variantsOf(projectId).map((v) => {
    const signups = state.signups.filter((s) => s.variantId === v.id);
    const messages = state.messages.filter((m) => m.variantId === v.id);
    const intent = Object.fromEntries(INTENTS.map((k) => [k, 0]));
    for (const s of signups) if (s.intent in intent) intent[s.intent]++;
    const answered = INTENTS.reduce((n, k) => n + intent[k], 0);
    const intentScore = answered ? INTENTS.reduce((n, k) => n + intent[k] * INTENT_WEIGHTS[k], 0) / answered : null;
    const strongIntentShare = answered ? (intent.definitely + intent.probably) / answered : null;
    const views = v.views || 0;
    return {
      id: v.id,
      label: v.label,
      angle: v.angle,
      slug: v.slug,
      views,
      signups: signups.length,
      conversion: views ? signups.length / views : 0,
      ci: wilson(signups.length, views),
      intent,
      answered,
      intentScore,
      strongIntentShare,
      messages: messages.length
    };
  });

  const views = variants.reduce((n, v) => n + v.views, 0);
  const signups = variants.reduce((n, v) => n + v.signups, 0);
  const answered = variants.reduce((n, v) => n + v.answered, 0);
  const strong = variants.reduce((n, v) => n + v.intent.definitely + v.intent.probably, 0);
  const demoSignups = state.signups.filter((s) => s.projectId === projectId && s.demo).length;

  const totals = {
    views,
    signups,
    conversion: views ? signups / views : 0,
    strongIntentShare: answered ? strong / answered : null,
    messages: variants.reduce((n, v) => n + v.messages, 0),
    simulated: demoSignups > 0
  };

  const ranked = [...variants].sort((a, b) => b.conversion - a.conversion || (b.intentScore ?? 0) - (a.intentScore ?? 0));
  const leader = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const likelyWinner = !!(leader && runnerUp && leader.ci.low > runnerUp.conversion);

  return {
    variants,
    totals,
    leader: leader && { label: leader.label, conversion: leader.conversion, likelyWinner },
    verdict: decideVerdict(totals, leader)
  };
}

export function decideVerdict(totals, leader) {
  if (!leader || totals.views < THRESHOLDS.minViews || totals.signups < THRESHOLDS.minSignups) {
    return {
      code: 'NOT_ENOUGH_DATA',
      reason: `Need at least ${THRESHOLDS.minViews} visits and ${THRESHOLDS.minSignups} signups to judge (have ${totals.views} visits, ${totals.signups} signups). Keep sharing your links.`
    };
  }
  const strong = leader.strongIntentShare ?? totals.strongIntentShare ?? 0;
  if (leader.conversion >= THRESHOLDS.goConversion && strong >= THRESHOLDS.goStrongIntent) {
    return { code: 'GO', reason: `Variant ${leader.label} converts at ${(leader.conversion * 100).toFixed(1)}% and ${(strong * 100).toFixed(0)}% of its signups say they would buy.` };
  }
  if (leader.conversion >= THRESHOLDS.pivotConversion) {
    return { code: 'PIVOT', reason: `Interest exists (best variant ${(leader.conversion * 100).toFixed(1)}%) but is below the ${(THRESHOLDS.goConversion * 100).toFixed(0)}% / ${(THRESHOLDS.goStrongIntent * 100).toFixed(0)}% intent bar. Refine the offer before building.` };
  }
  return { code: 'STOP', reason: `Even the best variant converts at only ${(leader.conversion * 100).toFixed(1)}%. The current idea is unlikely to sell as framed.` };
}

export function sampleQuality(totals) {
  if (totals.views < THRESHOLDS.minViews) return 'insufficient';
  if (totals.views < 100) return 'low';
  if (totals.views < 300) return 'moderate';
  return 'good';
}
