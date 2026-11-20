// Demo-mode stand-ins for Claude. They speak the same message/tool protocol as
// the real API so the agent loop is identical whether or not a key is configured.
import { parsePriceHint, pct } from './util.js';

const STOP = new Set('a an the and or for of to in on at with by from my our your their is are be as that this it its into who want wants like app online service business startup idea new'.split(' '));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function derive(project) {
  const idea = String(project.idea).replace(/[.!?\s]+$/g, '');
  const words = idea.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  const keywords = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 2);
  const aud = String(project.audience || '').trim();
  return {
    product: idea.length > 70 ? `${idea.slice(0, 67).trimEnd()}...` : idea,
    audience: aud ? (/^[A-Z][a-z]/.test(aud) ? aud.charAt(0).toLowerCase() + aud.slice(1) : aud) : 'people like you',
    query: keywords.join(' ') || 'my idea',
    base: keywords.join('') || 'myidea'
  };
}

let seq = 0;
const call = (name, input) => ({ type: 'tool_use', id: `mock_${Date.now()}_${seq++}`, name, input });

export function mockAgentStep(messages, project) {
  const step = messages.filter((m) => m.role === 'assistant').length;
  const d = derive(project);
  const price = parsePriceHint(project.priceHint) || { amount: 499, currency: 'INR', unit: '' };
  const variant = (label, angle, headline, subheadline, benefits, accent) =>
    call('create_variant', {
      label,
      angle,
      headline,
      subheadline,
      benefits,
      price_amount: price.amount,
      price_currency: price.currency,
      price_unit: price.unit,
      cta_text: 'Join the early-access list',
      accent_color: accent
    });

  const script = [
    () => [
      { type: 'text', text: `Demo mode: Claude isn't connected yet, so I'm following a scripted plan. Step 1: find a domain for "${d.query}".` },
      call('suggest_domains', { query: d.query })
    ],
    () => [call('check_domain', { domain: `${d.base}.com` })],
    () => [
      call('set_project_title', { title: cap(d.query) }),
      variant('A', 'Value for money', `${cap(d.product)}, at a price that makes sense`,
        `Built for ${d.audience}. Clear pricing, no surprises.`,
        ['Transparent pricing from day one', 'No long-term commitment', 'No hidden fees, ever'], '#16a34a')
    ],
    () => [
      variant('B', 'Quality & trust', `${cap(d.product)}, done properly`,
        `Made with care for ${d.audience}, with a satisfaction promise.`,
        ['Carefully made, consistently good', 'A real person behind every order', 'Easy refunds if it is not right'], '#7c3aed')
    ],
    () => [
      variant('C', 'Convenience', `${cap(d.product)}, without the hassle`,
        `Save time every week. Designed around ${d.audience}.`,
        ['Set it up once, forget about it', 'Works around your schedule', 'Quick and simple to start'], '#ea580c')
    ],
    () => [
      call('save_share_kit', {
        posts: ['A', 'B', 'C'].map((label) => ({
          variant_label: label,
          whatsapp: `Hey! I'm testing an idea: ${d.product}. Takes 20 seconds to tell me if you'd use it: {{LINK_${label}}}`,
          instagram: `Thinking of launching: ${d.product}. Would you use it? Join the early list (link in bio) and tell me what you think. {{LINK_${label}}}`,
          linkedin: `I'm validating a new idea before I build it: ${d.product}. If you're ${d.audience}, I'd value 20 seconds of honest feedback: {{LINK_${label}}}`
        }))
      })
    ],
    () => [call('set_domain_recommendation', { domain: `${d.base}.com`, reason: 'Short, easy to spell, and .com builds trust. Verify availability once GoDaddy is connected.' })],
    () => [{ type: 'text', text: 'Done. Three variants are live. Share the links, then come back and press "Analyze" to get the go / pivot / stop report.' }]
  ];

  const content = script[Math.min(step, script.length - 1)]();
  return { stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', content };
}

export function mockReport(project, stats) {
  const { totals, variants, leader, verdict } = stats;
  const best = variants.find((v) => v.label === leader?.label);
  const intentLine = totals.strongIntentShare == null ? 'No purchase-intent answers yet.' : `${pct(totals.strongIntentShare, 0)} of signups said they would "definitely" or "probably" buy.`;
  const changes = {
    GO: ['Keep the winning angle and price for the first version.', 'Build only the smallest version that delivers the main benefit.', 'Email the waitlist early to book first customers.'],
    PIVOT: ['Rewrite the headline around what visitors asked about most.', 'Test a lower entry price or a free trial.', 'Narrow the audience to the group that signed up most.'],
    STOP: ['Re-interview 5 people from the target audience before spending more.', 'Try a different problem statement, not just new wording.', 'Consider whether this audience actually has the pain you assumed.']
  };
  return {
    headline: `${verdict.code.replace(/_/g, ' ')}: ${verdict.reason}`,
    winner_label: best ? best.label : null,
    key_insights: [
      best ? `Variant ${best.label} ("${best.angle}") performed best at ${pct(best.conversion)} conversion (95% range ${pct(best.ci.low)} to ${pct(best.ci.high)}).` : 'No variant has data yet.',
      intentLine,
      leader?.likelyWinner ? 'The lead over the other variants is statistically meaningful.' : 'The variants are too close to call with the current sample.'
    ],
    customer_questions: [],
    price_signal: intentLine,
    risks: ['Demo mode: this narrative is generated from numbers only. Connect Claude for real qualitative analysis.', 'Small samples can mislead; keep collecting traffic from your real target audience.'],
    recommended_changes: changes[verdict.code] || ['Share your links with more of your target audience.'],
    next_steps: ['Share the three links with at least 100 people in your target audience.', 'Reply to every question you receive. Questions reveal objections.', 'Press Analyze again after more traffic arrives.']
  };
}
