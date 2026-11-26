/* Job Pulse "special discount" downsell.
   When a visitor has seen the $99 / $199 plans but hesitates, offer the $50/mo Starter once.
   Usage: JPDownsell.arm()  -> call right after the $99/$199 plans are shown.
          JPDownsell.link(el) -> append a quiet "price a stretch?" link that opens the offer.
   The price is set in Stripe (the $50 Payment Link). Nothing here is read from the URL. */
(function () {
  var PAY = 'https://buy.stripe.com/9B64gz7wkcRU1ZvaJDebu01';
  var KEY = 'jp_downsell_seen', IDLE_MS = 25000;
  var armed = false, shown = false, idle = null, left = false;

  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  function css() {
    if (document.getElementById('jp-ds-css')) return;
    var s = document.createElement('style'); s.id = 'jp-ds-css';
    s.textContent =
      '.jp-ds{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgba(4,7,14,.78);backdrop-filter:blur(4px);animation:jpdsf .2s ease}' +
      '.jp-ds-box{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;background:linear-gradient(160deg,#0f2a1f,var(--card) 60%);border:1px solid rgba(34,229,138,.55);border-radius:22px;padding:26px 20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 6px rgba(34,229,138,.06);text-align:center;animation:jpdsu .25s ease}' +
      '.jp-ds-tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--dark);background:var(--pulse);border-radius:999px;padding:5px 11px}' +
      '.jp-ds h2{font-size:24px;line-height:1.15;letter-spacing:-.02em;margin:14px 0 8px}' +
      '.jp-ds p{color:var(--muted);font-size:14.5px}' +
      '.jp-ds-pr{margin:16px 0 4px;font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1}' +
      '.jp-ds-pr s{font-size:20px;color:var(--muted);font-weight:700;margin-right:8px}' +
      '.jp-ds-pr small{font-size:15px;color:var(--muted);font-weight:600;letter-spacing:0}' +
      '.jp-ds ul{list-style:none;text-align:left;display:grid;gap:6px;margin:16px 0 18px;font-size:14px}' +
      '.jp-ds li:before{content:"\\2713";color:var(--pulse);font-weight:800;margin-right:8px}' +
      '.jp-ds .btn{margin-top:4px}' +
      '.jp-ds-no{background:none;border:0;color:var(--muted);font:inherit;font-size:13.5px;text-decoration:underline;cursor:pointer;padding:12px 8px 4px;min-height:44px}' +
      '.jp-ds-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border:0;background:none;color:var(--muted);font-size:24px;line-height:1;cursor:pointer}' +
      '.jp-ds-link{display:block;margin:12px auto 0;background:none;border:0;color:var(--muted);font:inherit;font-size:13.5px;text-decoration:underline;cursor:pointer;padding:8px 0;min-height:44px}' +
      '@keyframes jpdsf{from{opacity:0}}@keyframes jpdsu{from{opacity:0;transform:translateY(14px) scale(.98)}}' +
      '@media (prefers-reduced-motion:reduce){.jp-ds,.jp-ds-box{animation:none}}';
    document.head.appendChild(s);
  }

  function close(wrap, prev) {
    wrap.remove();
    document.removeEventListener('keydown', wrap._key);
    document.body.style.overflow = '';
    if (prev && prev.focus) prev.focus();
  }

  function show() {
    if (shown) return;
    shown = true; disarm(); mark(); css();
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'jp-ds';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'jp-ds-h');
    wrap.innerHTML =
      '<div class="jp-ds-box">' +
        '<button type="button" class="jp-ds-x" aria-label="Close">&times;</button>' +
        '<span class="jp-ds-tag">Special discount</span>' +
        '<h2 id="jp-ds-h">Price a stretch? Start for $50.</h2>' +
        '<p>We get it: a job search is stressful enough without a big bill. Here&rsquo;s our private member rate.</p>' +
        '<div class="jp-ds-pr"><s>$99</s>$50<small>/mo</small></div>' +
        '<p>Billed monthly by Stripe</p>' +
        '<ul><li>Resume revamp for the roles you want</li><li>10 real applications every weekday</li><li>Interview mentorship + group prep calls</li><li>Your live dashboard with every link</li></ul>' +
        '<a class="btn" href="' + PAY + '">Claim $50/mo &rarr;</a>' +
        '<button type="button" class="jp-ds-no">No thanks, I&rsquo;ll pass on the discount</button>' +
      '</div>';
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    var done = function () { close(wrap, prev); };
    wrap.querySelector('.jp-ds-x').addEventListener('click', done);
    wrap.querySelector('.jp-ds-no').addEventListener('click', done);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) done(); });
    wrap._key = function (e) {
      if (e.key === 'Escape') { done(); return; }
      if (e.key !== 'Tab') return;
      var f = wrap.querySelectorAll('a,button'), a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', wrap._key);
    wrap.querySelector('.btn').focus();
  }

  // Hesitation signals
  function onOut(e) { if (!e.relatedTarget && e.clientY <= 0) show(); }          // desktop: pointer heads for the tab bar / close
  function onVis() { if (document.hidden) left = true; else if (left) show(); }  // mobile: switched away, then came back
  function onPick(e) { if (e.target.closest && e.target.closest('a[href*="buy.stripe.com"],a[href="vip.html"]')) disarm(); }
  function reset() { clearTimeout(idle); idle = setTimeout(show, IDLE_MS); }       // sat on the price without choosing

  function disarm() {
    armed = false; clearTimeout(idle);
    document.removeEventListener('mouseout', onOut);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('click', onPick, true);
  }

  function arm() {
    if (armed || shown || seen()) return;
    armed = true; left = false; reset();
    document.addEventListener('mouseout', onOut);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('click', onPick, true);
  }

  function link(el) {
    if (!el) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'jp-ds-link';
    b.textContent = 'Price a stretch right now? See a special discount';
    b.addEventListener('click', function () { shown = false; show(); });
    css(); el.appendChild(b);
  }

  window.JPDownsell = { arm: arm, link: link, show: show };
})();
