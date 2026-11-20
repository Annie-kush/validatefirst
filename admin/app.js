/* ValidateFirst admin dashboard: vanilla JS, no build step. All dynamic text uses textContent. */
const $ = (sel) => document.querySelector(sel);
const state = { status: null, projects: [], currentId: null, view: null, tab: 'A', domainSearch: null, busy: {} };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'disabled' || k === 'checked') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'validatefirst' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', {}, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied to clipboard');
}

const pct = (x, d = 1) => (x == null ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const VERDICT_LABEL = { GO: 'GO: build it', PIVOT: 'PIVOT: adjust the offer', STOP: 'STOP: rethink the idea', NOT_ENOUGH_DATA: 'Not enough data yet' };

/* ---------- data loading ---------- */

async function loadStatus() {
  state.status = await api('GET', '/api/admin/status');
  renderPills();
}

async function loadProjects() {
  state.projects = (await api('GET', '/api/admin/projects')).projects;
  renderSidebar();
}

let lastSnapshot = '';
async function loadProject(force = false) {
  if (!state.currentId) return;
  try {
    const view = await api('GET', `/api/admin/projects/${state.currentId}`);
    const snap = JSON.stringify(view);
    if (!force && snap === lastSnapshot) return;
    lastSnapshot = snap;
    state.view = view;
    renderMain();
  } catch (e) {
    toast(e.message);
  }
}

function select(id) {
  state.currentId = id;
  state.view = null;
  state.domainSearch = null;
  lastSnapshot = '';
  renderSidebar();
  id ? loadProject(true) : renderMain();
  $('#main').focus();
}

async function run(key, fn) {
  if (state.busy[key]) return;
  state.busy[key] = true;
  renderMain();
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    state.busy[key] = false;
    await loadProject(true);
    loadProjects();
  }
}

/* ---------- header + sidebar ---------- */

function renderPills() {
  const s = state.status;
  const pill = (name, on, onText, offText) => h('span', { class: `pill ${on ? 'on' : 'demo'}` }, `${name}: ${on ? onText : offText}`);
  $('#pills').replaceChildren(
    pill('Claude', s.claude, `live (${s.model})`, 'demo mode'),
    pill('GoDaddy domains', s.godaddy, 'connected', 'demo mode'),
    pill('Mailbox', s.mail, 'SMTP connected', 'outbox file')
  );
}

function renderSidebar() {
  const list = state.projects.map((p) =>
    h('button', { class: 'proj', 'aria-current': String(p.id === state.currentId), onclick: () => select(p.id) },
      h('b', {}, p.title),
      h('small', {}, `${p.views} visits · ${p.signups} signups `),
      h('span', { class: `badge ${p.status === 'live' || p.status === 'analyzed' ? p.verdict : p.status}` }, p.status === 'live' || p.status === 'analyzed' ? p.verdict.replace(/_/g, ' ') : p.status))
  );
  $('#sidebar').replaceChildren(h('button', { onclick: () => select(null) }, '+ Test a new idea'), ...list);
}

/* ---------- main ---------- */

function renderMain() {
  const main = $('#main');
  main.replaceChildren(state.currentId ? (state.view ? renderProject(state.view) : h('p', {}, 'Loading...')) : renderNew());
}

const EXAMPLES = [
  ['Hand-roasted coffee subscription for remote workers', 'Remote workers in Bangalore', '₹499 per month'],
  ['Weekend Python classes for school students', 'Parents of class 8-10 students', '₹1500 per month'],
  ['Home-cooked healthy tiffin for office workers', 'Office workers in Pune', '₹150 per day']
];

