/* Lingua: daily notes. Where they live (the core Daily Notes settings, unless you set your own), writing
 * under the Latin heading in today's note, and reading that section back for the feed. */

function lgConfig(app, s) {
  let folder = s.folder || '', format = s.format || '', template = s.template || '';
  if (s.useCore !== false) {
    try {
      const o = app.internalPlugins.getPluginById('daily-notes').instance.options;
      if (o) { folder = o.folder || ''; format = o.format || ''; template = o.template || ''; }
    } catch (e) { /* core plugin off: our own settings */ }
  }
  return { folder: String(folder).replace(/^\/+|\/+$/g, ''), format: format || 'YYYY-MM-DD', template };
}
function lgPath(cfg, date) { return (cfg.folder ? cfg.folder + '/' : '') + window.moment(date).format(cfg.format) + '.md'; }
// the date of a daily note from its path, or null
function lgDateOf(cfg, path) {
  if (!path.endsWith('.md')) return null;
  if (cfg.folder && !path.startsWith(cfg.folder + '/')) return null;
  const m = window.moment(path.slice(cfg.folder ? cfg.folder.length + 1 : 0, -3), cfg.format, true);
  return m.isValid() ? m.toDate() : null;
}

// a note split around a heading: { found, before (up to and with the heading), body, after }
function lgSplit(text, heading) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n'), h = heading.trim().toLowerCase();
  const i = lines.findIndex(l => /^#{1,6}\s+/.test(l) && l.replace(/^#{1,6}\s+/, '').trim().toLowerCase() === h);
  if (i < 0) return { found: false };
  const level = lines[i].match(/^#+/)[0].length;
  let j = i + 1;
  while (j < lines.length && !(new RegExp('^#{1,' + level + '}\\s').test(lines[j]))) j++;
  return { found: true, before: lines.slice(0, i + 1).join('\n'), body: lines.slice(i + 1, j).join('\n').replace(/^\n+|\n+$/g, ''), after: lines.slice(j).join('\n') };
}
// add lines to the end of the section (made at the end of the note if it isn't there)
function lgAppend(text, heading, lines) {
  const add = lines.join('\n'), sec = lgSplit(text, heading);
  if (!sec.found) { const head = String(text || '').replace(/\s*$/, ''); return (head ? head + '\n\n' : '') + `## ${heading}\n\n` + add + '\n'; }
  const body = sec.body ? sec.body + '\n' + add : add;
  return sec.before + '\n\n' + body + '\n' + (sec.after ? '\n' + sec.after.replace(/^\n+/, '') : '');
}
