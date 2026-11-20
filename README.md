# ✓ ValidateFirst

**Know if your idea will sell before you build it.**

Most first-time founders spend weeks and money building something nobody wants. Every idea-to-launch tool helps them *build*. ValidateFirst answers the question that comes first: **should I build this at all?**

An AI agent (Claude) takes a rough idea, finds a domain through GoDaddy, publishes **three competing landing pages** that each test a different value proposition at the same price, collects real waitlist signups and questions in the founder's own business mailbox, then delivers an evidence-based **GO / PIVOT / STOP** report.

Built for the GoDaddy Inclusive Innovation Hackathon 2026 (Claude + GoDaddy).

## How it works

```
Founder enters idea
   │
   ▼
Claude agent (tool-use loop)               GoDaddy
 ├─ suggest_domains / check_domain  ─────► gddy domain suggest / available
 ├─ create_variant ×3  ───────────────────► 3 live pages  (/v/<slug>) on your domain
 ├─ save_share_kit  (WhatsApp / Instagram / LinkedIn copy)
 └─ set_domain_recommendation
   │
   ▼
Visitors: landing page → waitlist + "would you buy at ₹X?" + questions
   │                      └────► emailed to hello@yourdomain.com (Titan, SMTP)
   ▼
Stats engine (conversion + 95% Wilson interval + purchase intent)
   │   deterministic rules decide GO / PIVOT / STOP
   ▼
Claude analyst: explains the verdict, themes in visitor questions,
                price signal, recommended changes, next 7 days
```

**Why the verdict isn't just an LLM opinion:** conversion rates, confidence intervals and purchase-intent scores are computed in code. Claude explains and advises, but cannot override the verdict. Small samples are labelled honestly (`NOT_ENOUGH_DATA` until 30 visits and 5 signups).

## Run it now (no credentials needed)

Requires Node 20+. No install step is needed for demo mode (zero runtime dependencies; `nodemailer` is only loaded when SMTP is configured).

```
npm start
```

Open http://localhost:3000 for the public home page and http://localhost:3000/admin for the dashboard. If `ADMIN_PASSWORD` isn't set, a random password is printed in the console on start (user `admin`). The public home page also serves as the hosting platform's health check.

Without keys the app runs in **demo mode** (shown in the header pills): a scripted agent stands in for Claude, domain names are generated locally (availability marked *unverified*), and emails are written to `data/outbox.jsonl`. The whole product flow still works, including **Load demo traffic**, which adds clearly-labelled simulated visitors so you can see the analysis immediately.

```
npm test       # 9 tests: stats, escaping, auth/CSRF, full end-to-end flow
```

## Configuration

Set these as environment variables, or in a local `.env` file (never commit it). Placeholder values such as `YOUR_KEY` are treated as "not set".

| Variable | Purpose | Needed for |
|---|---|---|
| `ADMIN_PASSWORD` | Admin dashboard password (user `admin`) | **Always set in production** |
| `PUBLIC_BASE_URL` | Public URL, e.g. `https://yourdomain.com` | Correct share links |
| `ANTHROPIC_API_KEY` | Claude API key | Real agent + analysis |
| `CLAUDE_MODEL` | Default `claude-sonnet-4-5` | Optional |
| `SMTP_USER` | Full mailbox address, e.g. `hello@yourdomain.com` | Real email |
| `SMTP_PASS` | Mailbox password. **Env var only, never in code or repo** | Real email |
| `SMTP_HOST` | Default `smtpout.secureserver.net` (GoDaddy) | Optional |
| `SMTP_PORT` | Default `465` | Optional |
| `OWNER_EMAIL` | Where notifications go (defaults to `SMTP_USER`) | Optional |
| `GDDY_BIN` | Path to the `gddy` CLI if not on PATH | Optional |
| `DATA_DIR` | Where `db.json` is stored (default `./data`) | Optional |
| `TRUST_PROXY` | Default `true`: use `X-Forwarded-For` behind GoDaddy's proxy | Optional |

GoDaddy domain search uses the `gddy` CLI (`gddy domain suggest`, `gddy domain available`). Authenticate it once with `gddy auth login`, or set `GDDY_PAT` for non-interactive use.

## Deploy to GoDaddy Node.js hosting

The app already meets GoDaddy's requirements: `build` and `start` scripts, `PORT` binding, runtime packages in `dependencies`, Node 20.

1. Zip the project root **without** `node_modules`, `.env` and `data` (they're in `.gitignore`).
2. Deploy the zip with the `gddy` CLI (see https://developer.godaddy.com/en/docs/api-users/hosting/workflows/deploy-nodejs-app).
3. Set the environment variables above on the hosting project.
4. Buy a domain, point DNS at the app with `gddy`, confirm HTTPS.
5. Create the Titan mailbox (`hello@yourdomain.com`) with `gddy`, set `SMTP_USER` / `SMTP_PASS`, and send a test email.

## Security notes

- Admin is behind HTTP Basic auth (constant-time compare, failed-attempt rate limit); a random password is generated if none is set, so it's never open by default.
- State-changing admin calls require a custom header (CSRF defence). Strict CSP with per-request nonces on public pages.
- All model-generated and visitor-supplied text is HTML-escaped; visitor text is passed to Claude inside an `<untrusted_feedback>` block with instructions to treat it as data.
- Public endpoints: honeypot field, per-IP rate limiting, body size limits, email header-injection stripping, CSV formula-injection neutralised on export.
- Honest by design: pages carry an "early-stage idea, nothing is for sale" banner, no payments are taken, signups can ask for removal, and simulated data is always labelled.

## Accessibility (inclusive by default)

Landing pages use semantic HTML, labelled form controls, a skip link, visible focus, live-region status messages, and auto-picked text colour for WCAG contrast on the accent colour. The agent writes page copy in the language the idea was written in.

## Project layout

```
server.js        HTTP server, routes, auth, rate limiting
lib/agent.js     Claude tool-use loop (domains, variants, share kit)
lib/report.js    Claude analyst (forced structured output)
lib/stats.js     Conversion, Wilson CI, intent score, verdict rules
lib/godaddy.js   gddy CLI wrapper (suggest / available)
lib/mail.js      SMTP via GoDaddy mailbox (outbox fallback)
lib/landing.js   Accessible, escaped landing page renderer
lib/mock.js      Demo-mode stand-ins for Claude
admin/           Dashboard UI (vanilla JS)
```
