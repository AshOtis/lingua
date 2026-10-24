/* Lingua: the Latin. Noun and verb forms, what each capitulum of Familia Romana has taught so far,
 * and checking answers. Only the patterns live here: no text from the book. */

const LA_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
  'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV'];
const laRoman = n => LA_ROMAN[n] || String(n);
const laFromRoman = s => { const i = LA_ROMAN.indexOf(String(s || '').trim().toUpperCase()); return i > 0 ? i : 0; };

// the order the forms are shown in (the book's own order: nominative, accusative, genitive, dative, ablative, vocative)
const LA_CASES = ['nom', 'acc', 'gen', 'dat', 'abl', 'voc'];
const LA_CASE_LABEL = { nom: 'Nōm.', acc: 'Acc.', gen: 'Gen.', dat: 'Dat.', abl: 'Abl.', voc: 'Voc.' };
const LA_CASE_NAME = { nom: 'nōminātīvus', acc: 'accūsātīvus', gen: 'genetīvus', dat: 'datīvus', abl: 'ablātīvus', voc: 'vocātīvus' };
const LA_VERB_ROWS = [
  ['3sg', 'is/ea (3rd sg.)'], ['3pl', 'eī/eae (3rd pl.)'], ['1sg', 'ego (1st sg.)'], ['2sg', 'tū (2nd sg.)'], ['1pl', 'nōs (1st pl.)'], ['2pl', 'vōs (2nd pl.)'],
  ['imp.sg', 'imperātīvus sg.'], ['imp.pl', 'imperātīvus pl.'], ['pass.3sg', 'passīvum 3rd sg.'], ['pass.3pl', 'passīvum 3rd pl.'], ['inf', 'īnfīnītīvus']
];

// what each capitulum adds (cumulative). I–VII follow the book closely; later chapters are approximate:
// change the capitulum in the side panel or settings if a form turns up before you've met it.
const LA_UNLOCK = [
  [1, ['nom.sg', 'nom.pl']],
  [2, ['gen.sg', 'gen.pl']],
  [3, ['acc.sg', '3sg']],
  [4, ['voc.sg', 'imp.sg']],
  [5, ['acc.pl', 'abl.sg', 'abl.pl', '3pl', 'imp.pl']],
  [6, ['pass.3sg', 'pass.3pl']],
  [7, ['dat.sg', 'dat.pl']],
  [9, ['n3']],
  [10, ['inf']],
  [15, ['1sg', '2sg', '1pl', '2pl']]
];
function laUnlocked(cap) { const s = new Set(); for (const [c, l] of LA_UNLOCK) if (c <= cap) l.forEach(x => s.add(x)); return s; }
// what's new in this capitulum, in plain words (for the panel)
const LA_NEW_LABEL = { 'nom.sg': 'nominative', 'gen.sg': 'genitive', 'acc.sg': 'accusative singular', '3sg': 'verbs: -at, -et, -it', 'voc.sg': 'vocative', 'imp.sg': 'imperative', 'acc.pl': 'accusative plural', 'abl.sg': 'ablative', '3pl': 'verbs: -ant, -ent, -unt', 'pass.3sg': 'passive -tur, -ntur', 'dat.sg': 'dative', n3: '3rd declension', inf: 'infinitive', '1sg': 'I / you / we forms' };
function laNewIn(cap) { const e = LA_UNLOCK.find(([c]) => c === cap); return e ? [...new Set(e[1].map(k => LA_NEW_LABEL[k]).filter(Boolean))] : []; }

const LA_KINDS = {
  n1: 'Noun, 1st: -a, -ae', n2us: 'Noun, 2nd: -us, -ī', n2um: 'Noun, 2nd neuter: -um, -ī', n2er: 'Noun, 2nd: -er, -(e)rī',
  n3: 'Noun, 3rd: -is', n3i: 'Noun, 3rd: -is, gen. pl. -ium', adj: 'Adjective: -us, -a, -um',
  v1: 'Verb: -at, -āre', v2: 'Verb: -et, -ēre', v3: 'Verb: -it, -ere', v3io: 'Verb: -it, -iunt (like capit)', v4: 'Verb: -it, -īre (like audit)', other: 'Other (no drills)'
};
const LA_NOUN = new Set(['n1', 'n2us', 'n2um', 'n2er', 'n3', 'n3i']);
const LA_VERB = new Set(['v1', 'v2', 'v3', 'v3io', 'v4']);

