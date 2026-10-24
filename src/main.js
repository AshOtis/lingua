/* Lingua: a companion for reading Lingua Latina per se illustrata.
 * Catch words as you read (they go into today's note and your word list), review them on a spaced
 * schedule, and drill the endings the chapter you're on has taught. Everything is plain Markdown. */

const LG_VIEW = 'lingua-view';
const LG_SET = {
  chapter: 1, heading: 'Latin', wordsFile: 'Lingua/Latin words.md', pensaFolder: 'Lingua/Pensa',
  macrons: false, log: true, lineOfDay: false,
  useCore: true, folder: '', format: 'YYYY-MM-DD', template: '', tab: 'review', drill: 'forms'
};
const lgShuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Lingua extends Plugin {
  async onload() {
    const d = (await this.loadData()) || {};
    this.set = Object.assign({}, LG_SET, d.set || {});
    this.d = { days: d.days || {} };
    this.words = []; this.wordsText = null;
    this.registerView(LG_VIEW, leaf => new LGView(leaf, this));
    this.addRibbonIcon('languages', 'Open Lingua', () => this.activate());
    this.addCommand({ id: 'open', name: 'Open the side panel', callback: () => this.activate() });
    this.addCommand({ id: 'add-word', name: 'Add a word', callback: () => this.addWordModal() });
    this.addCommand({ id: 'review', name: 'Review words', callback: () => this.activate('review') });
    this.addCommand({ id: 'drill', name: 'Drill endings', callback: () => this.activate('drill') });
    this.addCommand({ id: 'pensa', name: 'Open the Pensa note for this capitulum', callback: () => this.openPensa() });
    this.addCommand({ id: 'word-list', name: 'Open the word list', callback: () => this.openWordList() });
    this.addSettingTab(new LGSettings(this.app, this));
    this.app.workspace.onLayoutReady(() => this.loadWords());
    this.registerEvent(this.app.vault.on('modify', f => {
      if (f.path === this.set.wordsFile) { window.clearTimeout(this.wordsT); this.wordsT = window.setTimeout(() => this.loadWords(), 600); return; }
      if (lgDateOf(this.cfg(), f.path)) for (const v of this.views()) v.feedChanged();
    }));
  }
  onunload() { if (this.wordsDirty) this.flushWords(); }
  views() { return this.app.workspace.getLeavesOfType(LG_VIEW).map(l => l.view).filter(v => v instanceof LGView); }
  refresh() { for (const v of this.views()) v.render(); }
  async activate(tab) {
    if (tab) { this.set.tab = tab; this.saveSoon(); }
    let leaf = this.app.workspace.getLeavesOfType(LG_VIEW)[0];
    if (!leaf) { leaf = this.app.workspace.getRightLeaf(false); await leaf.setViewState({ type: LG_VIEW, active: true }); }
    this.app.workspace.revealLeaf(leaf);
    if (tab && leaf.view instanceof LGView) leaf.view.render();
  }
  saveSoon() { window.clearTimeout(this.saveT); this.saveT = window.setTimeout(() => this.saveData({ set: this.set, days: this.d.days }), 400); }

  /* ---------- days: what you did, for the streak ---------- */
  today() { return lwToday(); }
  mark(kind, n) { const k = this.today(), r = this.d.days[k] || (this.d.days[k] = {}); r[kind] = (r[kind] || 0) + (n || 1); this.saveSoon(); }
  streak() {
    const has = k => { const r = this.d.days[k]; return !!r && Object.values(r).some(x => x > 0); };
    const m = window.moment(); if (!has(m.format('YYYY-MM-DD'))) m.subtract(1, 'day');
    let n = 0; while (has(m.format('YYYY-MM-DD')) && n < 10000) { n++; m.subtract(1, 'day'); }
    return n;
  }

  /* ---------- the word list note ---------- */
  async loadWords() {
    const f = this.app.vault.getAbstractFileByPath(this.set.wordsFile);
    const text = f ? await this.app.vault.read(f) : '';
    if (text === this.wordsText) return;
    this.wordsText = text; this.words = lwParse(text);
    for (const v of this.views()) v.wordsChanged();
  }
  saveWords() { this.wordsDirty = true; window.clearTimeout(this.wordsSaveT); this.wordsSaveT = window.setTimeout(() => this.flushWords(), 500); }
  async flushWords() {
    this.wordsDirty = false;
    const text = lwWrite(this.words), path = this.set.wordsFile;
    this.wordsText = text;
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f) await this.app.vault.modify(f, text);
    else { await this.ensureFolder(path); await this.app.vault.create(path, text); }
  }
  async ensureFolder(path) {
    const dir = path.split('/').slice(0, -1).join('/');
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) { try { await this.app.vault.createFolder(dir); } catch (e) { /* made meanwhile */ } }
  }
  find(word) { const k = laNorm(laParse(word).lemma, false); return this.words.find(w => laNorm(laParse(w.word).lemma, false) === k); }
  async addWord(e) {
    const have = this.find(e.word), t = this.today();
    let res;
    if (have) {
      if (e.meaning) have.meaning = e.meaning;
      if (e.ex) have.ex = e.ex;
      if (e.kind) have.kind = e.kind;
      if (e.word.length > have.word.length) have.word = e.word;      // e.g. "puer, puerī" after "puer"
      res = 'updated';
    } else {
      this.words.push({ word: e.word, meaning: e.meaning, ex: e.ex, kind: e.kind || laGuess(e.word), cap: e.cap || this.set.chapter, due: t, ivl: 0, ease: 2.5, added: t });
      res = 'new';
    }
    this.saveWords(); this.mark('w');
    const line = `- **${lwClean(e.word)}**${e.meaning ? ' — ' + lwClean(e.meaning) : ''}${e.ex ? ' · *' + lwClean(e.ex) + '*' : ''}`;
    await this.logToday([line], true);
    for (const v of this.views()) v.wordsChanged();
    return res;
  }

  /* ---------- today's note ---------- */
  cfg() { return lgConfig(this.app, this.set); }
  async todayFile() {
    const cfg = this.cfg(), path = lgPath(cfg, new Date());
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f) return f;
    await this.ensureFolder(path);
    let text = '';
    if (cfg.template) {
      const tf = this.app.metadataCache.getFirstLinkpathDest(cfg.template, '') || this.app.vault.getAbstractFileByPath(cfg.template.replace(/\.md$/, '') + '.md');
      if (tf) {
        const m = window.moment();
        text = (await this.app.vault.read(tf))
          .replace(/{{\s*date\s*:\s*([^}]+?)\s*}}/g, (x, fmt) => m.format(fmt)).replace(/{{\s*date\s*}}/g, m.format(cfg.format))
          .replace(/{{\s*time\s*}}/g, m.format('HH:mm')).replace(/{{\s*title\s*}}/g, m.format(cfg.format));
      }
    }
    return this.app.vault.create(path, text);
  }
  // words always go in; review and drill results only if "Log in the daily note" is on
  async logToday(lines, always) {
    if (!always && !this.set.log) return;
    try { const f = await this.todayFile(); await this.app.vault.process(f, t => lgAppend(t, this.set.heading, lines)); }
    catch (e) { new Notice('Lingua couldn’t write to today’s note: ' + (e.message || e)); }
  }

  /* ---------- notes to open ---------- */
  async openNote(path, make) {
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!f && make) { await this.ensureFolder(path); f = await this.app.vault.create(path, make()); }
    if (f) await this.app.workspace.getLeaf('tab').openFile(f);
  }
  openWordList() { return this.openNote(this.set.wordsFile, () => lwWrite(this.words)); }
  openPensa(cap) {
    const c = cap || this.set.chapter, r = laRoman(c);
    return this.openNote(`${this.set.pensaFolder}/Capitulum ${r}.md`, () =>
      `# Pensa · Capitulum ${r}\n\nYour answers to the Pensa for capitulum ${r} of Familia Romana. Work from the book and write them here.\n\n## Pensum A\n\n\n## Pensum B\n\n\n## Pensum C\n\n\n## Notes\n\n`);
  }
  addWordModal(prefill) { new LGAddModal(this.app, this, prefill).open(); }
}

