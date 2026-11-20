import { esc, readableOn, formatPrice } from './util.js';

export function renderLanding({ project, variant, nonce }) {
  const accent = variant.accent;
  const on = readableOn(accent);
  const price = formatPrice(project.price);
  const title = `${variant.headline} | ${project.title || 'Early access'}`;
  const question = price
    ? `If this existed today at ${price}, how likely would you be to buy?`
    : 'If this existed today, how likely would you be to buy?';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta name="description" content="${esc(variant.subheadline)}">
<style nonce="${nonce}">
:root{--accent:${accent};--on-accent:${on};--ink:#111827;--muted:#4b5563;--line:#d1d5db;--bg:#f9fafb}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
.skip{position:absolute;left:-999px;top:0;background:#fff;padding:8px 12px;z-index:10}
.skip:focus{left:8px;top:8px}
.banner{background:#fef3c7;color:#78350f;text-align:center;padding:8px 16px;font-size:14px}
header.hero{background:var(--accent);color:var(--on-accent);padding:56px 20px 64px}
.wrap{max-width:760px;margin:0 auto}
h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:0 0 14px}
.sub{font-size:clamp(17px,2.5vw,21px);margin:0;opacity:.95}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;margin:-32px auto 24px;max-width:760px;box-shadow:0 8px 24px rgba(0,0,0,.06)}
.card.flat{margin-top:0}
ul.benefits{list-style:none;padding:0;margin:0;display:grid;gap:12px}
ul.benefits li{padding-left:34px;position:relative;font-size:18px}
ul.benefits li::before{content:'';position:absolute;left:0;top:4px;width:22px;height:22px;border-radius:50%;background:var(--accent)}
ul.benefits li::after{content:'';position:absolute;left:7px;top:8px;width:6px;height:11px;border:solid var(--on-accent);border-width:0 2px 2px 0;transform:rotate(45deg)}
.price{display:inline-block;margin-top:18px;font-weight:700;font-size:20px;border:2px solid var(--accent);border-radius:999px;padding:6px 16px}
h2{font-size:22px;margin:0 0 6px}
p.hint{margin:0 0 16px;color:var(--muted);font-size:15px}
label,legend{display:block;font-weight:600;margin:14px 0 6px;font-size:15px}
input[type=text],input[type=email],textarea{width:100%;padding:12px;border:1px solid #6b7280;border-radius:8px;font:inherit;background:#fff;color:var(--ink)}
fieldset{border:0;padding:0;margin:14px 0 0}
.opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin:6px 0;font-weight:400;cursor:pointer}
.opt input{width:20px;height:20px;accent-color:var(--accent)}
button{margin-top:18px;background:var(--accent);color:var(--on-accent);border:0;border-radius:10px;padding:14px 24px;font:inherit;font-weight:700;font-size:17px;cursor:pointer;width:100%}
button:disabled{opacity:.6;cursor:wait}
button.secondary{background:#fff;color:var(--ink);border:2px solid var(--ink)}
:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
.status{margin-top:14px;font-weight:600;min-height:1.4em}
.status.ok{color:#166534}.status.err{color:#b91c1c}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{max-width:760px;margin:0 auto;padding:8px 20px 40px;color:var(--muted);font-size:14px}
details summary{cursor:pointer;font-weight:600}
</style>
</head>
<body data-slug="${esc(variant.slug)}">
<a class="skip" href="#join">Skip to the sign-up form</a>
<div class="banner" role="note">Early-stage idea: nothing is for sale yet. We're checking whether it's worth building.</div>
<header class="hero"><div class="wrap">
  <h1>${esc(variant.headline)}</h1>
  <p class="sub">${esc(variant.subheadline)}</p>
</div></header>
<main>
<section class="card" aria-labelledby="why">
  <h2 id="why">Why you'll like it</h2>
  <ul class="benefits">${variant.benefits.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  ${price ? `<div class="price" aria-label="Planned price">Planned price: ${esc(price)}</div>` : ''}
</section>

<section class="card flat" id="join" aria-labelledby="joinh">
  <h2 id="joinh">${esc(variant.cta)}</h2>
  <p class="hint">No payment, no commitment. We'll only email you about this.</p>
  <form id="signup" novalidate>
    <label for="name">Your name (optional)</label>
    <input id="name" name="name" type="text" maxlength="80" autocomplete="name">
    <label for="email">Email address <span aria-hidden="true">*</span></label>
    <input id="email" name="email" type="email" maxlength="254" autocomplete="email" required aria-required="true">
    <fieldset>
      <legend>${esc(question)}</legend>
      <label class="opt"><input type="radio" name="intent" value="definitely"> Definitely</label>
      <label class="opt"><input type="radio" name="intent" value="probably"> Probably</label>
      <label class="opt"><input type="radio" name="intent" value="not_sure"> Not sure</label>
      <label class="opt"><input type="radio" name="intent" value="no"> Probably not</label>
    </fieldset>
    <label for="note">What would make this a "yes" for you? (optional)</label>
    <textarea id="note" name="note" rows="3" maxlength="500"></textarea>
    <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
    <button type="submit">${esc(variant.cta)}</button>
    <div class="status" role="status" aria-live="polite" id="signup-status"></div>
  </form>
</section>

<section class="card flat" aria-labelledby="askh">
  <details>
    <summary id="askh">Have a question? Ask us directly</summary>
    <form id="contact" novalidate>
      <label for="c-name">Your name (optional)</label>
      <input id="c-name" name="name" type="text" maxlength="80" autocomplete="name">
      <label for="c-email">Email address <span aria-hidden="true">*</span></label>
      <input id="c-email" name="email" type="email" maxlength="254" autocomplete="email" required aria-required="true">
      <label for="c-text">Your question <span aria-hidden="true">*</span></label>
      <textarea id="c-text" name="text" rows="4" maxlength="1000" required aria-required="true"></textarea>
      <div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
      <button type="submit" class="secondary">Send question</button>
      <div class="status" role="status" aria-live="polite" id="contact-status"></div>
    </form>
  </details>
</section>
</main>
<footer>We store your email only to contact you about this idea, and delete it on request: just reply "remove me" to any email from us.</footer>
<script nonce="${nonce}">
(function(){
  var slug=document.body.dataset.slug;
  function wire(formId,statusId,path,okMsg){
    var form=document.getElementById(formId),status=document.getElementById(statusId);
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var data=Object.fromEntries(new FormData(form).entries());
      if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(data.email||'')){status.className='status err';status.textContent='Please enter a valid email address.';return;}
      if(formId==='contact'&&!(data.text||'').trim()){status.className='status err';status.textContent='Please type your question.';return;}
      var btn=form.querySelector('button');btn.disabled=true;status.className='status';status.textContent='Sending...';
      fetch('/api/public/v/'+slug+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
        .then(function(x){
          if(x.ok){status.className='status ok';status.textContent=okMsg;form.reset();}
          else{status.className='status err';status.textContent=x.j.error||'Something went wrong. Please try again.';btn.disabled=false;}
        })
        .catch(function(){status.className='status err';status.textContent='Network error. Please try again.';btn.disabled=false;});
    });
  }
  wire('signup','signup-status','signup',"Thank you! You're on the list. We'll be in touch.");
  wire('contact','contact-status','message','Thanks! We received your question and will reply by email.');
})();
</script>
</body>
</html>`;
}

export function renderHome() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ValidateFirst: know if your idea will sell before you build it</title>
<style>body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}main{max-width:680px;margin:0 auto;padding:72px 20px}h1{font-size:clamp(30px,6vw,46px);line-height:1.15;margin:0 0 16px}p{font-size:19px;color:#cbd5e1}a{display:inline-block;margin-top:20px;background:#6366f1;color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;text-decoration:none}a:focus-visible{outline:3px solid #fff;outline-offset:2px}small{display:block;margin-top:40px;color:#94a3b8}</style></head>
<body><main>
<h1>Know if your idea will sell before you build it.</h1>
<p>ValidateFirst is an AI agent that turns a rough business idea into three competing landing pages on a real domain, collects waitlist signups and questions in your own mailbox, and tells you whether to build, pivot or stop.</p>
<a href="/admin">Open the dashboard</a>
<small>Built with Claude and GoDaddy for the GoDaddy Inclusive Innovation Hackathon 2026.</small>
</main></body></html>`;
}

export function renderNotFound() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Page not found</h1><p>This link is no longer active.</p></body></html>`;
}
