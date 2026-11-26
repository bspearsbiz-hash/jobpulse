// Job Pulse member portal data tool. Only encrypted files are ever committed.
// Read a client's current data:   node tools/portal.mjs get <email> <ACCESS-CODE> > /tmp/client.json
// Save updated data (re-encrypt): node tools/portal.mjs put /tmp/client.json <ACCESS-CODE>
// New client (makes a code):      node tools/portal.mjs put /tmp/client.json
// Interview rate across members:   node tools/portal.mjs stats /tmp/a.json /tmp/b.json [--log ~/jobpulse-stats.tsv]
//   (reads the plaintext files in /tmp; --log appends a dated line to a file OUTSIDE the repo)
// Data shape: {email, first, plan, since, updated, focus, profile?:true (set once their application profile form arrives; until then the dashboard shows a 'fill out your profile' need),
//   apps:[{d:"Nov 20", c:"Company", r:"Role", t?:"Contract|Part-time", p?:"$70K", u?:"https://posting"}],  (oldest first)
//   needs:[{k:"short ask", w:"why / what it unlocks", u?:"https://link"}],
//   results?:[{c:"Company", r?:"Role", k:"reply|interview|offer|no", w?:"when", n?:"note"}]}  (one per employer reply; log every one)
// Never commit the plaintext JSON or the access code.
import {readFileSync, writeFileSync, mkdirSync, appendFileSync} from 'fs';
import {webcrypto as c} from 'crypto';
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
  let A = 0, H = 0, I = 0, O = 0;
  console.log('member\tapps\theard\tinterviews\toffers\tinterviews/100 apps');
  args.forEach((f, i) => {
    const d = JSON.parse(readFileSync(f, 'utf8')), rs = d.results || [];
    const cos = k => new Set(rs.filter(k).map(r => norm(r.c))).size;
    const a = d.apps.length, h = cos(() => true), n = cos(r => r.k === 'interview' || r.k === 'offer'), o = cos(r => r.k === 'offer');
    A += a; H += h; I += n; O += o;
    console.log(`#${i + 1} ${d.plan ? String(d.plan).split(/[ ·:(]/)[0] : ''}\t${a}\t${h}\t${n}\t${o}\t${per100(n, a)}`);
  });
  console.log(`ALL (${args.length})\t${A}\t${H}\t${I}\t${O}\t${per100(I, A)}`);
  if (A) console.log(`\nheard back per 100 apps: ${per100(H, A)} | offers per 100 interviews: ${per100(O, I)}`);
  if (A && A < 500) console.log('note: under 500 applications, this rate swings a lot. Read it as a direction, not a number.');
  if (log) appendFileSync(log, `${new Date().toISOString().slice(0, 10)}\tmembers=${args.length}\tapps=${A}\theard=${H}\tinterviews=${I}\toffers=${O}\tper100=${per100(I, A)}\n`);
} else { console.error('usage: get <email> <code> | put <file.json> [code] | stats <file.json>... [--log file]'); process.exit(1); }
