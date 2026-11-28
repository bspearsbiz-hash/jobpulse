// Job Pulse quality check: an application only counts if the job passes every check here.
// Used by `node tools/portal.mjs check|add`. No member data lives in this file.
//
// Member preferences (in the member's dashboard JSON, key "prefs"):
//   {work:["remote","hybrid","onsite"], area:"Phoenix, AZ", miles:25 | "metro",
//    titles:["marketing coordinator","content writer"], avoid:["sales","insurance"], maxDays:60}
// Job to check (JSON):
//   {c:"Company", r:"Exact job title", u:"https://employer apply page", loc:"Remote (US)" | "Phoenix, AZ",
//    work:"remote"|"hybrid"|"onsite", miles?:12 (distance from the member's area, for hybrid/onsite),
//    pd?:"2026-11-20" (date posted), country?:"US"}

const STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const STATE_NAMES = /alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming/i;
const NON_US = /\b(canada|mexico|uk|united kingdom|england|ireland|germany|france|spain|portugal|netherlands|poland|india|philippines|brazil|argentina|colombia|australia|new zealand|singapore|japan|emea|apac|latam|europe)\b/i;
// Reposting sites and listing farms: not the real employer, so the application may never reach a recruiter.
const JUNK_HOSTS = /(^|\.)(jobgether\.com|virtualvocations\.com|nogigiddy\.com|skillerszone\.com|towardjobs\.com|jooble\.org|talent\.com|ziprecruiter\.com|lensa\.com|jobright\.ai|careerbuilder\.com|simplyhired\.com|adzuna\.com)$/i;
const CLOSED = /no longer (accepting|available|open)|position (has been )?filled|job (is )?(closed|expired)|posting (has )?(closed|expired)|this job is no longer|page (you're|you are) looking for (doesn't|does not) exist/i;
const STOP = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'i', 'ii', 'iii', 'jr', 'sr', 'junior', 'associate', 'entry', 'level', 'remote', '-', '&', '/']);

const words = t => String(t || '').toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
const normWork = w => { w = String(w || '').toLowerCase(); return /remote/.test(w) ? 'remote' : /hybrid/.test(w) ? 'hybrid' : /(on.?site|in.?person|office)/.test(w) ? 'onsite' : ''; };
const cityOf = s => String(s || '').toLowerCase().split(',')[0].replace(/[^a-z ]/g, '').trim();

export function titleMatches(title, targets) {
  const t = new Set(words(title));
  return (targets || []).some(target => { const w = words(target); return w.length && w.every(x => t.has(x)); });
}

function isUS(job) {
  if (job.country) return /^(us|usa|united states)$/i.test(String(job.country).trim());
  const loc = String(job.loc || '');
  if (NON_US.test(loc) && !/\b(us|usa|united states)\b/i.test(loc)) return false;
  if (/\b(us|usa|u\.s\.|united states)\b/i.test(loc) || STATE_NAMES.test(loc)) return true;
  const st = loc.match(/,\s*([A-Z]{2})\b/);
  return !!(st && STATES.includes(st[1]));
}

// Returns {ok, reasons:[...]} . `live` = whether to fetch the posting (set false to skip the network check).
export async function qualify(job, prefs = {}, {live = true, today = new Date()} = {}) {
  const why = [];
  let host = '';
  try { const u = new URL(job.u); if (u.protocol !== 'https:') why.push('link is not https'); host = u.hostname; } catch { why.push('no valid link to the posting'); }
  if (!job.c || !job.r) why.push('missing company or job title');
  if (host && JUNK_HOSTS.test(host)) why.push(`${host} is a reposting site, not the employer`);
  if (!isUS(job)) why.push('not a US job');

  const work = normWork(job.work || job.loc);
  const allowed = (prefs.work || []).map(normWork);
  if (!work) why.push('work type unknown (remote, hybrid or in person?)');
  else if (allowed.length && !allowed.includes(work)) why.push(`${work} job, member wants ${allowed.join('/')}`);
  if (work === 'hybrid' || work === 'onsite') {
    if (!prefs.area) why.push('member has no city on file for hybrid/in-person jobs');
    else if (prefs.miles === 'metro') { if (job.miles == null && cityOf(job.loc) !== cityOf(prefs.area)) why.push('distance unknown: add miles from the member\'s area'); }
    else if (job.miles == null) { if (cityOf(job.loc) !== cityOf(prefs.area)) why.push('distance unknown: add miles from the member\'s area'); }
    else if (+job.miles > +(prefs.miles || 0)) why.push(`${job.miles} miles away, member's limit is ${prefs.miles}`);
  }

  if (prefs.titles && prefs.titles.length && !titleMatches(job.r, prefs.titles)) why.push('title does not match the member\'s target roles');
  const bad = (prefs.avoid || []).find(a => new RegExp('\\b' + a.replace(/[^a-z0-9 ]/gi, '') + '\\b', 'i').test(job.r + ' ' + (job.c || '')));
  if (bad) why.push(`member does not want "${bad}" roles`);

  if (job.pd) {
    const age = (today - new Date(job.pd)) / 864e5;
    if (isNaN(age)) why.push('posted date unreadable');
    else if (age > (prefs.maxDays || 60)) why.push(`posted ${Math.round(age)} days ago`);
  }

  if (live && !why.some(w => /link/.test(w))) {
    try {
      const r = await fetch(job.u, {redirect: 'follow', headers: {'User-Agent': 'Mozilla/5.0 (job posting check)'}, signal: AbortSignal.timeout(15000)});
      if (!r.ok) why.push(`posting returned HTTP ${r.status}`);
      else if (CLOSED.test((await r.text()).slice(0, 400000))) why.push('posting says it is closed or filled');
    } catch { why.push('posting did not load'); }
  }
  return {ok: why.length === 0, reasons: why};
}
