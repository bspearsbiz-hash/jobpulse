/* Job Pulse "Week Wrapped": an animated, story-style weekly recap built only from a member's real dashboard data.
   Usage: JPWrapped.mount(containerEl, data, {week: 'Nov 16'})   (week = any date inside the Mon-Sun week to show; default = latest week with apps)
   data = the member's dashboard JSON: {first, plan, apps:[{d:"Nov 20"|"Nov 18–19", c, r, p?, t?}], results?:[{d,c,r,k}]} */
(function () {
  const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const YEAR = new Date().getFullYear();
  const parseD = s => { const m = String(s || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})/); return m ? new Date(YEAR, MON[m[1]], +m[2]) : null; };
  const monday = dt => { const d = new Date(dt); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); d.setHours(0,0,0,0); return d; };
  const fmt = d => d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // Annualized top of a pay string, for "biggest swing". Hourly x 2080. Per-assignment pay is ignored.
  function payTop(p) {
    if (!p || /assignment|per piece/i.test(p)) return 0;
    const nums = [...p.matchAll(/\$?\s*([\d.]+)\s*(K)?/gi)].map(m => parseFloat(m[1]) * (m[2] ? 1000 : 1));
    if (!nums.length) return 0;
    const top = Math.max(...nums);
    return /hr|hour/i.test(p) ? top * 2080 : (top < 1000 ? top * 1000 : top);
  }
  const LANES = [
    ['Email & lifecycle', /email|lifecycle|crm|retention|automation|newsletter/i],
    ['Content & copy', /content|copy|writer|editor|seo|pr\b|review/i],
    ['Social & creators', /social|influencer|creator|community/i],
    ['Marketing & growth', /marketing|growth|campaign|brand|coordinator|specialist|strategist/i],
  ];
  const lane = r => (LANES.find(([, re]) => re.test(r)) || ['Other'])[0];

  function stats(data, weekHint) {
    const apps = (data.apps || []).map(a => ({...a, dt: parseD(a.d)})).filter(a => a.dt);
    const latest = apps.length ? apps.reduce((m, a) => a.dt > m ? a.dt : m, apps[0].dt) : new Date();
    const wk = monday(weekHint ? parseD(weekHint) || latest : latest);
    const end = new Date(wk); end.setDate(end.getDate() + 6);
    const inWeek = apps.filter(a => a.dt >= wk && a.dt <= end);
    const total = apps.filter(a => a.dt <= end).length;
    const companies = [...new Set(inWeek.map(a => a.c))];
    const top = inWeek.map(a => ({a, v: payTop(a.p)})).sort((x, y) => y.v - x.v)[0];
    const mix = {}; inWeek.forEach(a => { const l = lane(a.r); mix[l] = (mix[l] || 0) + 1; });
    const flex = inWeek.filter(a => a.t).length;
    const res = (data.results || []).filter(r => { const d = parseD(r.d); return d && d >= wk && d <= end; });
    const allRes = data.results || [];
    const perDay = (String(data.plan || '').match(/(\d+)\s*applications? a weekday/i) || [])[1];
    return {first: data.first || 'there', range: fmt(wk) + ' – ' + fmt(end), n: inWeek.length, total, companies,
      top: top && top.v ? top.a : null, mix: Object.entries(mix).sort((a, b) => b[1] - a[1]), flex,
      res, allRes, nextWeek: perDay ? perDay * 5 : null, sample: inWeek.slice(-12)};
  }

  const CSS = `
  .jpw{position:relative;width:100%;max-width:400px;aspect-ratio:9/16;margin:0 auto;border-radius:26px;overflow:hidden;background:#070a12;color:#f2f5fb;
    font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.55);user-select:none;cursor:pointer}
  .jpw canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5}
  .jpw .bars{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:4px;z-index:6}
  .jpw .bars i{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.22);overflow:hidden}
  .jpw .bars i b{display:block;height:100%;width:0;background:#fff}
  .jpw .brand{position:absolute;top:24px;left:16px;font-weight:800;font-size:13px;z-index:6;letter-spacing:.02em;opacity:.9}.jpw .brand span{color:#22e58a}
  .jpw .s{position:absolute;inset:0;padding:70px 26px 40px;display:flex;flex-direction:column;justify-content:center;opacity:0;transition:opacity .45s}
  .jpw .s.on{opacity:1}
  .jpw .k{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#22e58a}
  .jpw h2{font-size:30px;line-height:1.12;font-weight:850;letter-spacing:-.02em;margin:10px 0;text-transform:none;color:#f2f5fb;display:block}.jpw h2:after,.jpw h2:before{content:none;display:none}
  .jpw p{font-size:16px;line-height:1.45;color:#c9d2ea}
  .jpw .big{font-size:120px;font-weight:900;letter-spacing:-.06em;line-height:.95;color:#22e58a;text-shadow:0 0 60px rgba(34,229,138,.35)}
  .jpw .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
  .jpw .chips span{font-size:13px;font-weight:700;padding:7px 11px;border-radius:999px;background:#101627;border:1px solid #2c3c66;opacity:0;transform:translateY(14px) scale(.9)}
  .jpw .s.on .chips span{animation:jpwIn .5s cubic-bezier(.2,.9,.3,1.3) forwards}
  .jpw .bar{margin:12px 0}.jpw .bar div{display:flex;justify-content:space-between;font-size:14px;font-weight:700}
  .jpw .bar em{display:block;height:12px;border-radius:8px;background:#141c31;margin-top:6px;overflow:hidden}
  .jpw .bar em b{display:block;height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,#16c979,#22e58a);transition:width 1.1s cubic-bezier(.2,.8,.2,1)}
  .jpw .card{background:linear-gradient(160deg,#141c31,#0b1020);border:1px solid #2c3c66;border-radius:20px;padding:20px;margin-top:14px;transform:rotate(-2deg) scale(.9);opacity:0}
  .jpw .s.on .card{animation:jpwPop .7s .25s cubic-bezier(.2,.9,.3,1.4) forwards}
  .jpw .card .co{font-size:24px;font-weight:850}.jpw .card .pay{font-size:40px;font-weight:900;color:#ffb547;margin-top:6px}
  .jpw .pulse{width:90px;height:90px;border-radius:26px;background:#101627;border:1px solid #2c3c66;display:grid;place-items:center;margin-bottom:22px}
  .jpw .pulse svg{width:58px}.jpw .pulse path{stroke-dasharray:140;stroke-dashoffset:140}
  .jpw .s.on .pulse path{animation:jpwDraw 1.4s .2s ease forwards}
  .jpw .cta{display:inline-block;margin-top:18px;background:#22e58a;color:#04120a;font-weight:800;padding:12px 18px;border-radius:999px;text-decoration:none;font-size:15px}
  .jpw .tap{position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:11.5px;color:#8c98b8;z-index:6}
  .jpw .bg{position:absolute;inset:-30%;background:radial-gradient(closest-side,rgba(34,229,138,.18),transparent 70%);animation:jpwFloat 7s ease-in-out infinite alternate}
  @keyframes jpwIn{to{opacity:1;transform:none}}
  @keyframes jpwPop{to{opacity:1;transform:rotate(-2deg) scale(1)}}
  @keyframes jpwDraw{to{stroke-dashoffset:0}}
  @keyframes jpwFloat{from{transform:translate(-12%,-8%)}to{transform:translate(12%,10%)}}
  @media (prefers-reduced-motion:reduce){.jpw *{animation:none!important;transition:none!important}.jpw .chips span,.jpw .card,.jpw .pulse path{opacity:1;transform:none;stroke-dashoffset:0}}`;

  function slides(S, opts) {
    const book = opts.bookUrl ? `<a class="cta" href="${esc(opts.bookUrl)}" target="_blank" rel="noopener">Book your 1-on-1 interview prep</a>` : '';
    const max = S.mix.length ? S.mix[0][1] : 1;
    const out = [];
    out.push({t: 4200, h: `<div class="pulse"><svg viewBox="0 0 64 64"><path d="M4 34h12l5-14 8 28 7-20 4 6h20" fill="none" stroke="#22e58a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="k">Week Wrapped · ${esc(S.range)}</div><h2>${esc(S.first)}, here's your week with Job Pulse.</h2><p>Tap to skip ahead.</p>`});
    out.push({t: 5200, count: S.n, h: `<div class="k">Applications sent</div><div class="big" data-count="${S.n}">0</div>
      <h2>real applications, all submitted for you.</h2><p>${S.companies.length} different companies this week.</p>`});
    if (S.top) out.push({t: 5200, confetti: true, h: `<div class="k">Biggest swing</div><h2>Your highest-paying shot this week</h2>
      <div class="card"><div class="co">${esc(S.top.c)}</div><p>${esc(S.top.r)}</p><div class="pay">${esc(S.top.p)}</div></div>`});
    out.push({t: 5600, h: `<div class="k">Where you showed up</div><h2>Some of the teams that have your resume now</h2>
      <div class="chips">${S.companies.slice(0, 14).map((c, i) => `<span style="animation-delay:${.15 + i * .09}s">${esc(c)}</span>`).join('')}${S.companies.length > 14 ? `<span style="animation-delay:${.15 + 14 * .09}s">+${S.companies.length - 14} more</span>` : ''}</div>`});
    if (S.mix.length) out.push({t: 5200, bars: true, h: `<div class="k">Your role mix</div><h2>What we aimed you at</h2>
      ${S.mix.slice(0, 4).map(([l, n]) => `<div class="bar"><div><span>${esc(l)}</span><span>${n}</span></div><em><b data-w="${Math.round(n / max * 100)}"></b></em></div>`).join('')}
      ${S.flex ? `<p style="margin-top:10px">${S.flex} of them are contract or part-time, so more doors are open.</p>` : ''}`});
    const wins = S.res.filter(r => r.k === 'interview' || r.k === 'offer');
    out.push({t: 5200, confetti: wins.length > 0, h: S.res.length
      ? `<div class="k">Heard back</div><div class="big" data-count="${S.res.length}">0</div><h2>${S.res.length === 1 ? 'company' : 'companies'} got back to you this week${wins.length ? ' 🎉' : ''}.</h2><p>${wins.map(r => esc(r.c) + ' wants an ' + (r.k === 'offer' ? 'offer talk' : 'interview')).join(' · ')}</p>`
      : `<div class="k">Heard back</div><h2>Replies usually take a couple of weeks.</h2><p>When any company reaches out, tap <b>"A company got back to me"</b> on your dashboard so we can prep you right away.</p>`});
    out.push({t: 6500, confetti: true, h: `<div class="k">Running total</div><div class="big" data-count="${S.total}">0</div>
      <h2>applications since you joined.</h2><p>${S.nextWeek ? `Next week: up to ${S.nextWeek} more, Monday to Friday.` : 'More go out every weekday.'} You take the interview. We handle the rest.</p>${book}`});
    return out;
  }

  function confetti(cv) {
    const ctx = cv.getContext('2d'), W = cv.width = cv.offsetWidth * 2, H = cv.height = cv.offsetHeight * 2;
    const cols = ['#22e58a', '#ffb547', '#ffffff', '#5aa8ff', '#f76081'];
    const P = Array.from({length: 110}, () => ({x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 26, vy: -Math.random() * 30 - 8,
      s: 6 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0]}));
    let f = 0; (function tick() { ctx.clearRect(0, 0, W, H); P.forEach(p => { p.vy += .9; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (++f < 120) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H); })();
  }

  function mount(el, data, opts = {}) {
    if (!document.getElementById('jpw-css')) { const st = document.createElement('style'); st.id = 'jpw-css'; st.textContent = CSS; document.head.appendChild(st); }
    const S = stats(data, opts.week);
    const list = slides(S, opts);
    el.innerHTML = `<div class="jpw" role="region" aria-label="Your week in review"><div class="bg"></div><canvas></canvas>
      <div class="bars">${list.map(() => '<i><b></b></i>').join('')}</div><div class="brand">Job <span>Pulse</span></div>
      ${list.map(s => `<section class="s">${s.h}</section>`).join('')}<div class="tap">Tap to skip · ${esc(S.range)}</div></div>`;
    const root = el.firstChild, secs = root.querySelectorAll('.s'), bars = root.querySelectorAll('.bars b'), cv = root.querySelector('canvas');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = -1, timer, raf;
    function count(node) { const to = +node.dataset.count; if (reduce) { node.textContent = to; return; }
      const t0 = performance.now(), dur = 1300; (function step(t) { const k = Math.min(1, (t - t0) / dur);
        node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0); }
    function go(n) {
      clearTimeout(timer); cancelAnimationFrame(raf);
      if (n >= list.length) { if (opts.loop === false) return; n = 0; }
      i = n; secs.forEach((s, k) => s.classList.toggle('on', k === i));
      bars.forEach((b, k) => { b.style.transition = 'none'; b.style.width = k < i ? '100%' : '0'; });
      const cur = bars[i]; void cur.offsetWidth; cur.style.transition = `width ${list[i].t}ms linear`; cur.style.width = '100%';
      secs[i].querySelectorAll('[data-count]').forEach(count);
      secs[i].querySelectorAll('[data-w]').forEach(b => { b.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => b.style.width = b.dataset.w + '%')); });
      if (list[i].confetti && !reduce) confetti(cv);
      timer = setTimeout(() => go(i + 1), list[i].t);
    }
    root.addEventListener('click', e => { if (e.target.closest('a')) return; go(i + 1); });
    go(0);
    return {stats: S, restart: () => go(0)};
  }
  window.JPWrapped = {mount, stats};
})();