function renderNew() {
  const idea = h('textarea', { id: 'idea', rows: 4, maxlength: 1000, placeholder: 'e.g. A subscription box of hand-roasted coffee for remote workers' });
  const audience = h('input', { id: 'audience', maxlength: 200, placeholder: 'Who is it for? (optional)' });
  const city = h('input', { id: 'city', maxlength: 100, placeholder: 'Where? (optional)' });
  const price = h('input', { id: 'price', maxlength: 100, placeholder: 'e.g. ₹499 per month (optional)' });
  const error = h('div', { class: 'err', hidden: true });
  const go = h('button', {
    onclick: async () => {
      go.disabled = true;
      error.hidden = true;
      try {
        const { id } = await api('POST', '/api/admin/projects', { idea: idea.value, audience: audience.value, city: city.value, priceHint: price.value });
        await loadProjects();
        select(id);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        go.disabled = false;
      }
    }
  }, 'Test my idea');

  return h('div', {},
    h('section', { class: 'card hero' },
      h('h1', {}, 'Know if your idea will sell before you build it.'),
      h('p', {}, 'Describe your idea. An AI agent finds a domain, builds three competing landing pages, and tells you whether to build, pivot or stop, based on real signups.'),
      h('label', { for: 'idea' }, 'Your business idea'), idea,
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'audience' }, 'Target audience'), audience), h('div', {}, h('label', { for: 'city' }, 'Location'), city)),
      h('label', { for: 'price' }, 'Price you have in mind'), price,
      h('div', { class: 'examples' }, h('span', { class: 'sub' }, 'Try an example:'),
        EXAMPLES.map(([i, a, p]) => h('button', { class: 'chip', onclick: () => { idea.value = i; audience.value = a; price.value = p; } }, i))),
      error,
      h('div', { class: 'actions' }, go)),
    h('section', { class: 'card' },
      h('h2', {}, 'How it works'),
      h('ol', { class: 'steps' },
        h('li', {}, h('b', {}, '1. Plan'), 'Claude picks a domain and designs 3 different value propositions.'),
        h('li', {}, h('b', {}, '2. Launch'), 'Three live landing pages with a waitlist and a question form.'),
        h('li', {}, h('b', {}, '3. Collect'), 'Share the links. Signups and questions arrive in your own mailbox.'),
        h('li', {}, h('b', {}, '4. Decide'), 'Statistics plus Claude give you a clear go / pivot / stop report.'))));
}

function stepper(v) {
  const p = v.project;
  const live = p.status === 'live' || p.status === 'analyzed';
  const hasData = v.stats.totals.views > 0 || v.stats.totals.signups > 0;
  const stage = p.status === 'analyzed' ? 4 : hasData ? 3 : live ? 2 : 1;
  const names = ['Plan', 'Launch', 'Collect evidence', 'Decide'];
  return h('ol', { class: 'steps progress' }, names.map((n, i) => h('li', { class: i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : '' }, h('b', {}, `${i + 1}. ${n}`), i + 1 < stage ? 'Done' : i + 1 === stage ? 'You are here' : '')));
}

function renderProject(v) {
  const p = v.project;
  const planning = p.status === 'planning';
  return h('div', {},
    h('section', { class: 'card' },
      h('div', { class: 'title-row' },
        h('div', {}, h('h2', {}, p.title), h('p', { class: 'sub' }, p.idea), h('span', { class: `badge ${p.status}` }, p.status)),
        h('button', { class: 'danger', onclick: async () => { if (confirm('Delete this project and all its signups?')) { await api('DELETE', `/api/admin/projects/${p.id}`); await loadProjects(); select(null); } } }, 'Delete')),
      stepper(v),
      p.status === 'error' ? h('div', { class: 'err' }, p.error || 'Something went wrong.') : null),
    agentCard(v),
    planning ? null : [variantsCard(v), evidenceCard(v), reportCard(v), domainCard(v), shareCard(v), inboxCard(v)]);
}

function agentCard(v) {
  const p = v.project;
  const log = h('div', { class: 'log', role: 'log', 'aria-label': 'Agent activity' }, p.agentLog.map((e) => h('div', { class: e.kind }, `${{ tool: '▶ ', result: '  ✓ ', thought: '💭 ', error: '✗ ', done: '★ ', status: '• ' }[e.kind] || ''}${e.text}`)));
  setTimeout(() => (log.scrollTop = log.scrollHeight));
  return h('section', { class: 'card' },
    h('h2', {}, p.status === 'planning' ? [h('span', { class: 'spinner' }), 'Agent is working...'] : 'Agent activity'),
    h('p', { class: 'sub' }, 'Every step the agent takes, live: domain search, page creation, share copy.'),
    log);
}