const laNFC = s => String(s || '').normalize('NFC');
const laPlain = s => laNFC(s).normalize('NFD').replace(/̄/g, '').normalize('NFC');
// for comparing answers: lower case, no punctuation, macrons kept or not
function laNorm(s, macrons) { const t = laNFC(s).toLowerCase().replace(/[.,;:!?"“”'‘’()«»\-–—]/g, '').replace(/\s+/g, ' ').trim(); return macrons ? t : laPlain(t); }
function laSame(answer, correct, macrons) { return !!correct && laNorm(answer, macrons) === laNorm(correct, macrons); }

// "pater, patris m." → { lemma: 'pater', gen: 'patris', g: 'm' }
function laParse(text) {
  const t = laNFC(text).trim(), g = (t.match(/(?:^|[\s,])([mfn])\.?\s*$/) || [])[1] || '';
  const parts = t.replace(/(?:^|[\s,])[mfn]\.?\s*$/, '').split(',').map(x => x.trim()).filter(Boolean);
  return { lemma: parts[0] || '', gen: parts[1] || '', g };
}
// a first guess at the kind of word, from how it's written
function laGuess(text) {
  const { lemma, gen } = laParse(text), w = laPlain(lemma).toLowerCase(), gp = laPlain(gen).toLowerCase();
  if (!w || /\s/.test(w)) return 'other';
  if (['est', 'sunt', 'et', 'in', 'non', 'sed', 'quod', 'cum', 'sine', 'ab', 'ex', 'ad', 'per', 'et', 'ubi', 'num', 'nonne'].includes(w)) return 'other';
  if (gp) {
    if (/ae$/.test(gp)) return 'n1';
    if (/i$/.test(gp)) return /um$/.test(w) ? 'n2um' : /us$/.test(w) ? 'n2us' : 'n2er';
    if (/is$/.test(gp)) return 'n3';
    return 'other';
  }
  if (/a$/.test(w)) return 'n1';
  if (/us$/.test(w)) return 'n2us';
  if (/um$/.test(w)) return 'n2um';
  if (/er$/.test(w)) return 'n2er';
  if (/at$/.test(w)) return 'v1';
  if (/et$/.test(w)) return 'v2';
  if (/it$/.test(w)) return 'v3';
  return 'other';
}
function laGender(kind, g) { return kind === 'n1' ? 'f' : kind === 'n2um' ? 'n' : (kind === 'n2us' || kind === 'n2er') ? 'm' : (g || 'm'); }

// every form of a word: { stem, forms: { 'nom.sg': 'ancilla', ..., '3sg': 'vocat', ... } }, or null
function laForms(word, kind) {
  const p = laParse(word), w = p.lemma, cut = (s, n) => s.slice(0, s.length - n), ends = (s, e) => laPlain(s).toLowerCase().endsWith(e);
  const decl = (stem, sg, pl) => { const f = {}; LA_CASES.forEach((c, i) => { if (sg[i] != null) f[c + '.sg'] = sg[i]; if (pl[i] != null) f[c + '.pl'] = pl[i]; }); return { stem, forms: f }; };
  const S = (stem, list) => list.map(e => e == null ? null : stem + e);
  // order in these lists: nom, acc, gen, dat, abl, voc
  if (kind === 'n1' && ends(w, 'a')) { const s = cut(w, 1); return decl(s, S(s, ['a', 'am', 'ae', 'ae', 'ā', 'a']), S(s, ['ae', 'ās', 'ārum', 'īs', 'īs', null])); }
  if (kind === 'n2us' && ends(w, 'us')) {
    const s = cut(w, 2), voc = laPlain(s).toLowerCase().endsWith('i') ? cut(s, 1) + 'ī' : s + 'e';   // fīlius → fīlī
    return decl(s, [w, s + 'um', s + 'ī', s + 'ō', s + 'ō', voc], S(s, ['ī', 'ōs', 'ōrum', 'īs', 'īs', null]));
  }
  if (kind === 'n2um' && ends(w, 'um')) { const s = cut(w, 2); return decl(s, S(s, ['um', 'um', 'ī', 'ō', 'ō', 'um']), S(s, ['a', 'a', 'ōrum', 'īs', 'īs', null])); }
  if (kind === 'n2er') {
    const s = p.gen && ends(p.gen, 'i') ? cut(p.gen, 1) : w;
    return decl(s, [w, s + 'um', s + 'ī', s + 'ō', s + 'ō', w], S(s, ['ī', 'ōs', 'ōrum', 'īs', 'īs', null]));
  }
  if ((kind === 'n3' || kind === 'n3i') && p.gen && ends(p.gen, 'is')) {
    const s = cut(p.gen, 2), neut = p.g === 'n', i = kind === 'n3i';
    return decl(s, [w, neut ? w : s + 'em', s + 'is', s + 'ī', s + 'e', w], S(s, [neut ? (i ? 'ia' : 'a') : 'ēs', neut ? (i ? 'ia' : 'a') : 'ēs', i ? 'ium' : 'um', 'ibus', 'ibus', null]));
  }
  if (kind === 'adj' && ends(w, 'us')) {           // the three genders together (used for sentences, not tables)
    const s = cut(w, 2), f = {};
    for (const [k, v] of Object.entries(laForms(w, 'n2us').forms)) f['m.' + k] = v;
    for (const [k, v] of Object.entries(laForms(s + 'a', 'n1').forms)) f['f.' + k] = v;
    for (const [k, v] of Object.entries(laForms(s + 'um', 'n2um').forms)) f['n.' + k] = v;
    return { stem: s, forms: f };
  }
  if (LA_VERB.has(kind)) {
    const e = kind === 'v1' ? 'at' : kind === 'v2' ? 'et' : 'it';
    if (!ends(w, e)) return null;
    const b = cut(w, 2);
    const T = {
      v1: ['at', 'ant', 'ō', 'ās', 'āmus', 'ātis', 'ā', 'āte', 'ātur', 'antur', 'āre'],
      v2: ['et', 'ent', 'eō', 'ēs', 'ēmus', 'ētis', 'ē', 'ēte', 'ētur', 'entur', 'ēre'],
      v3: ['it', 'unt', 'ō', 'is', 'imus', 'itis', 'e', 'ite', 'itur', 'untur', 'ere'],
      v3io: ['it', 'iunt', 'iō', 'is', 'imus', 'itis', 'e', 'ite', 'itur', 'iuntur', 'ere'],
      v4: ['it', 'iunt', 'iō', 'īs', 'īmus', 'ītis', 'ī', 'īte', 'ītur', 'iuntur', 'īre']
    }[kind];
    const f = {}; LA_VERB_ROWS.forEach(([k], i) => { f[k] = b + T[i]; });
    f['3sg'] = w;
    const short = { dūcit: 'dūc', dicit: 'dīc', dīcit: 'dīc', ducit: 'dūc', facit: 'fac' }[laNFC(w).toLowerCase()];
    if (short) f['imp.sg'] = short;
    return { stem: b, forms: f };
  }
  return null;
}

// what to ask in a table drill for this capitulum: [{ key, label, answer }]; the first form is given
function laTable(word, kind, cap) {
  const fx = laForms(word, kind); if (!fx) return null;
  const open = laUnlocked(cap);
  if (LA_NOUN.has(kind)) {
    if ((kind === 'n3' || kind === 'n3i') && !open.has('n3')) return null;
    const rows = LA_CASES.map(c => ({ c, sg: open.has(c + '.sg') ? fx.forms[c + '.sg'] : null, pl: open.has(c + '.pl') ? fx.forms[c + '.pl'] : null }))
      .filter(r => r.sg || r.pl);
    return { type: 'noun', rows, given: 'nom.sg' };
  }
  if (LA_VERB.has(kind)) {
    const rows = LA_VERB_ROWS.filter(([k]) => open.has(k) && fx.forms[k]).map(([k, label]) => ({ k, label, form: fx.forms[k] }));
    return rows.length ? { type: 'verb', rows, given: '3sg' } : null;
  }
  return null;
}

// an example sentence with this word's ending taken out: { before, stem, ending, after } or null
function laBlank(word, kind, sentence) {
  const fx = laForms(word, kind); if (!fx || !sentence) return null;
  const stemN = laNorm(fx.stem, false); if (stemN.length < 2) return null;
  const all = new Set(Object.values(fx.forms).map(f => laNorm(f, false)));
  const bits = laNFC(sentence).split(/([\s.,;:!?"“”()«»]+)/);
  for (let i = 0; i < bits.length; i++) {
    const t = bits[i], n = laNorm(t, false);
    if (!n || !all.has(n) || !n.startsWith(stemN) || n.length === stemN.length) continue;
    const cut = [...laNFC(t)].length - (n.length - stemN.length);
    const chars = [...laNFC(t)];
    return { before: bits.slice(0, i).join(''), stem: chars.slice(0, cut).join(''), ending: chars.slice(cut).join(''), after: bits.slice(i + 1).join('') };
  }
  return null;
}

// typing long vowels: Alt + a e i o u (Alt+Shift for capitals)
const LA_MACRON = { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū', y: 'ȳ', A: 'Ā', E: 'Ē', I: 'Ī', O: 'Ō', U: 'Ū', Y: 'Ȳ' };
function laInsert(input, ch) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
  input.value = input.value.slice(0, s) + ch + input.value.slice(e);
  input.selectionStart = input.selectionEnd = s + ch.length;
  input.dispatchEvent(new Event('input'));
}
function laMacronKeys(input) {
  input.addEventListener('keydown', ev => {
    if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const k = ev.code && /^Key[AEIOUY]$/.test(ev.code) ? ev.code.slice(3) : '';
    if (!k) return;
    ev.preventDefault(); laInsert(input, LA_MACRON[ev.shiftKey ? k : k.toLowerCase()]);
  });
}

// the optional line of the day (advanced): short, well-known public-domain lines, with a plain translation
const LA_LINES = [
  ['Nūlla diēs sine līneā.', 'proverb, after Pliny', 'No day without a line.'],
  ['Repetītiō est māter studiōrum.', 'proverb', 'Repetition is the mother of learning.'],
  ['Carpe diem, quam minimum crēdula posterō.', 'Horace, Odes 1.11', 'Seize the day, trusting as little as you can in tomorrow.'],
  ['Dum loquimur, fūgerit invida aetās.', 'Horace, Odes 1.11', 'While we talk, jealous time will have run away.'],
  ['Dīmidium factī quī coepit habet: sapere audē.', 'Horace, Epistles 1.2', 'Who has begun has half done: dare to be wise.'],
  ['Omnia mūtantur, nihil interit.', 'Ovid, Metamorphoses 15', 'Everything changes, nothing dies.'],
  ['Gutta cavat lapidem.', 'after Ovid', 'Dripping water hollows out stone.'],
  ['Fēstīnā lentē.', 'Augustus, in Suetonius', 'Hurry slowly.'],
  ['Vēnī, vīdī, vīcī.', 'Julius Caesar', 'I came, I saw, I conquered.'],
  ['Ālea iacta est.', 'Julius Caesar, in Suetonius', 'The die is cast.'],
  ['Labor omnia vīcit improbus.', 'Virgil, Georgics 1', 'Relentless work conquered everything.'],
  ['Omnia vincit Amor.', 'Virgil, Eclogues 10', 'Love conquers all.'],
  ['Sīc itur ad astra.', 'Virgil, Aeneid 9', 'This is the way to the stars.'],
  ['Fortēs fortūna adiuvat.', 'Terence, Phormio', 'Fortune helps the brave.'],
  ['Hominēs, dum docent, discunt.', 'Seneca, Letters 7', 'People learn while they teach.'],
  ['Ōtium sine litterīs mors est.', 'Seneca, Letters 82', 'Leisure without books is death.'],
  ['Mēns sāna in corpore sānō.', 'Juvenal, Satires 10', 'A healthy mind in a healthy body.'],
  ['Per aspera ad astra.', 'proverb', 'Through hard things to the stars.'],
  ['Ex nihilō nihil fit.', 'proverb, after Lucretius', 'Nothing comes from nothing.'],
  ['Mors certa, hōra incerta.', 'proverb', 'Death is certain, its hour uncertain.'],
  ['Barba nōn facit philosophum.', 'proverb', 'A beard doesn’t make a philosopher.'],
  ['Cōgitō, ergō sum.', 'Descartes', 'I think, therefore I am.'],
  ['Dum spīrō, spērō.', 'proverb', 'While I breathe, I hope.'],
  ['Errāre hūmānum est.', 'proverb', 'To err is human.'],
  ['Lūx in tenebrīs lūcet.', 'after John 1:5 (Vulgate)', 'The light shines in the darkness.'],
  ['Ars longa, vīta brevis.', 'after Hippocrates', 'Skill takes long, life is short.']
];
