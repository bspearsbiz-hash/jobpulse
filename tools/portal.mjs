// Job Pulse member portal data tool. Only encrypted files are ever committed.
// Read a client's current data:   node tools/portal.mjs get <email> <ACCESS-CODE> > /tmp/client.json
// Save updated data (re-encrypt): node tools/portal.mjs put /tmp/client.json <ACCESS-CODE>
// New client (makes a code):      node tools/portal.mjs put /tmp/client.json
// Check a job before applying:     node tools/portal.mjs check /tmp/client.json /tmp/job.json [--no-live]
// Log a submitted application:     node tools/portal.mjs add /tmp/client.json /tmp/job.json   (only adds it if it passes the quality check)
// Interview rate across members:   node tools/portal.mjs stats /tmp/a.json /tmp/b.json [--log ~/jobpulse-stats.tsv]
//   (reads the plaintext files in /tmp; --log appends a dated line to a file OUTSIDE the repo)
// Data shape: {email, first, plan, since, updated, focus, profile?:true (set once their application profile form arrives; until then the dashboard shows a 'fill out your profile' need),
//   apps:[{d:"Nov 20", c:"Company", r:"Role", t?:"Contract|Part-time", p?:"$70K", u?:"https://posting"}],  (oldest first)
//   needs:[{k:"short ask", w:"why / what it unlocks", u?:"https://link"}],
//   results?:[{d:"Nov 30", c:"Company", r?:"Role", k:"reply|interview|offer|hired|no", w?:"when", n?:"note"}],  (one per employer update; log every one.
//      d = the date it happened (for an interview: the interview date). The dashboard's "Interviews this week" counts k:"interview" with d in this Mon-Sun week.)
//   prefs?:{work:["remote","hybrid","onsite"], area?:"City, ST", miles?:25|"metro", titles:["target title",...], avoid?:["sales",...], maxDays?:60}
//      (from the intake/profile form. Every application must match these: see tools/qualify.mjs)}
// Never commit the plaintext JSON or the access code.
import {readFileSync, writeFileSync, mkdirSync, appendFileSync} from 'fs';
import {webcrypto as c} from 'crypto';
import {qualify} from './qualify.mjs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const enc = new TextEncoder(), hex = b => Buffer.from(b).toString('hex'), unhex = h => Uint8Array.from(Buffer.from(h, 'hex'));
const idFor = async e => hex(await c.subtle.digest('SHA-256', enc.encode('jobpulse:' + e.trim().toLowerCase())));
const keyFor = async (code, salt, use) => c.subtle.deriveKey({name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'},
  await c.subtle.importKey('raw', enc.encode(code.trim().toUpperCase()), 'PBKDF2', false, ['deriveKey']), {name:'AES-GCM', length:256}, false, [use]);
const [, , cmd, a, b] = process.argv;
if (cmd === 'get') {
  const box = JSON.parse(readFileSync(join(repo, 'c', (await idFor(a)) + '.json'), 'utf8'));
  const pt = await c.subtle.decrypt({name:'AES-GCM', iv:unhex(box.i)}, await keyFor(b, unhex(box.s), 'decrypt'), Buffer.from(box.d, 'base64'));
  process.stdout.write(new TextDecoder().decode(pt));
} else if (cmd === 'put') {
  const data = JSON.parse(readFileSync(a, 'utf8'));
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = b || 'JP-' + [0, 1, 2].map(() => Array.from(c.getRandomValues(new Uint8Array(4)), x => A[x % A.length]).join('')).join('-');
  const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
  const ct = await c.subtle.encrypt({name:'AES-GCM', iv}, await keyFor(code, salt, 'encrypt'), enc.encode(JSON.stringify(data)));
  mkdirSync(join(repo, 'c'), {recursive:true});
  writeFileSync(join(repo, 'c', (await idFor(data.email)) + '.json'), JSON.stringify({v:1, s:hex(salt), i:hex(iv), d:Buffer.from(ct).toString('base64')}));
  console.error(`saved ${data.apps.length} apps, ${data.needs.length} needs` + (b ? '' : ` | NEW CODE: ${code}`));
} else if (cmd === 'stats') {
  // Interviews per 100 applications. Counts distinct companies, matching the member dashboard funnel.
  // Prints no names or emails, so the output is safe to paste anywhere.
  const args = process.argv.slice(3), li = args.indexOf('--log');
  const log = li >= 0 ? args.splice(li, 2)[1] : null;
  if (log && log.startsWith(repo)) { console.error('--log must point outside the repo'); process.exit(1); }
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const per100 = (n, d) => d ? (100 * n / d).toFixed(1) : '-';
  let A = 0, H = 0, I = 0, O = 0, W = 0;
  console.log('member\tapps\theard\tinterviews\toffers\thired\tinterviews/100 apps');
  args.forEach((f, i) => {
    const d = JSON.parse(readFileSync(f, 'utf8')), rs = d.results || [];
    const cos = k => new Set(rs.filter(k).map(r => norm(r.c))).size;
    const a = d.apps.length, h = cos(() => true), n = cos(r => ['interview', 'offer', 'hired'].includes(r.k)), o = cos(r => r.k === 'offer' || r.k === 'hired'), w = cos(r => r.k === 'hired');
    A += a; H += h; I += n; O += o; W += w;
    console.log(`#${i + 1} ${d.plan ? String(d.plan).split(/[ ·:(]/)[0] : ''}\t${a}\t${h}\t${n}\t${o}\t${w}\t${per100(n, a)}`);
  });
  console.log(`ALL (${args.length})\t${A}\t${H}\t${I}\t${O}\t${W}\t${per100(I, A)}`);
  if (A) console.log(`\nheard back per 100 apps: ${per100(H, A)} | offers per 100 interviews: ${per100(O, I)}`);
  if (A && A < 500) console.log('note: under 500 applications, this rate swings a lot. Read it as a direction, not a number.');
  if (log) appendFileSync(log, `${new Date().toISOString().slice(0, 10)}\tmembers=${args.length}\tapps=${A}\theard=${H}\tinterviews=${I}\toffers=${O}\thired=${W}\tper100=${per100(I, A)}\n`);
} else if (cmd === 'check' || cmd === 'add') {
  // Quality gate. An application only counts if the job is real, live, in the US and matches the member's titles, work type and area.
  const member = JSON.parse(readFileSync(a, 'utf8')), job = JSON.parse(readFileSync(b, 'utf8'));
  if (!member.prefs) { console.error('member has no prefs yet (work type, area, titles). Add them from their intake/profile form first.'); process.exit(2); }
  const res = await qualify(job, member.prefs, {live: !process.argv.includes('--no-live')});
  if (!res.ok) { console.log('SKIP: ' + res.reasons.join('; ')); process.exit(3); }
  if (cmd === 'check') { console.log('OK: counts toward the daily total'); process.exit(0); }
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const id = u => { try { const x = new URL(u); return x.hostname + x.pathname.replace(/\/$/, ''); } catch { return u; } };
  if (member.apps.some(x => (x.u && id(x.u) === id(job.u)) || (norm(x.c) === norm(job.c) && norm(x.r) === norm(job.r)))) { console.log('SKIP: already applied to this job'); process.exit(3); }
  const d = new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'America/Phoenix'});
  member.apps.push({d, c: job.c, r: job.r, ...(job.p ? {p: job.p} : {}), ...(job.t ? {t: job.t} : {}), u: job.u, ...(job.y ? {y: job.y} : {}), w: (job.work || '').toLowerCase()});
  writeFileSync(a, JSON.stringify(member, null, 1));
  console.log(`ADDED: ${member.apps.length} applications on file. Run "put" to publish the dashboard.`);
} else { console.error('usage: get <email> <code> | put <file.json> [code] | check|add <member.json> <job.json> [--no-live] | stats <file.json>... [--log file]'); process.exit(1); }