function variantsCard(v) {
  return h('section', { class: 'card' },
    h('h2', {}, 'Your three test pages'),
    h('p', { class: 'sub' }, 'Same price on all three, different angle. Share each link with a different slice of your audience, or split evenly.'),
    h('div', { class: 'grid3' }, v.variants.map((x) => {
      const s = v.stats.variants.find((y) => y.id === x.id);
      const input = h('input', { readonly: true, value: x.url, 'aria-label': `Link for variant ${x.label}` });
      return h('div', { class: 'variant', style: { '--accent': x.accent } },
        h('div', {}, h('span', { class: 'lab' }, x.label), h('b', {}, x.angle)),
        h('h3', {}, x.headline),
        h('div', { class: 'sub' }, x.subheadline),
        h('div', { class: 'linkrow' }, input, h('button', { class: 'ghost', onclick: () => copy(x.url) }, 'Copy'), h('a', { class: 'btn ghost', href: x.url, target: '_blank', rel: 'noopener' }, 'Open')),
        h('div', { class: 'metrics' }, h('div', {}, h('b', {}, s.views), 'visits'), h('div', {}, h('b', {}, s.signups), 'signups'), h('div', {}, h('b', {}, pct(s.conversion)), 'conversion')));
    })));
}

function evidenceCard(v) {
  const { stats } = v;
  const max = Math.max(0.0001, ...stats.variants.map((s) => s.ci.high));
  const demoCount = v.signups.filter((s) => s.demo).length;
  const hasReal = v.signups.some((s) => !s.demo);
  const busy = (k) => !!state.busy[k];
  return h('section', { class: 'card' },
    h('h2', {}, 'Evidence'),
    h('p', { class: 'sub' }, 'Live results. Bars show conversion; the range is the 95% confidence interval, so small samples are shown honestly.'),
    stats.totals.simulated ? h('div', { class: 'notice' }, `This project contains ${demoCount} simulated signups. Findings are illustrative only. Clear the demo data before sharing real results.`) : null,
    stats.variants.map((s) => {
      const x = v.variants.find((y) => y.id === s.id);
      const total = s.answered || 1;
      return h('div', { style: { '--accent': x.accent } },
        h('div', { class: 'barrow' },
          h('div', {}, h('b', {}, `Variant ${s.label}`), h('div', { class: 'sub' }, s.angle)),
          h('div', {}, h('div', { class: 'bar', role: 'img', 'aria-label': `Variant ${s.label} conversion ${pct(s.conversion)}` }, h('span', { style: { width: `${(s.conversion / max) * 100}%` } })),
            h('div', { class: 'stack', style: { marginTop: '6px' }, role: 'img', 'aria-label': `Purchase intent for variant ${s.label}` }, ['definitely', 'probably', 'not_sure', 'no'].map((k) => h('span', { class: k, style: { width: `${(s.intent[k] / total) * 100}%` } })))),
          h('div', {}, h('b', {}, pct(s.conversion)), h('div', { class: 'sub' }, `range ${pct(s.ci.low)} to ${pct(s.ci.high)}`))));
    }),
    h('div', { class: 'legend' }, [['#15803d', 'Definitely'], ['#65a30d', 'Probably'], ['#facc15', 'Not sure'], ['#dc2626', 'Probably not']].map(([c, t]) => h('span', {}, h('i', { style: { background: c } }), t))),
    h('div', { class: 'actions' },
      h('button', { disabled: busy('analyze'), onclick: () => run('analyze', () => api('POST', `/api/admin/projects/${v.project.id}/analyze`).then(() => toast('Report ready'))) }, busy('analyze') ? 'Analyzing...' : '🔍 Analyze results'),
      h('button', { class: 'ghost', disabled: busy('seed'), onclick: () => run('seed', () => api('POST', `/api/admin/projects/${v.project.id}/seed`)) }, 'Load demo traffic'),
      demoCount ? h('button', { class: 'ghost', onclick: () => run('clear', () => api('POST', `/api/admin/projects/${v.project.id}/clear-demo`)) }, 'Clear demo data') : null,
      hasReal || demoCount ? h('a', { class: 'btn ghost', href: `/api/admin/projects/${v.project.id}/export` }, 'Export signups (CSV)') : null));
}

