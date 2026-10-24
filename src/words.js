/* Lingua: your word list (one note, grouped by capitulum) and the review schedule. */

// One word per line:  - ancilla :: fēmina quae servit | ex: Iūlia nōn est ancilla. | kind: n1 | due: 2026-10-24 | ivl: 0 | ease: 2.5
const LW_LINE = /^\s*[-*]\s+(.+?)\s+::\s*(.*)$/;
const LW_KEYS = ['ex', 'kind', 'due', 'ivl', 'ease', 'added'];

function lwParse(text) {
  const out = []; let cap = 1;
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const h = raw.match(/^#{1,6}\s+Capitulum\s+([IVXLC]+)\b/i);
    if (h) { cap = laFromRoman(h[1]) || cap; continue; }
    const m = raw.match(LW_LINE); if (!m) continue;
    const parts = m[2].split(/\s+\|\s+/), w = { word: laNFC(m[1].replace(/\*\*/g, '').trim()), meaning: laNFC(parts.shift() || '').trim(), cap };
    for (const p of parts) { const k = p.match(/^(\w+):\s*(.*)$/); if (k && LW_KEYS.includes(k[1])) w[k[1]] = laNFC(k[2].trim()); }
    w.kind = LA_KINDS[w.kind] ? w.kind : laGuess(w.word);
    w.ivl = Number(w.ivl) || 0; w.ease = Number(w.ease) || 2.5;
    if (!/^\d{4}-\d\d-\d\d$/.test(w.due || '')) w.due = '';
    out.push(w);
  }
  return out;
}
const lwClean = s => String(s || '').replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ').trim();
function lwLine(w) {
  const f = [lwClean(w.meaning) || '…'];
  if (w.ex) f.push('ex: ' + lwClean(w.ex));
  f.push('kind: ' + w.kind);
  if (w.due) f.push('due: ' + w.due);
  if (w.ivl) f.push('ivl: ' + w.ivl);
  if (w.ease && w.ease !== 2.5) f.push('ease: ' + w.ease);
  if (w.added) f.push('added: ' + w.added);
  return `- ${lwClean(w.word).replace(/::/g, ':')} :: ${f.join(' | ')}`;
}
function lwWrite(words) {
  const caps = [...new Set(words.map(w => w.cap))].sort((a, b) => a - b);
  let t = '# Latin words\n\nLingua keeps this list. Edit the meanings and examples as you like: keep each word on one line, with “ :: ” after the word. Lines that aren’t words are tidied away when Lingua saves.\n';
  for (const c of caps) {
    t += `\n## Capitulum ${laRoman(c)}\n\n`;
    t += words.filter(w => w.cap === c).map(lwLine).join('\n') + '\n';
  }
  return t;
}
const lwKey = d => window.moment(d).format('YYYY-MM-DD');
const lwToday = () => lwKey(new Date());
function lwDue(words, today) { const t = today || lwToday(); return words.filter(w => !w.due || w.due <= t); }

// ratings: 0 again, 1 hard, 2 good, 3 easy (a simple SM-2): returns the new { ivl, ease, due }
function lwNext(w, r, today) {
  let ivl = w.ivl || 0, ease = w.ease || 2.5;
  if (r === 0) { ivl = 0; ease = Math.max(1.3, ease - 0.2); }
  else if (r === 1) { ivl = Math.max(1, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - 0.15); }
  else if (r === 2) { ivl = ivl < 1 ? 1 : ivl < 3 ? 3 : Math.round(ivl * ease); }
  else { ivl = ivl < 1 ? 3 : Math.round(Math.max(ivl, 2) * ease * 1.3); ease += 0.15; }
  ivl = Math.min(ivl, 365);
  const d = window.moment(today || lwToday(), 'YYYY-MM-DD').add(ivl, 'days');
  return { ivl, ease: Math.round(ease * 100) / 100, due: d.format('YYYY-MM-DD') };
}
const lwWhen = ivl => ivl < 1 ? 'in a minute' : ivl === 1 ? 'tomorrow' : ivl < 30 ? ivl + ' days' : ivl < 60 ? 'a month' : Math.round(ivl / 30) + ' months';