/* ---------- the side panel ---------- */
class LGView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.session = null; this.drill = null; this.feedN = 14; }
  getViewType() { return LG_VIEW; }
  getDisplayText() { return 'Lingua'; }
  getIcon() { return 'languages'; }
  async onOpen() {
    this.containerEl.tabIndex = -1;
    this.registerDomEvent(this.containerEl, 'keydown', ev => this.keys(ev));
    this.render();
  }
  async onClose() { window.clearTimeout(this.feedT); }
  wordsChanged() { if (!this.session) this.render(); else this.paintHead(); }
  feedChanged() { if (this.plugin.set.tab !== 'feed') return; window.clearTimeout(this.feedT); this.feedT = window.setTimeout(() => this.paintBody(), 1000); }

  render() {
    const el = this.contentEl; el.empty(); el.addClass('lg-view');
    this.headEl = el.createDiv('lg-head');
    this.tabsEl = el.createDiv('lg-tabs');
    this.bodyEl = el.createDiv('lg-body');
    this.paintHead(); this.paintTabs(); this.paintBody();
  }
  paintHead() {
    const p = this.plugin, s = p.set, h = this.headEl; if (!h) return; h.empty();
    const top = h.createDiv('lg-top');
    const t = top.createDiv('lg-title'); t.createEl('b', { text: 'Lingua' }); t.createSpan({ cls: 'lg-sub', text: 'Familia Rōmāna' });
    const sel = top.createEl('select', { cls: 'dropdown lg-cap', attr: { 'aria-label': 'Capitulum' } });
    for (let i = 1; i <= 35; i++) { const o = sel.createEl('option', { text: 'Cap. ' + laRoman(i) }); o.value = String(i); }
    sel.value = String(s.chapter);
    sel.onchange = () => { s.chapter = Number(sel.value); p.saveSoon(); this.drill = null; this.render(); };
    const nw = laNewIn(s.chapter);
    if (nw.length) h.createDiv({ cls: 'lg-new', text: `New in ${laRoman(s.chapter)}: ${nw.join(', ')}` });
    const due = lwDue(p.words).length, st = h.createDiv('lg-stats');
    const stat = (n, l) => { const b = st.createDiv('lg-stat'); b.createEl('b', { text: String(n) }); b.createSpan({ text: l }); };
    stat(p.streak(), 'day streak'); stat(p.words.length, p.words.length === 1 ? 'word' : 'words'); stat(due, 'due');
    const acts = h.createDiv('lg-acts');
    const btn = (text, icon, fn, cta) => { const b = acts.createEl('button', { cls: cta ? 'mod-cta' : '', text }); if (icon) { const i = b.createSpan('lg-ic'); setIcon(i, icon); b.prepend(i); } b.onclick = fn; return b; };
    btn('Add a word', 'plus', () => p.addWordModal(), true);
    btn('Pensa ' + laRoman(s.chapter), 'pencil', () => p.openPensa());
    btn('Word list', 'list', () => p.openWordList());
    if (s.lineOfDay) this.paintLine(h);
  }
  paintLine(h) {
    const doy = window.moment().dayOfYear(), [la, who, en] = LA_LINES[doy % LA_LINES.length];
    const box = h.createDiv('lg-line');
    box.createDiv({ cls: 'lg-line-k', text: 'Linea diei' });
    box.createDiv({ cls: 'lg-line-la', text: la });
    box.createDiv({ cls: 'lg-line-who', text: who });
    const tr = box.createDiv({ cls: 'lg-line-en lg-hidden', text: en });
    const row = box.createDiv('lg-row');
    row.createEl('button', { cls: 'lg-link', text: 'Show translation' }).onclick = ev => { tr.toggleClass('lg-hidden', !tr.hasClass('lg-hidden')); ev.target.setText(tr.hasClass('lg-hidden') ? 'Show translation' : 'Hide translation'); };
    row.createEl('button', { cls: 'lg-link', text: 'Add to today’s note' }).onclick = async () => { await this.plugin.logToday([`- Linea diei: *${la}* (${who})`], true); new Notice('Added to today’s note'); };
  }
  paintTabs() {
    const p = this.plugin, el = this.tabsEl; el.empty();
    const due = lwDue(p.words).length;
    for (const [k, label] of [['review', 'Review' + (due ? ` (${due})` : '')], ['drill', 'Drill'], ['feed', 'Feed']]) {
      const b = el.createEl('button', { cls: 'lg-tab' + (p.set.tab === k ? ' is-on' : ''), text: label });
      b.onclick = () => { p.set.tab = k; p.saveSoon(); this.paintTabs(); this.paintBody(); };
    }
  }
  paintBody() {
    const el = this.bodyEl; if (!el) return; el.empty();
    const tab = this.plugin.set.tab;
    if (tab === 'drill') this.paintDrill(el); else if (tab === 'feed') this.paintFeed(el); else this.paintReview(el);
  }
  keys(ev) {
    if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    const s = this.session; if (this.plugin.set.tab !== 'review' || !s || !s.cur) return;
    if (ev.key === ' ' && !s.shown) { ev.preventDefault(); s.shown = true; this.paintBody(); }
    else if (s.shown && /^[1-4]$/.test(ev.key)) { ev.preventDefault(); this.rate(Number(ev.key) - 1); }
  }

  /* ---------- review ---------- */
  paintReview(el) {
    const p = this.plugin, s = this.session;
    if (!s) {
      const due = lwDue(p.words);
      const box = el.createDiv('lg-empty');
      if (!p.words.length) { box.createEl('p', { text: 'No words yet. When you meet a new word in the book, press “Add a word” (or give the “Lingua: Add a word” command a hotkey).' }); return; }
      if (!due.length) { box.createEl('p', { text: 'Nothing due. Your words come back when it’s time.' }); box.createEl('button', { text: 'Drill some endings instead' }).onclick = () => { p.set.tab = 'drill'; this.paintTabs(); this.paintBody(); }; return; }
      box.createEl('p', { text: `${due.length} ${due.length === 1 ? 'word is' : 'words are'} ready to review.` });
      box.createEl('button', { cls: 'mod-cta', text: 'Start' }).onclick = () => this.startReview();
      return;
    }
    if (!s.cur) {
      const box = el.createDiv('lg-empty');
      box.createEl('p', { cls: 'lg-big', text: 'Optimē!' });
      box.createEl('p', { text: `${s.done} ${s.done === 1 ? 'word' : 'words'} reviewed, ${s.right} right first time.` });
      box.createEl('button', { text: 'Done' }).onclick = () => { this.session = null; this.render(); };
      return;
    }
    const w = s.cur, card = el.createDiv('lg-card');
    card.createDiv({ cls: 'lg-count', text: `${s.done + 1} of ${s.done + s.queue.length + 1}` });
    card.createDiv({ cls: 'lg-word', text: w.word });
    if (w.ex) card.createDiv({ cls: 'lg-ex', text: w.ex });
    if (!s.shown) {
      const b = card.createEl('button', { cls: 'mod-cta lg-wide', text: 'Show (space)' }); b.onclick = () => { s.shown = true; this.paintBody(); };
      this.containerEl.focus(); return;
    }
    card.createDiv({ cls: 'lg-meaning', text: w.meaning || '(no meaning written yet)' });
    const fx = laForms(w.word, w.kind), info = card.createDiv('lg-info');
    info.createSpan({ text: (LA_KINDS[w.kind] || '') + ` · Cap. ${laRoman(w.cap)}` });
    if (fx && LA_NOUN.has(w.kind)) info.createSpan({ text: ` · ${fx.forms['nom.sg']}, ${fx.forms['gen.sg']} ${laGender(w.kind, laParse(w.word).g)}.` });
    if (fx && LA_VERB.has(w.kind)) info.createSpan({ text: ` · ${fx.forms['3sg']}, ${fx.forms['3pl']}, ${fx.forms['inf']}` });
    const rates = card.createDiv('lg-rates');
    ['Again', 'Hard', 'Good', 'Easy'].forEach((label, r) => {
      const n = lwNext(w, r), b = rates.createEl('button', { cls: 'lg-rate lg-rate-' + r });
      b.createEl('b', { text: `${r + 1} ${label}` }); b.createSpan({ text: lwWhen(n.ivl) });
      b.onclick = () => this.rate(r);
    });
    this.containerEl.focus();
  }
  startReview() {
    const due = lgShuffle(lwDue(this.plugin.words).slice()).slice(0, 60);
    this.session = { queue: due, cur: null, shown: false, done: 0, right: 0, again: new Map() };
    this.nextCard();
  }
  nextCard() { const s = this.session; s.cur = s.queue.shift() || null; s.shown = false; if (!s.cur) this.finishReview(); this.paintHead(); this.paintTabs(); this.paintBody(); }
  rate(r) {
    const s = this.session, w = s.cur; if (!w) return;
    Object.assign(w, lwNext(w, r));
    const missed = s.again.get(w) || 0;
    if (r === 0 && missed < 2) { s.again.set(w, missed + 1); s.queue.splice(Math.min(s.queue.length, 3), 0, w); }
    else { s.done++; if (!missed && r > 0) s.right++; }
    this.plugin.saveWords();
    this.nextCard();
  }
  finishReview() {
    const s = this.session; if (!s || !s.done || s.logged) return;
    s.logged = true; this.plugin.mark('r', s.done);
    this.plugin.logToday([`- Reviewed ${s.done} ${s.done === 1 ? 'word' : 'words'} (${s.right} right first time)`]);
  }

  /* ---------- drills ---------- */
  paintDrill(el) {
    const p = this.plugin, mode = p.set.drill;
    const sw = el.createDiv('lg-switch');
    for (const [k, label] of [['forms', 'Forms'], ['sentences', 'Endings in your sentences']]) {
      const b = sw.createEl('button', { cls: 'lg-pill' + (mode === k ? ' is-on' : ''), text: label });
      b.onclick = () => { p.set.drill = k; p.saveSoon(); this.drill = null; this.paintBody(); };
    }
    if (mode === 'sentences') this.paintSentences(el); else this.paintForms(el);
  }
  pool() { const cap = this.plugin.set.chapter; return this.plugin.words.filter(w => w.cap <= cap); }
  paintForms(el) {
    const p = this.plugin, cap = p.set.chapter;
    if (!this.drill || this.drill.type !== 'forms') {
      const can = this.pool().map(w => ({ w, t: laTable(w.word, w.kind, cap) })).filter(x => x.t && (x.t.type === 'verb' ? x.t.rows.length > 1 : x.t.rows.some(r => r.pl) || x.t.rows.length > 1));
      if (!can.length) { el.createDiv('lg-empty').createEl('p', { text: 'Add a noun or a verb (like ancilla, servus or vocat) to drill its forms. Only the endings you’ve met by this capitulum are asked.' }); return; }
      const last = this.lastDrill, pick = lgShuffle(can).find(x => x.w !== last) || can[0];
      this.drill = { type: 'forms', w: pick.w, t: pick.t, inputs: [], checked: false };
      this.lastDrill = pick.w;
    }
    const d = this.drill, w = d.w, card = el.createDiv('lg-card');
    d.inputs = [];
    card.createDiv({ cls: 'lg-word', text: w.word });
    if (w.meaning) card.createDiv({ cls: 'lg-ex', text: w.meaning });
    card.createDiv({ cls: 'lg-info', text: LA_KINDS[w.kind] });
    const tbl = card.createEl('table', { cls: 'lg-table' });
    const cell = (td, answer, given) => {
      if (!answer) { td.createSpan({ cls: 'lg-dim', text: '—' }); return; }
      if (given) { td.createEl('b', { text: answer }); return; }
      const i = td.createEl('input', { type: 'text', cls: 'lg-in', attr: { autocomplete: 'off', spellcheck: 'false', 'aria-label': 'form' } });
      laMacronKeys(i); i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); d.checked ? this.nextDrill() : this.checkForms(); } });
      d.inputs.push({ i, answer, td });
    };
    if (d.t.type === 'noun') {
      const hr = tbl.createEl('tr'); hr.createEl('th'); hr.createEl('th', { text: 'Singulāris' }); hr.createEl('th', { text: 'Plūrālis' });
      for (const r of d.t.rows) {
        const tr = tbl.createEl('tr'); tr.createEl('th', { text: LA_CASE_LABEL[r.c], attr: { title: LA_CASE_NAME[r.c] } });
        cell(tr.createEl('td'), r.sg, r.c === 'nom'); cell(tr.createEl('td'), r.pl, false);
      }
    } else {
      for (const r of d.t.rows) { const tr = tbl.createEl('tr'); tr.createEl('th', { text: r.label }); cell(tr.createEl('td'), r.form, r.k === '3sg'); }
    }
    const row = card.createDiv('lg-row');
    if (!d.checked) row.createEl('button', { cls: 'mod-cta', text: 'Check (Enter)' }).onclick = () => this.checkForms();
    else { row.createDiv({ cls: 'lg-score', text: `${d.score} of ${d.inputs.length} right` }); row.createEl('button', { cls: 'mod-cta', text: 'Next word (Enter)' }).onclick = () => this.nextDrill(); }
    card.createDiv({ cls: 'lg-tip', text: 'Long vowels: Alt + a, e, i, o, u. ' + (p.set.macrons ? 'Macrons count.' : 'Macrons don’t count (change in settings).') });
    if (d.checked) { d.inputs.forEach((x, k) => { x.i.value = d.values[k] || ''; }); this.markInputs(d.inputs); }
    else window.setTimeout(() => d.inputs[0] && d.inputs[0].i.focus(), 30);
  }
  markInputs(list) {
    for (const x of list) {
      const ok = laSame(x.i.value, x.answer, this.plugin.set.macrons);
      x.td.toggleClass('is-right', ok); x.td.toggleClass('is-wrong', !ok); x.i.disabled = true;
      if (!ok) x.td.createDiv({ cls: 'lg-fix', text: x.answer });
    }
  }
  checkForms() {
    const d = this.drill; if (!d || d.checked) return;
    d.values = d.inputs.map(x => x.i.value);
    d.score = d.inputs.filter(x => laSame(x.i.value, x.answer, this.plugin.set.macrons)).length;
    d.checked = true;
    this.plugin.mark('d');
    this.plugin.logToday([`- Drill: ${lwClean(d.w.word)}, ${d.score} of ${d.inputs.length} forms right`]);
    this.paintBody();
  }
  nextDrill() { this.drill = null; this.paintBody(); }

  paintSentences(el) {
    const p = this.plugin;
    if (!this.drill || this.drill.type !== 'sentences') {
      const items = lgShuffle(this.pool().map(w => ({ w, b: laBlank(w.word, w.kind, w.ex) })).filter(x => x.b)).slice(0, 6);
      if (!items.length) { el.createDiv('lg-empty').createEl('p', { text: 'When you add a word, add the sentence you met it in (“Example”). Lingua then takes the ending off for you to put back, like a Pensum A.' }); return; }
      this.drill = { type: 'sentences', items, inputs: [], checked: false };
    }
    const d = this.drill, card = el.createDiv('lg-card');
    card.createDiv({ cls: 'lg-info', text: 'Put the endings back.' });
    const list = card.createEl('ol', { cls: 'lg-sents' });
    d.inputs = [];
    d.items.forEach((x, n) => {
      const li = list.createEl('li'); li.appendText(x.b.before + x.b.stem);
      const span = li.createSpan('lg-gap');
      const i = span.createEl('input', { type: 'text', cls: 'lg-in lg-in-gap lg-w' + Math.min(6, Math.max(2, x.b.ending.length + 1)), attr: { autocomplete: 'off', spellcheck: 'false', 'aria-label': 'ending' } });
      laMacronKeys(i); i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); d.checked ? this.nextDrill() : (d.inputs[n + 1] ? d.inputs[n + 1].i.focus() : this.checkSentences()); } });
      li.appendText(x.b.after);
      li.createSpan({ cls: 'lg-hint', text: ` (${laParse(x.w.word).lemma})` });
      d.inputs.push({ i, answer: x.b.ending, td: span });
    });
    const row = card.createDiv('lg-row');
    if (!d.checked) row.createEl('button', { cls: 'mod-cta', text: 'Check' }).onclick = () => this.checkSentences();
    else { row.createDiv({ cls: 'lg-score', text: `${d.score} of ${d.inputs.length} right` }); row.createEl('button', { cls: 'mod-cta', text: 'New round' }).onclick = () => this.nextDrill(); }
    if (d.checked) { d.inputs.forEach((x, k) => { x.i.value = d.values[k] || ''; }); this.markInputs(d.inputs); }
    else window.setTimeout(() => d.inputs[0] && d.inputs[0].i.focus(), 30);
  }
  checkSentences() {
    const d = this.drill; if (!d || d.checked) return;
    d.values = d.inputs.map(x => x.i.value);
    d.score = d.inputs.filter(x => laSame(x.i.value, x.answer, this.plugin.set.macrons)).length;
    d.checked = true;
    this.plugin.mark('d');
    this.plugin.logToday([`- Endings: ${d.score} of ${d.inputs.length} right`]);
    this.paintBody();
  }

  /* ---------- the feed: just the Latin sections of your daily notes, newest first ---------- */
  async paintFeed(el) {
    const p = this.plugin, cfg = p.cfg(), H = p.set.heading.trim().toLowerCase(), mc = this.app.metadataCache;
    const sectionHead = f => { const hs = (mc.getFileCache(f) || {}).headings || []; const i = hs.findIndex(h => h.heading.trim().toLowerCase() === H); return i < 0 ? null : { i, hs }; };
    const days = [];
    for (const f of this.app.vault.getMarkdownFiles()) { const d = lgDateOf(cfg, f.path); if (d && sectionHead(f)) days.push({ f, d }); }
    days.sort((a, b) => b.d - a.d);
    if (!days.length) { el.createDiv('lg-empty').createEl('p', { text: `Nothing yet. Words you add go under “## ${p.set.heading}” in today’s note, and show up here.` }); return; }
    const list = el.createDiv('lg-feed'), token = this.feedToken = {};
    for (const { f, d } of days.slice(0, this.feedN)) {
      const text = await this.app.vault.cachedRead(f);
      if (token !== this.feedToken) return;             // painted again meanwhile
      const at = sectionHead(f); if (!at) continue;
      const h = at.hs[at.i]; let end = text.length;
      for (let j = at.i + 1; j < at.hs.length; j++) if (at.hs[j].level <= h.level) { end = at.hs[j].position.start.offset; break; }
      const body = text.slice(h.position.end.offset, end).trim(); if (!body) continue;
      const item = list.createDiv('lg-day');
      const head = item.createEl('button', { cls: 'lg-day-h', text: window.moment(d).format('dddd D MMMM YYYY') });
      head.onclick = () => this.app.workspace.getLeaf(false).openFile(f, { eState: { line: h.position.start.line } });
      const md = item.createDiv('lg-day-b markdown-rendered');
      await MarkdownRenderer.render(this.app, body, md, f.path, this);
    }
    if (days.length > this.feedN) el.createEl('button', { cls: 'lg-wide', text: 'Show older days' }).onclick = () => { this.feedN += 14; this.paintBody(); };
  }
}