function list(items) {
  return items && items.length ? h('ul', { class: 'clean' }, items.map((i) => h('li', {}, i))) : h('p', { class: 'sub' }, 'None');
}

function reportCard(v) {
  const r = v.report;
  const live = v.stats.verdict;
  if (!r) {
    return h('section', { class: 'card' },
      h('h2', {}, 'Go / pivot / stop report'),
      h('div', { class: `verdict ${live.code}` }, h('div', { class: 'code' }, 'CURRENT SIGNAL'), h('div', { class: 'head' }, VERDICT_LABEL[live.code]), h('div', {}, live.reason)),
      h('p', { class: 'sub' }, 'Press "Analyze results" for the full written report.'));
  }
  return h('section', { class: 'card' },
    h('h2', {}, 'Go / pivot / stop report'),
    h('div', { class: `verdict ${r.verdict.code}` },
      h('div', { class: 'code' }, `VERDICT · ${r.engine === 'claude' ? 'ANALYSED BY CLAUDE' : 'DEMO ANALYSIS'}`),
      h('div', { class: 'head' }, VERDICT_LABEL[r.verdict.code]),
      h('div', {}, r.headline)),
    r.simulated ? h('div', { class: 'notice' }, 'Based on simulated demo data. Illustrative only.') : null,
    r.engine !== 'claude' ? h('div', { class: 'notice' }, 'Demo analysis: generated from the numbers only. With a Claude key this includes written insight on visitor questions.') : null,
    r.winner_label ? h('p', {}, h('b', {}, `Leading variant: ${r.winner_label}. `), `Sample quality: ${r.sample}.`) : null,
    h('div', { class: 'cols' },
      h('div', {}, h('h3', {}, 'Key insights'), list(r.key_insights), h('h3', {}, 'Price signal'), h('p', {}, r.price_signal || 'n/a'), h('h3', {}, 'Risks'), list(r.risks)),
      h('div', {}, h('h3', {}, 'Recommended changes'), list(r.recommended_changes), h('h3', {}, 'Next 7 days'), list(r.next_steps))),
    r.customer_questions?.length ? [h('h3', {}, 'What visitors asked about'), h('ul', { class: 'clean' }, r.customer_questions.map((q) => h('li', {}, `${q.theme} (${q.count})${q.example ? `: “${q.example}”` : ''}`)))] : null,
    h('p', { class: 'sub' }, `Verdict rules: GO needs ≥${v.thresholds.goConversion * 100}% conversion and ≥${v.thresholds.goStrongIntent * 100}% strong intent; PIVOT needs ≥${v.thresholds.pivotConversion * 100}%. These are rule-of-thumb benchmarks, not guarantees.`));
}

