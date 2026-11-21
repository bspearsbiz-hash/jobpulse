// Job Pulse member portal data tool. Only encrypted files are ever committed.
// Read a client's current data:   node tools/portal.mjs get <email> <ACCESS-CODE> > /tmp/client.json
// Save updated data (re-encrypt): node tools/portal.mjs put /tmp/client.json <ACCESS-CODE>
// New client (makes a code):      node tools/portal.mjs put /tmp/client.json
// Data shape: {email, first, plan, since, updated, focus,
//   apps:[{d:"Nov 20", c:"Company", r:"Role", t?:"Contract|Part-time", p?:"$70K", u?:"https://posting"}],  (oldest first)
//   needs:[{k:"short ask", w:"why / what it unlocks", u?:"https://link"}]}
// Never commit the plaintext JSON or the access code.
import {readFileSync, writeFileSync, mkdirSync} from 'fs';
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
} else { console.error('usage: get <email> <code> | put <file.json> [code]'); process.exit(1); }