/* ---------- adding a word ---------- */
class LGAddModal extends Modal {
  constructor(app, plugin, prefill) { super(app); this.plugin = plugin; this.prefill = prefill || {}; }
  onOpen() {
    const p = this.plugin, c = this.contentEl; c.addClass('lg-add');
    this.titleEl.setText('Add a word');
    const field = (label, hint) => { const f = c.createDiv('lg-field'); f.createEl('label', { text: label }); const i = f.createEl('input', { type: 'text', attr: { autocomplete: 'off', spellcheck: 'false' } }); laMacronKeys(i); if (hint) f.createDiv({ cls: 'lg-tip', text: hint }); return i; };
    const word = field('Word', 'As the book gives it: ancilla · servus · puer, puerī · pater, patris m. · vocat');
    const preview = c.createDiv('lg-preview');
    const meaning = field('Meaning', 'In Latin if you can (fēmina quae servit), or English.');
    const ex = field('Example', 'The sentence you met it in. Used for “Endings in your sentences”.');
    const row = c.createDiv('lg-field lg-two');
    const kf = row.createDiv(); kf.createEl('label', { text: 'Kind' });
    const kind = kf.createEl('select', { cls: 'dropdown' }); for (const [k, v] of Object.entries(LA_KINDS)) { const o = kind.createEl('option', { text: v }); o.value = k; }
    const cf = row.createDiv(); cf.createEl('label', { text: 'Capitulum' });
    const cap = cf.createEl('select', { cls: 'dropdown' }); for (let i = 1; i <= 35; i++) { const o = cap.createEl('option', { text: laRoman(i) }); o.value = String(i); }
    cap.value = String(p.set.chapter);
    const mac = c.createDiv('lg-macrons'); mac.createSpan({ cls: 'lg-tip', text: 'Alt + vowel, or: ' });
    let last = word;
    for (const i of [word, meaning, ex]) i.addEventListener('focus', () => { last = i; });
    for (const ch of ['ā', 'ē', 'ī', 'ō', 'ū']) { const b = mac.createEl('button', { cls: 'lg-mac', text: ch }); b.onmousedown = ev => ev.preventDefault(); b.onclick = () => { laInsert(last, ch); last.focus(); }; }
    const err = c.createDiv('lg-err');
    let touched = false;
    kind.onchange = () => { touched = true; paint(); };
    const paint = () => {
      if (!touched) kind.value = laGuess(word.value);
      preview.empty(); const fx = laForms(word.value, kind.value);
      const have = word.value.trim() && p.find(word.value);
      if (have) preview.createSpan({ cls: 'lg-have', text: 'Already in your list: saving updates it. ' });
      if (!fx) return;
      const f = fx.forms;
      preview.appendText(LA_NOUN.has(kind.value) ? `${f['nom.sg']}, ${f['gen.sg']} · ${f['nom.pl']}` : LA_VERB.has(kind.value) ? `${f['3sg']}, ${f['3pl']} · ${f['inf']}` : '');
    };
    word.addEventListener('input', paint);
    if (this.prefill.word) { word.value = this.prefill.word; paint(); }
    const save = async close => {
      err.setText('');
      if (!word.value.trim()) { err.setText('Type the word first.'); word.focus(); return; }
      if ((kind.value === 'n3' || kind.value === 'n3i') && !laParse(word.value).gen) { err.setText('For a 3rd-declension noun, add the genitive: pater, patris m.'); word.focus(); return; }
      const res = await p.addWord({ word: laNFC(word.value.trim()), meaning: laNFC(meaning.value.trim()), ex: laNFC(ex.value.trim()), kind: kind.value, cap: Number(cap.value) });
      new Notice(res === 'new' ? `Added ${laParse(word.value).lemma}` : `Updated ${laParse(word.value).lemma}`);
      if (close) { this.close(); return; }
      word.value = meaning.value = ex.value = ''; touched = false; paint(); word.focus();
    };
    for (const i of [word, meaning, ex]) i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(false); } });
    const acts = c.createDiv('lg-row lg-end');
    acts.createEl('button', { text: 'Save and add another (Enter)' }).onclick = () => save(false);
    acts.createEl('button', { cls: 'mod-cta', text: 'Save' }).onclick = () => save(true);
    window.setTimeout(() => word.focus(), 30);
  }
  onClose() { this.contentEl.empty(); }
}