function domainCard(v) {
  const d = v.project.domain;
  const searchInput = h('input', { id: 'domq', placeholder: 'Search another name, e.g. brewbox', value: state.domainSearch?.query || '' });
  const results = state.domainSearch?.domains || d.candidates.map((x) => ({ domain: x }));
  const avail = (dom) => {
    const c = d.checks?.[dom];
    if (!c || c.available == null) return h('span', { class: 'unk' }, 'unverified');
    return c.available ? h('span', { class: 'ok' }, 'available') : h('span', { class: 'no' }, 'taken');
  };
  return h('section', { class: 'card' },
    h('h2', {}, 'Domain'),
    h('p', { class: 'sub' }, d.source === 'godaddy' ? 'Live results from GoDaddy.' : 'Demo mode: names are generated locally and availability is unverified until GoDaddy is connected.'),
    d.recommended ? h('div', { class: 'notice' }, `Agent recommends ${d.recommended.domain}: ${d.recommended.reason}`) : null,
    d.chosen ? h('p', {}, h('b', {}, `Chosen: ${d.chosen}`)) : null,
    results.map((r) => h('div', { class: 'dom' },
      h('span', {}, h('b', {}, r.domain), ' ', avail(r.domain)),
      h('span', { class: 'actions', style: { marginTop: '0' } },
        h('button', { class: 'ghost', onclick: () => run(`chk${r.domain}`, () => api('POST', `/api/admin/projects/${v.project.id}/domain/check`, { domain: r.domain })) }, 'Check'),
        h('button', { class: 'ghost', onclick: () => run(`sel${r.domain}`, () => api('POST', `/api/admin/projects/${v.project.id}/domain/choose`, { domain: r.domain })) }, 'Choose'),
        h('a', { class: 'btn ghost', target: '_blank', rel: 'noopener', href: `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(r.domain)}` }, 'Buy on GoDaddy')))),
    h('div', { class: 'linkrow', style: { marginTop: '12px' } }, searchInput,
      h('button', { onclick: async () => { try { state.domainSearch = { query: searchInput.value, ...(await api('POST', `/api/admin/projects/${v.project.id}/domain/search`, { query: searchInput.value })) }; renderMain(); } catch (e) { toast(e.message); } } }, 'Search')));
}

function shareCard(v) {
  const kit = v.project.shareKit || {};
  const labels = Object.keys(kit);
  if (!labels.length) return null;
  if (!labels.includes(state.tab)) state.tab = labels[0];
  const posts = kit[state.tab];
  return h('section', { class: 'card' },
    h('h2', {}, 'Share kit'),
    h('p', { class: 'sub' }, 'Ready-to-post copy. Each variant gets its own link so results stay separate.'),
    h('div', { class: 'tabs', role: 'tablist' }, labels.map((l) => h('button', { role: 'tab', 'aria-selected': String(l === state.tab), onclick: () => { state.tab = l; renderMain(); } }, `Variant ${l}`))),
    Object.entries(posts).map(([ch, text]) => h('div', { class: 'post' }, h('header', {}, ch[0].toUpperCase() + ch.slice(1), h('button', { class: 'ghost', onclick: () => copy(text) }, 'Copy')), text)));
}

function inboxCard(v) {
  return h('section', { class: 'card' },
    h('h2', {}, 'Signups and questions'),
    h('p', { class: 'sub' }, 'Each signup and question is also emailed to your business mailbox.'),
    h('div', { class: 'cols' },
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Var', 'Email', 'Intent', 'Note'].map((t) => h('th', {}, t)))),
        h('tbody', {}, v.signups.length ? v.signups.slice(0, 50).map((s) => h('tr', {}, h('td', {}, s.variantLabel), h('td', {}, s.email), h('td', {}, (s.intent || '-').replace('_', ' ')), h('td', {}, s.note || ''))) : h('tr', {}, h('td', { colspan: 4 }, 'No signups yet. Share your links!'))))),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Var', 'From', 'Question'].map((t) => h('th', {}, t)))),
        h('tbody', {}, v.messages.length ? v.messages.slice(0, 50).map((m) => h('tr', {}, h('td', {}, m.variantLabel), h('td', {}, m.name || m.email), h('td', {}, m.text))) : h('tr', {}, h('td', { colspan: 3 }, 'No questions yet.')))))));
}

/* ---------- boot ---------- */

async function boot() {
  await loadStatus();
  await loadProjects();
  renderMain();
  setInterval(() => {
    if (state.currentId && !document.hidden) loadProject();
    if (!document.hidden) loadProjects();
  }, 3000);
}
boot().catch((e) => toast(e.message));