/* ---------- settings ---------- */
class LGSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const p = this.plugin, s = p.set, el = this.containerEl; el.empty();
    const done = () => { p.saveSoon(); p.refresh(); };
    new Setting(el).setName('Capitulum').setDesc('The chapter of Familia Romana you’re on. Drills only ask the endings it has taught so far.')
      .addDropdown(d => { for (let i = 1; i <= 35; i++) d.addOption(String(i), laRoman(i)); d.setValue(String(s.chapter)).onChange(v => { s.chapter = Number(v); done(); }); });
    new Setting(el).setName('Heading in the daily note').setDesc('Words, reviews and drills go under this heading in today’s note. The feed shows these sections.')
      .addText(t => t.setValue(s.heading).onChange(v => { s.heading = v.trim() || 'Latin'; done(); }));
    new Setting(el).setName('Log reviews and drills').setDesc('Add a line like “Reviewed 12 words” to today’s note. Words you add always go in.')
      .addToggle(t => t.setValue(s.log).onChange(v => { s.log = v; done(); }));
    new Setting(el).setName('Macrons count in drills').setDesc('Off: “ancillarum” is right for ancillārum. On: the long marks must match too.')
      .addToggle(t => t.setValue(s.macrons).onChange(v => { s.macrons = v; done(); }));
    new Setting(el).setName('Word list note').setDesc('Your words, grouped by capitulum, with their review dates.')
      .addText(t => t.setValue(s.wordsFile).onChange(v => { s.wordsFile = (v.trim() || LG_SET.wordsFile).replace(/(\.md)?$/, '.md'); p.wordsText = null; p.saveSoon(); p.loadWords(); }));
    new Setting(el).setName('Pensa folder').setDesc('Where the Pensa note for each capitulum is made.')
      .addText(t => t.setValue(s.pensaFolder).onChange(v => { s.pensaFolder = v.trim().replace(/\/+$/, '') || LG_SET.pensaFolder; p.saveSoon(); }));

    new Setting(el).setName('Daily notes').setHeading();
    new Setting(el).setName('Use the Daily notes settings').setDesc('Find today’s note the way the core Daily notes plugin does.')
      .addToggle(t => t.setValue(s.useCore).onChange(v => { s.useCore = v; done(); this.display(); }));
    if (!s.useCore) {
      new Setting(el).setName('Folder').addText(t => t.setValue(s.folder).onChange(v => { s.folder = v.trim(); done(); }));
      new Setting(el).setName('Date format').setDesc('Moment.js format, e.g. YYYY-MM-DD').addText(t => t.setValue(s.format).onChange(v => { s.format = v.trim() || 'YYYY-MM-DD'; done(); }));
    }

    new Setting(el).setName('Advanced').setHeading();
    new Setting(el).setName('Line of the day').setDesc('A short, well-known Latin line in the side panel each day (Horace, Ovid, Seneca, proverbs), with a translation to reveal and a button to add it to today’s note.')
      .addToggle(t => t.setValue(s.lineOfDay).onChange(v => { s.lineOfDay = v; done(); }));
  }
}
