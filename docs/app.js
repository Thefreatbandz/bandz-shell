/* ============================================================
   BANDZ SHELL v1 — phase 1: shell core + key bar + plugins + themes
   Single-file app logic. No build step. Phone-first.
   ============================================================ */
(function () {
'use strict';

/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function storeJSON(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}

/* ---------------- state ---------------- */
const S = {
  history: [],
  histIdx: -1,
  aliases: storeJSON('bs_aliases', {}),
  xp: parseInt(storeGet('bs_xp') || '0', 10),
  lastError: null,
  dungeon: null, // active dungeon game state or null
};

/* ---------------- output ---------------- */
const out = $('out');
function print(html, cls) {
  const div = document.createElement('div');
  div.className = 'line' + (cls ? ' ' + cls : '');
  div.innerHTML = html;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}
function printPre(text, cls) {
  print('<pre>' + esc(text) + '</pre>', cls);
}
function echoCmd(cmd) {
  const div = document.createElement('div');
  div.className = 'line cmdline';
  div.setAttribute('data-cmd', cmd);
  div.innerHTML = '<span class="prompt">tbandz@bandz:~$</span> ' + esc(cmd);
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}
// tap any past command to re-run it
out.addEventListener('click', (e) => {
  const el = e.target.closest('.cmdline');
  if (!el || S.dungeon) return;
  const cmd = el.getAttribute('data-cmd');
  setInput(cmd);
  submit();
});

/* ---------------- themes ---------------- */
const THEMES = {
  gold:      { bg: '#0d0d0f', fg: '#e8c15a', dim: '#8a743f', accent: '#ffe9a8', prompt: '#e8c15a' },
  matrix:    { bg: '#000000', fg: '#33ff66', dim: '#1a7a33', accent: '#b6ffce', prompt: '#33ff66' },
  amber:     { bg: '#0a0805', fg: '#ffb000', dim: '#8a5f00', accent: '#ffd98a', prompt: '#ffb000' },
  vapor:     { bg: '#0d0221', fg: '#ff71ce', dim: '#6e3a63', accent: '#01cdfe', prompt: '#ff71ce' },
  corrosion: { bg: '#14100b', fg: '#d07a35', dim: '#6e4423', accent: '#f0b06a', prompt: '#d07a35' },
};
function setTheme(name) {
  const t = THEMES[name];
  if (!t) return false;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--fg', t.fg);
  r.setProperty('--dim', t.dim);
  r.setProperty('--accent', t.accent);
  r.setProperty('--prompt', t.prompt);
  storeSet('bs_theme', name);
  return true;
}

/* ---------------- plugin registry ---------------- */
const Commands = {};
function defineCommand(def) {
  // def: { name, aliases?, help, explain, run(args, ctx) }
  Commands[def.name] = def;
  (def.aliases || []).forEach((a) => { Commands[a] = def; });
}
function primaryName(def) { return def.name; }

/* ---------------- input ---------------- */
const input = $('cmd');
function setInput(v) { input.value = v; input.focus(); }
function moveCursor(d) {
  const p = input.selectionStart == null ? input.value.length : input.selectionStart;
  const n = Math.max(0, Math.min(input.value.length, p + d));
  try { input.setSelectionRange(n, n); } catch (e) {}
  input.focus();
}
function parseArgs(line) {
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) args.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return args;
}
function submit() {
  const raw = input.value;
  input.value = '';
  sugHide();
  S.histIdx = -1;
  runLine(raw);
}
function runLine(raw) {
  const line = raw.trim();
  if (!line) return;
  // alias expansion on first token
  let parts = parseArgs(line);
  if (S.aliases[parts[0]]) {
    parts = parseArgs(S.aliases[parts[0]] + ' ' + parts.slice(1).join(' '));
  }
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);
  const def = Commands[name];
  echoCmd(raw);
  if (!line) return;
  S.history.unshift(raw);
  if (S.history.length > 100) S.history.pop();
  if (!def) {
    S.lastError = { cmd: name, msg: 'command not found' };
    const guess = closestCmd(name);
    print('command not found: ' + esc(name) + (guess
      ? ' — did you mean <b>' + esc(guess) + '</b>?'
      : ' — try <b>help</b>') + ' <span class="dim">(or `why`)</span>');
    return;
  }
  try {
    def.run(args, { print, printPre, setTheme });
  } catch (err) {
    S.lastError = { cmd: name, msg: String(err && err.message || err) };
    print('error in ' + esc(name) + ': ' + esc(S.lastError.msg), 'dim');
  }
  checkLearn(raw);
}
input.addEventListener('keydown', (e) => {
  if (S.dungeon) return; // dungeon captures keys globally
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sugVisible() && sugIdx >= 0) sugAccept();
    else submit();
  }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (sugVisible()) sugMove(-1); else histNav(1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (sugVisible()) sugMove(1); else histNav(-1); }
  else if (e.key === 'Tab') { e.preventDefault(); if (!sugAccept(0)) complete(); }
  else if (e.key === 'Escape') { sugHide(); input.value = ''; input.focus(); }
  else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); Commands.clear.run([]); }
});
function histNav(d) {
  if (!S.history.length) return;
  S.histIdx = Math.max(-1, Math.min(S.history.length - 1, S.histIdx + d));
  input.value = S.histIdx === -1 ? '' : S.history[S.histIdx];
}
// swipe left/right on the prompt row to move the cursor
(function () {
  const row = $('inputrow');
  let sx = null;
  row.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  row.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 24) moveCursor(dx > 0 ? Math.round(dx / 18) : Math.round(dx / 18));
  }, { passive: true });
})();

/* ---------------- key bar ---------------- */
const keybar = $('keybar');
const KEYS = [
  { label: 'Tab', act: () => { if (sugVisible()) sugAccept(0); else complete(); } },
  { label: '↑', act: () => { if (sugVisible()) sugMove(-1); else histNav(1); } },
  { label: '↓', act: () => { if (sugVisible()) sugMove(1); else histNav(-1); } },
  { label: '←', act: () => moveCursor(-1) },
  { label: '→', act: () => moveCursor(1) },
  { label: '|', act: () => insert('|') },
  { label: '/', act: () => insert('/') },
  { label: '~', act: () => insert('~') },
  { label: '-', act: () => insert('-') },
  { label: 'Esc', act: () => { input.value = ''; try { sugHide(); } catch (e) {} } },
];
function insert(ch) {
  const p = input.selectionStart == null ? input.value.length : input.selectionStart;
  input.value = input.value.slice(0, p) + ch + input.value.slice(input.selectionEnd == null ? p : input.selectionEnd);
  moveCursorAt(p + 1);
}
function moveCursorAt(n) {
  try { input.setSelectionRange(n, n); } catch (e) {}
  input.focus();
}
function complete() {
  const v = input.value;
  const names = Object.keys(Commands).filter((n) => n === Commands[n].name);
  const hits = names.filter((n) => n.startsWith(v)).sort();
  if (hits.length === 1) { input.value = hits[0] + ' '; }
  else if (hits.length > 1) { print(hits.map(esc).join('   '), 'dim'); }
  input.focus();
}
KEYS.forEach((k) => {
  const b = document.createElement('button');
  b.className = 'key';
  b.textContent = k.label;
  let touched = false;
  // iOS: preventDefault on touchstart keeps the input focused so the
  // keyboard never bounces — a bounce is what can swallow the next
  // keystroke typed right after tapping a key.
  b.addEventListener('touchstart', (e) => { e.preventDefault(); touched = true; setTimeout(() => { touched = false; }, 600); k.act(); input.focus(); }, { passive: false });
  b.addEventListener('click', (e) => { if (touched) { touched = false; return; } e.preventDefault(); k.act(); input.focus(); });
  keybar.appendChild(b);
});

/* ---------------- boot ---------------- */
const bootEl = $('boot');
function blip(freq, dur) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = blip.ac || (blip.ac = new AC());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = freq || 660;
    g.gain.setValueAtTime(0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (dur || 0.08));
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + (dur || 0.08));
  } catch (e) {}
}
bootEl.addEventListener('click', () => {
  bootEl.classList.add('hidden');
  blip(660, 0.09); setTimeout(() => blip(880, 0.12), 110);
  printPre(
"BANDZ SHELL v1 · phone build\n" +
"type 'help' to see commands · 'theme' to change the look · 'learn' to level up",
    'dim');
  input.focus();
  setTimeout(checkUpdate, 1500);
}, { once: false });

/* ---------------- CRT toggle ---------------- */
function setCRT(on) {
  document.body.classList.toggle('crt', !!on);
  storeSet('bs_crt', on ? '1' : '0');
}

/* ================= COMMANDS ================= */

defineCommand({
  name: 'help', aliases: ['h', '?'],
  help: 'show this command list',
  explain: 'Lists every command the shell knows. Start here whenever you are lost.',
  run(args, ctx) {
    const groups = {
      'shell': ['help', 'about', 'theme', 'clear', 'explain', 'why', 'learn', 'alias', 'crt', 'install', 'guide'],
      'you': ['stackz', 'games', 'desk', 'note', 'notes', 'todo', 'todos', 'done', 'ideas', 'idea', 'weather', 'pomodoro', 'slate'],
      'web': ['browse', 'watch', 'html', 'cpp'],
      'studio': ['studio', 'newgame', 'edit', 'run', 'ship', 'showcase', 'export', 'import'],
      'arcade': ['dungeon', 'play', 'doom', 'halo', 'fortune'],
      'fun': ['sudo', 'whoami', 'date', 'echo'],
    };
    ctx.print('<b>BANDZ SHELL</b> <span class="dim">— commands:</span>');
    Object.keys(groups).forEach((g) => {
      const rows = groups[g].map((n) => {
        const d = Commands[n];
        return '  <b>' + esc(n) + '</b>  <span class="dim">' + esc(d.help) + '</span>';
      }).join('<br>');
      ctx.print('<span class="accent">[' + g + ']</span><br>' + rows);
    });
    ctx.print('<span class="dim">tip: tap any past command to re-run it · try `explain stackz`</span>');
  }
});

defineCommand({
  name: 'about', aliases: ['neofetch'],
  help: 'about this terminal',
  explain: 'Prints the Bandz Shell identity card, neofetch-style.',
  run(args, ctx) {
    ctx.printPre(
"   ██████╗  █████╗ ███╗   ██╗██████╗ ███████╗\n" +
"   ██╔══██╗██╔══██╗████╗  ██║██╔══██╗╚══███╔╝\n" +
"   ██████╔╝███████║██╔██╗ ██║██║  ██║  ███╔╝ \n" +
"   ██╔══██╗██╔══██║██║╚██╗██║██║  ██║ ███╔╝  \n" +
"   ██████╔╝██║  ██║██║ ╚████║██████╔╝███████╗\n" +
"   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝\n" +
"   ─────────────────────────────\n" +
"   shell:    bandz-shell v1 (phone)\n" +
"   owner:    tbandz\n" +
"   theme:    " + (storeGet('bs_theme') || 'gold') + "  ·  crt: " + (storeGet('bs_crt') === '1' ? 'on' : 'off') + "\n" +
"   xp:       " + S.xp + "\n" +
"   mission:  no other terminal knows your world", 'accent');
  }
});

defineCommand({
  name: 'theme',
  help: 'theme [name|random|list] — change the look',
  explain: 'Switches the whole color scheme. Try: theme matrix, theme vapor, theme random.',
  run(args, ctx) {
    const names = Object.keys(THEMES);
    if (!args[0] || args[0] === 'list') {
      ctx.print('themes: ' + names.map((n) => '<b>' + n + '</b>').join(' · '));
      return;
    }
    let n = args[0].toLowerCase();
    if (n === 'random') n = names[Math.floor(Math.random() * names.length)];
    if (setTheme(n)) ctx.print('theme → <b>' + esc(n) + '</b>');
    else ctx.print('no theme "' + esc(args[0]) + '". try: ' + names.join(', '), 'dim');
  }
});

defineCommand({
  name: 'crt',
  help: 'crt [on|off] — toggle the CRT shader',
  explain: 'Scanlines + glow + flicker. Pure vibe.',
  run(args, ctx) {
    const on = args[0] ? args[0] === 'on' : storeGet('bs_crt') !== '1';
    setCRT(on);
    ctx.print('crt ' + (on ? '<b>on</b>' : 'off'));
  }
});

defineCommand({
  name: 'clear', aliases: ['cls'],
  help: 'clear the screen',
  explain: 'Wipes the scrollback. Ctrl+L does the same.',
  run(args, ctx) { out.innerHTML = ''; }
});

defineCommand({
  name: 'explain',
  help: 'explain <command> — what does it do?',
  explain: 'Learn mode: picks any command apart — what it does and how to use it.',
  run(args, ctx) {
    const d = Commands[(args[0] || '').toLowerCase()];
    if (!d) { ctx.print('explain what? try <b>explain stackz</b>', 'dim'); return; }
    ctx.print('<b>' + esc(d.name) + '</b> — ' + esc(d.help) + '<br><span class="dim">' + esc(d.explain) + '</span>');
  }
});

defineCommand({
  name: 'why',
  help: 'why did that fail? — plain-English error explainer',
  explain: 'Takes your last error and explains it like a friend would.',
  run(args, ctx) {
    if (!S.lastError) { ctx.print('nothing has failed yet. living dangerously, I respect it.', 'dim'); return; }
    const e = S.lastError;
    let why = '';
    if (e.msg.indexOf('command not found') !== -1 || e.msg === 'command not found') {
      why = 'The shell looked through every command it knows and "' + e.cmd + '" wasn\'t one of them. Typo? Try <b>help</b> to see the full list, or Tab to autocomplete.';
    } else {
      why = 'Something inside "' + e.cmd + '" threw: ' + e.msg + '. Usually a bug on my side — tell bands.';
    }
    ctx.print('<b>why it failed:</b><br>' + why);
  }
});

/* ---- learn mode: mission tracks ---- */
const TRACKS = {
  basics: { title: 'terminal basics', key: 'bs_learn_basics', missions: [
    { text: 'Clear the screen — run: clear', check: (c) => c === 'clear' || c === 'cls', xp: 10 },
    { text: 'Change your look — run: theme matrix', check: (c) => c.indexOf('theme ') === 0, xp: 10 },
    { text: 'Ask for help — run: explain stackz', check: (c) => c.indexOf('explain ') === 0, xp: 15 },
    { text: 'Leave a note — run: note <anything>', check: (c) => c.indexOf('note ') === 0, xp: 15 },
    { text: 'Enter the dungeon — run: dungeon', check: (c) => c.indexOf('dungeon') === 0, xp: 20 },
  ]},
  raycaster: { title: 'raycaster builder', key: 'bs_learn_ray', missions: [
    { text: 'Scaffold your shooter — run: newgame doomlike myfirst', check: (c) => c.indexOf('newgame') === 0, xp: 20 },
    { text: 'Open the code — run: edit myfirst (watch the live preview appear)', check: (c) => c.indexOf('edit ') === 0, xp: 20 },
    { text: 'Grade the mood — find GRADE in the code, set fogBlue to 0.8, watch the preview go deep blue. Then: run myfirst', check: (c) => c.indexOf('run ') === 0, xp: 30 },
    { text: 'Redraw the map — edit MAP with # and . (keep the border solid!). Then: run myfirst', check: (c) => c.indexOf('run ') === 0, xp: 30 },
    { text: 'Tune the feel — in step(), change sp = 3.2 to 6.0 (speed!) or ts = 2.4 to 5.0 (spin!). Then: run myfirst', check: (c) => c.indexOf('run ') === 0, xp: 30 },
    { text: 'Ship it — run: ship myfirst, then send the file to bands for your portfolio link', check: (c) => c.indexOf('ship ') === 0, xp: 50 },
  ]},
  web: { title: 'website builder', key: 'bs_learn_web', missions: [
    { text: 'Render your first page — run: html <h1>yo</h1>', check: (c) => c.indexOf('html ') === 0, xp: 15 },
    { text: 'Style it gold — run: html <h1 style="color:gold">yo</h1>', check: (c) => c.indexOf('html ') === 0, xp: 15 },
    { text: 'Add a button — run: html <button>tap me</button>', check: (c) => c.indexOf('html ') === 0, xp: 15 },
    { text: 'Mini profile page — a heading, a paragraph, and a link, all in one html command', check: (c) => c.indexOf('html ') === 0, xp: 25 },
    { text: 'Booking card — a barbershop card: shop name, a service, a price, a book button', check: (c) => c.indexOf('html ') === 0, xp: 30 },
  ]},
};
function trackIdx(t) {
  let v = storeGet(TRACKS[t].key);
  if (v == null && t === 'basics') v = storeGet('bs_learn'); // migrate old progress
  return parseInt(v || '0', 10);
}
function activeTrack() { return storeGet('bs_track') || 'basics'; }
function checkLearn(raw) {
  const t = activeTrack(), T = TRACKS[t] || TRACKS.basics;
  const i = trackIdx(t), m = T.missions[i];
  if (!m) return;
  if (m.check(raw.trim().toLowerCase())) {
    S.xp += m.xp;
    storeSet('bs_xp', String(S.xp));
    storeSet(T.key, String(i + 1));
    print('✓ mission complete <span class="dim">+' + m.xp + ' XP</span> → total <b>' + S.xp + ' XP</b>', 'accent');
    const next = T.missions[i + 1];
    if (next) print('next: <b>' + esc(next.text) + '</b> <span class="dim">(learn)</span>');
    else {
      print('<b>' + esc(T.title) + ' track complete.</b> 🏆', 'accent');
      const others = Object.keys(TRACKS).filter((k) => k !== t && trackIdx(k) < TRACKS[k].missions.length);
      if (others.length) print('<span class="dim">next track: learn ' + others[0] + ' — ' + esc(TRACKS[others[0]].title) + '</span>');
      else print('<span class="dim">every track complete. You are officially dangerous.</span>');
    }
    blip(990, 0.12);
  }
}
defineCommand({
  name: 'learn',
  help: 'learn [track] — missions with XP',
  explain: 'Mission tracks: terminal basics, raycaster builder, website builder. Finish them, earn XP, get dangerous.',
  run(args, ctx) {
    const want = (args[0] || '').toLowerCase();
    if (want && TRACKS[want]) {
      storeSet('bs_track', want);
      const T = TRACKS[want], i = trackIdx(want), m = T.missions[i];
      ctx.print('<b>LEARN</b> <span class="dim">· now on ' + esc(T.title) + ' · ' + S.xp + ' XP</span>');
      if (m) ctx.print('mission ' + (i + 1) + '/' + T.missions.length + ': <b>' + esc(m.text) + '</b> <span class="dim">+' + m.xp + ' XP</span>');
      else ctx.print('track complete 🏆 <span class="dim">pick another track below</span>');
    } else {
      ctx.print('<b>LEARN MODE</b> <span class="dim">· ' + S.xp + ' XP</span>');
    }
    Object.keys(TRACKS).forEach((k) => {
      const T = TRACKS[k], i = Math.min(trackIdx(k), T.missions.length);
      const mark = k === activeTrack() ? '▸' : '·';
      ctx.print(mark + ' <b>learn ' + k + '</b> <span class="dim">— ' + esc(T.title) + ' · ' + i + '/' + T.missions.length + (i >= T.missions.length ? ' ✓' : '') + '</span>');
    });
    if (!want || !TRACKS[want]) {
      const T = TRACKS[activeTrack()], i = trackIdx(activeTrack()), m = T.missions[i];
      if (m) ctx.print('<span class="dim">current mission: <b>' + esc(m.text) + '</b> +' + m.xp + ' XP</span>');
    }
  }
});

/* ---- notes / todos / ideas ---- */
function listGet(k) { return storeJSON(k, []); }
function listAdd(k, v) { const l = listGet(k); l.push(v); storeSet(k, JSON.stringify(l)); }
defineCommand({
  name: 'note', help: 'note <text> — save a quick note', explain: 'Stashes text locally on your phone. notes lists them.',
  run(args, ctx) {
    if (!args.length) { ctx.print('note what? <span class="dim">e.g. note buy milk</span>', 'dim'); return; }
    listAdd('bs_notes', args.join(' '));
    ctx.print('noted. ✓ <span class="dim">(notes to list)</span>');
  }
});
defineCommand({
  name: 'notes', help: 'list your notes', explain: 'Shows everything you stashed with note.',
  run(args, ctx) {
    const l = listGet('bs_notes');
    if (!l.length) { ctx.print('no notes yet.', 'dim'); return; }
    ctx.print(l.map((n, i) => (i + 1) + '. ' + esc(n)).join('<br>'));
  }
});
defineCommand({
  name: 'todo', help: 'todo <text> — add a todo', explain: 'Your todo list, terminal-style. done <n> checks one off.',
  run(args, ctx) {
    if (!args.length) { ctx.print('todo what?', 'dim'); return; }
    listAdd('bs_todos', { t: args.join(' '), done: false });
    ctx.print('added. ✓');
  }
});
defineCommand({
  name: 'todos', help: 'list your todos', explain: 'Shows open and finished todos.',
  run(args, ctx) {
    const l = listGet('bs_todos');
    if (!l.length) { ctx.print('nothing to do. suspicious.', 'dim'); return; }
    ctx.print(l.map((n, i) => (n.done ? '<span class="dim">✓ ' : (i + 1) + '. ') + esc(n.t) + (n.done ? '</span>' : '')).join('<br>'));
  }
});
defineCommand({
  name: 'done', help: 'done <n> — check off a todo', explain: 'Marks todo number n as finished.',
  run(args, ctx) {
    const l = listGet('bs_todos');
    const n = parseInt(args[0], 10) - 1;
    if (!l[n]) { ctx.print('no todo #' + esc(args[0] || '?'), 'dim'); return; }
    l[n].done = true; storeSet('bs_todos', JSON.stringify(l));
    ctx.print('✓ ' + esc(l[n].t), 'accent');
  }
});
defineCommand({
  name: 'idea', help: 'idea <text> — capture a content idea', explain: 'Quick-capture inbox for ideas. ideas lists them.',
  run(args, ctx) {
    if (!args.length) { ctx.print('idea what?', 'dim'); return; }
    listAdd('bs_ideas', args.join(' '));
    ctx.print('captured. ✓');
  }
});
defineCommand({
  name: 'ideas', help: 'list captured ideas', explain: 'Your idea inbox.',
  run(args, ctx) {
    const l = listGet('bs_ideas');
    if (!l.length) { ctx.print('inbox empty. the muse is quiet today.', 'dim'); return; }
    ctx.print(l.map((n, i) => (i + 1) + '. ' + esc(n)).join('<br>'));
  }
});
defineCommand({
  name: 'alias', help: 'alias <name>="<cmd>" — make your own command', explain: 'Custom commands as apps. e.g. alias ll="help". Aliases persist.',
  run(args, ctx) {
    const m = (args.join(' ')).match(/^(\S+)=["']?([\s\S]+?)["']?$/);
    if (!m) {
      const ks = Object.keys(S.aliases);
      ctx.print(ks.length ? ks.map((k) => '<b>' + esc(k) + '</b> → ' + esc(S.aliases[k])).join('<br>') : 'no aliases yet. <span class="dim">try: alias ll="help"</span>');
      return;
    }
    S.aliases[m[1]] = m[2];
    storeSet('bs_aliases', JSON.stringify(S.aliases));
    ctx.print('alias <b>' + esc(m[1]) + '</b> → ' + esc(m[2]) + ' ✓');
  }
});

/* ---- fun ---- */
const FORTUNES = [
  'The dungeon fears the prepared.',
  'Gold looks good on you. Literally — check the theme.',
  'Paper trade like every dollar is real. It will be one day.',
  'A wizard is never late. Neither is a backtest.',
  'Fortune favors the bold. And the well-tested.',
  'You miss 100% of the shots you don\'t take. And 60% of the ones you do. Keep shooting.',
  'The best time to plant a tree was 20 years ago. The best time to ship v1 is today.',
];
defineCommand({
  name: 'fortune', help: 'a fortune, bandz-flavored', explain: 'Ancient wisdom, questionable accuracy.',
  run(args, ctx) { ctx.print('🔮 ' + esc(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]), 'accent'); }
});
defineCommand({
  name: 'sudo', help: 'try it', explain: 'Go ahead. Try it.',
  run(args, ctx) { ctx.print('nice try. this shell answers to <b>tbandz</b> only.', 'dim'); S.lastError = null; }
});
defineCommand({
  name: 'whoami', help: 'who are you?', explain: 'Identity check.',
  run(args, ctx) { ctx.print('tbandz — owner of this shell, future dungeon legend.', 'accent'); }
});
defineCommand({
  name: 'date', help: 'current date/time', explain: 'What day is it? Now you know.',
  run(args, ctx) { ctx.print(esc(new Date().toString())); }
});
defineCommand({
  name: 'echo', help: 'echo <text> — say it back', explain: 'The shell repeats what you say. Great for testing.',
  run(args, ctx) { ctx.print(esc(args.join(' '))); }
});

/* ---- stackz: mission control ---- */
const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function sparkline(vals) {
  if (!vals.length) return '';
  const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  if (mx === mn) return SPARKS[3].repeat(vals.length);
  return vals.map((v) => SPARKS[Math.round((v - mn) / (mx - mn) * 7)]).join('');
}
function bar(cur, total, w) {
  const f = Math.round(cur / total * w);
  return '[' + '█'.repeat(f) + '░'.repeat(w - f) + '] ' + cur + '/' + total;
}
defineCommand({
  name: 'stackz',
  help: 'stackz — your paper-trading command center',
  explain: 'Live-ish snapshot of the paper bot: equity, P&L, gate progress, open positions. PAPER ONLY, always labeled.',
  run(args, ctx) {
    ctx.print('<span class="dim">reading snapshot…</span>');
    fetch('stackz.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('no snapshot'); return r.json(); })
      .then((d) => renderStackz(d, ctx))
      .catch(() => renderStackz(null, ctx));
  }
});
function renderStackz(d, ctx) {
  if (!d) {
    ctx.print('no snapshot yet — the bot publishes one soon. <span class="dim">(demo below)</span>');
    d = { paper_only: true, equity: 1000.02, realized: -1.23, closed: 11, gate: 100,
          open: ['AMD', 'AMZN', 'QQQ', 'TSLA', 'XLK'], recent: [0.4, -0.2, 0.1, -0.5, 0.3, -0.1, -0.16], updated: 'demo' };
  }
  const pnlCls = d.realized >= 0 ? 'accent' : 'dim';
  ctx.printPre(
'┌─ STACKZ · PAPER TRADING ─────────────┐\n' +
'│ Equity  $' + d.equity.toFixed(2) + '   P&L ' + (d.realized >= 0 ? '+' : '') + d.realized.toFixed(2) + ' ' + sparkline(d.recent) + ' │\n' +
'│ Gate    ' + bar(d.closed, d.gate, 14) + '      │\n' +
'│ Open    ' + d.open.join(' ').padEnd(26, ' ') + '│\n' +
'└──────────────────────────────────────┘', pnlCls);
  ctx.print('<span class="dim">updated: ' + esc(d.updated) + ' · paper only — no live money</span>');
}

/* ---- games launcher ---- */
defineCommand({
  name: 'games',
  help: 'games — your game library',
  explain: 'Every game you\'ve built, one menu. Tap a link to play.',
  run(args, ctx) {
    const g = [
      ['LAST SHIFT', 'zombie survival · wave defense', 'https://thefreatbandz.github.io/last-shift/'],
      ['CARRIER', 'tower-extraction RPG · infection meter', 'https://thefreatbandz.github.io/carrier/'],
      ['Bandz Terminal', 'market dashboard · paper trading HQ', 'https://bandz-terminal.streamlit.app/'],
    ];
    ctx.print('<b>YOUR GAMES</b>');
    g.forEach((x) => {
      ctx.print('▸ <a href="' + x[2] + '" target="_blank" rel="noopener"><b>' + x[0] + '</b></a> <span class="dim">— ' + x[1] + '</span>');
    });
    ctx.print('<span class="dim">more landing as they ship.</span>');
  }
});

/* ---- halo (link, never bundled) ---- */
defineCommand({
  name: 'halo',
  help: 'halo — the Halo: CE browser port (needs your own disc)',
  explain: 'Opens the fan-made Halo: CE browser port. Unofficial — we link it, never bundle it. You supply your own Xbox disc rip.',
  run(args, ctx) {
    ctx.print('HALO: COMBAT EVOLVED — in a browser tab. <span class="dim">Fan port of the original Xbox game, rebuilt for WebAssembly.</span><br>' +
      'The catch: it can\'t run inside this terminal — tap the <b>↗ safari</b> button up top for a real tab.<br>' +
      'And it needs <b>your own disc</b>: you rip an XISO from your Xbox copy of Halo: CE and pick the file when it asks. No disc, no game — Microsoft\'s assets, their rules.<br>' +
      '<span class="dim">Desktop browser = the real experience. On iPhone it loads but plays rough — the dev says so himself.<br>' +
      'Unofficial project, could vanish any day. Opening…</span>');
    browserGo('https://mitchellhynes.com/halo/halo.html');
  }
});

/* ---- arcade (DOOM live, more loading) ---- */
function arcadeOpen(title, url) {
  $('arcadetitle').textContent = '▸ ' + title;
  const f = $('arcadeframe');
  f.removeAttribute('srcdoc'); // srcdoc beats src when both are set — clear the last user game
  f.src = url;
  $('arcade').classList.add('open');
  blip(520, 0.08);
}
function arcadeClose() {
  $('arcade').classList.remove('open');
  const f = $('arcadeframe');
  f.removeAttribute('srcdoc');
  f.src = 'about:blank';
  input.focus();
}
$('arcadeclose').addEventListener('click', arcadeClose);
defineCommand({
  name: 'play',
  help: 'play [game] — the arcade',
  explain: 'The game arcade, inside your terminal. `play` lists games, `play doom` launches DOOM.',
  run(args, ctx) {
    const g = (args[0] || '').toLowerCase();
    if (g === 'doom') {
      ctx.print('launching <b>DOOM</b>… <span class="dim">freedoom · touch controls on phone</span>');
      arcadeOpen('DOOM', 'arcade/doom/');
      return;
    }
    if (g) { ctx.print('"' + esc(g) + '" isn\'t in the arcade yet. <span class="dim">try: play doom</span>'); return; }
    ctx.print('<b>ARCADE</b><br>' +
      '▸ <b>doom</b> <span class="dim">— playable now · `play doom`</span><br>' +
      '· quake <span class="dim">— wiring up</span><br>' +
      '· fighters <span class="dim">— emulator + your ROMs</span><br>' +
      '· supertuxkart <span class="dim">— on deck</span><br>' +
      '<span class="dim">meanwhile: `dungeon` is ours and already here.</span>');
  }
});
defineCommand({
  name: 'doom',
  help: 'doom — launch DOOM',
  explain: 'Shortcut for `play doom`. Freedoom-powered, touch controls on your phone.',
  run(args, ctx) { Commands.play.run(['doom'], ctx); }
});

/* ---- weather / pomodoro / slate ---- */
defineCommand({
  name: 'weather',
  help: 'weather — quick forecast',
  explain: 'One-line weather. Needs signal.',
  run(args, ctx) {
    fetch('https://wttr.in/?format=3').then((r) => r.text()).then((t) => ctx.print(esc(t)))
      .catch(() => ctx.print('no signal. the sky remains a mystery.', 'dim'));
  }
});
defineCommand({
  name: 'pomodoro',
  help: 'pomodoro [min] — focus timer',
  explain: 'Starts a focus timer. Default 25 minutes. It pings you when time\'s up.',
  run(args, ctx) {
    const mins = Math.max(1, parseInt(args[0] || '25', 10) || 25);
    ctx.print('⏳ focusing for <b>' + mins + ' min</b>. go build.');
    setTimeout(() => { print('⏰ <b>time!</b> take a breath.', 'accent'); blip(880, 0.2); setTimeout(() => blip(660, 0.25), 250); }, mins * 60000);
  }
});
defineCommand({
  name: 'slate',
  help: 'slate <odds...> — parlay calculator',
  explain: 'American-odds parlay math. e.g. slate -110 150 -200 → payout on $10.',
  run(args, ctx) {
    const toDec = (a) => a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
    const odds = args.map(Number).filter((n) => !isNaN(n) && n !== 0 && Math.abs(n) >= 100);
    if (odds.length < 2) { ctx.print('need 2+ american odds. <span class="dim">e.g. slate -110 150</span>', 'dim'); return; }
    const dec = odds.reduce((p, o) => p * toDec(o), 1);
    const stake = 10;
    ctx.print(odds.join(' · ') + ' → pays <b>$' + (stake * dec).toFixed(2) + '</b> on $' + stake + ' <span class="dim">(profit $' + (stake * (dec - 1)).toFixed(2) + ')</span>');
  }
});

/* ================= DUNGEON — our own roguelike (v0) =================
   ASCII crawler. WASD/arrows/swipe to move, bump to attack.
   `dungeon` = random run · `dungeon daily` = today's shared seed. q = quit. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function newDungeon(seed) {
  const W = 40, H = 16;
  const rnd = mulberry32(seed);
  const grid = [];
  for (let y = 0; y < H; y++) { grid.push(new Array(W).fill('#')); }
  const rooms = [];
  let tries = 0;
  while (rooms.length < 7 && tries++ < 200) {
    const rw = 4 + Math.floor(rnd() * 7), rh = 3 + Math.floor(rnd() * 5);
    const rx = 1 + Math.floor(rnd() * (W - rw - 2)), ry = 1 + Math.floor(rnd() * (H - rh - 2));
    let ok = true;
    rooms.forEach((r) => {
      if (rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y) ok = false;
    });
    if (!ok) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = '.';
  }
  // connect rooms with L corridors
  for (let i = 1; i < rooms.length; i++) {
    let x = rooms[i - 1].x + (rooms[i - 1].w >> 1), y = rooms[i - 1].y + (rooms[i - 1].h >> 1);
    const tx = rooms[i].x + (rooms[i].w >> 1), ty = rooms[i].y + (rooms[i].h >> 1);
    while (x !== tx) { grid[y][x] = '.'; x += Math.sign(tx - x); }
    while (y !== ty) { grid[y][x] = '.'; y += Math.sign(ty - y); }
    grid[y][x] = '.';
  }
  const r0 = rooms[0];
  const px = r0.x + (r0.w >> 1), py = r0.y + (r0.h >> 1);
  const rl = rooms[rooms.length - 1];
  const stairX = rl.x + (rl.w >> 1), stairY = rl.y + (rl.h >> 1);
  grid[stairY][stairX] = '>';
  const freeSpot = (r) => {
    for (let t = 0; t < 20; t++) {
      const x = r.x + 1 + Math.floor(rnd() * (r.w - 2));
      const y = r.y + 1 + Math.floor(rnd() * (r.h - 2));
      if (x === stairX && y === stairY) continue; // never on the stairs
      if (x === px && y === py) continue; // never on the player
      return { x, y };
    }
    return null;
  };
  const goblins = [], goldSpots = [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const s = freeSpot(r);
      if (s) goblins.push({ x: s.x, y: s.y, hp: 6 });
    }
    if (rnd() < 0.8) { const s = freeSpot(r); if (s) goldSpots.push(s); }
  }
  return { W, H, grid, px, py, hp: 20, maxhp: 20, floor: 1, gold: 0, goldSpots, score: 0, goblins, seed, rnd };
}
function dungeonRender() {
  const d = S.dungeon;
  const rows = [];
  for (let y = 0; y < d.H; y++) {
    let row = '';
    for (let x = 0; x < d.W; x++) {
      if (x === d.px && y === d.py) row += '@';
      else {
        const g = d.goblins.find((o) => o.x === x && o.y === y);
        if (g) row += 'g';
        else if (d.goldSpots.find((o) => o.x === x && o.y === y)) row += '*';
        else row += d.grid[y][x];
      }
    }
    rows.push(row);
  }
  return rows.join('\n');
}
function dungeonDraw(msg) {
  const d = S.dungeon;
  $('dungeonview').innerHTML =
    '<div class="dhud">HP <b>' + d.hp + '/' + d.maxhp + '</b> · floor <b>' + d.floor + '</b> · gold <b>' + d.gold + '</b> · score <b>' + d.score + '</b> <span class="dim">· q quits</span></div>' +
    '<pre class="dmap">' + esc(dungeonRender()) + '</pre>' +
    (msg ? '<div class="dim">' + esc(msg) + '</div>' : '');
}
function dungeonMsg(m) { dungeonDraw(m); }
function dungeonMove(dx, dy) {
  const d = S.dungeon;
  if (!d) return;
  const nx = d.px + dx, ny = d.py + dy;
  if (nx < 0 || ny < 0 || nx >= d.W || ny >= d.H || d.grid[ny][nx] === '#') { dungeonDraw(); return; }
  const gi = d.goblins.findIndex((o) => o.x === nx && o.y === ny);
  if (gi !== -1) {
    const g = d.goblins[gi];
    const dmg = 2 + Math.floor(Math.random() * 4);
    g.hp -= dmg;
    if (g.hp <= 0) { d.goblins.splice(gi, 1); d.score += 25; dungeonMsg('goblin slain! +25'); }
    else dungeonMsg('you hit the goblin (' + dmg + ')');
  } else {
    d.px = nx; d.py = ny;
    const au = d.goldSpots.findIndex((o) => o.x === nx && o.y === ny);
    if (au !== -1) { d.goldSpots.splice(au, 1); d.gold++; d.score += 10; blip(1200, 0.05); }
    if (d.grid[ny][nx] === '>') {
      const nd = newDungeon(d.seed + d.floor * 7919);
      nd.floor = d.floor + 1; nd.hp = Math.min(d.maxhp, d.hp + 5); nd.maxhp = d.maxhp;
      nd.gold = d.gold; nd.score = d.score + 50;
      S.dungeon = nd;
      dungeonMsg('descending… floor ' + nd.floor + ' (+50)');
      return;
    }
  }
  // goblins shuffle toward the player
  d.goblins.forEach((g) => {
    if (Math.abs(g.x - d.px) + Math.abs(g.y - d.py) > 6 || Math.random() < 0.4) return;
    const sx = Math.sign(d.px - g.x), sy = Math.sign(d.py - g.y);
    const tryStep = (ax, ay) => {
      const tx = g.x + ax, ty = g.y + ay;
      if (d.grid[ty][tx] === '.' && !(tx === d.px && ty === d.py) && !d.goblins.find((o) => o.x === tx && o.y === ty)) { g.x = tx; g.y = ty; return true; }
      return false;
    };
    if (Math.abs(d.px - g.x) > Math.abs(d.py - g.y)) { if (!tryStep(sx, 0)) tryStep(0, sy); }
    else { if (!tryStep(0, sy)) tryStep(sx, 0); }
    if (Math.abs(g.x - d.px) + Math.abs(g.y - d.py) === 1 && Math.random() < 0.5) {
      const dmg = 1 + Math.floor(Math.random() * 3);
      d.hp -= dmg;
      if (d.hp <= 0) return dungeonDie();
    }
  });
  if (d.hp <= 0) return dungeonDie();
  dungeonDraw();
}
function dungeonDie() {
  const d = S.dungeon;
  const best = parseInt(storeGet('bs_dungeon_best') || '0', 10);
  if (d.score > best) storeSet('bs_dungeon_best', String(d.score));
  $('dungeonview').innerHTML =
    '<pre class="dmap">   R.I.P.\n   @ tbandz\n   floor ' + d.floor + ' · score ' + d.score + '\n\n   ' + (d.score >= best && d.score > 0 ? 'NEW BEST! 🏆' : 'best: ' + best) + '</pre>' +
    '<div class="dim">permadeath is permadeath. type <b>dungeon</b> to run it back. (q to exit)</div>';
  S.dungeon = Object.assign(d, { dead: true });
  blip(220, 0.3);
}
function dungeonQuit() {
  S.dungeon = null;
  $('dungeonview').innerHTML = '';
  $('dungeonview').style.display = 'none';
  print('you climb out of the dungeon. the gold stays with you in spirit.', 'dim');
  input.focus();
}
defineCommand({
  name: 'dungeon',
  help: 'dungeon [daily] — our own roguelike',
  explain: 'Bandz original. Procedural floors, goblins, gold, permadeath. WASD/arrows/swipe to move, bump to attack. `dungeon daily` = today\'s shared seed.',
  run(args, ctx) {
    const daily = args[0] === 'daily';
    const seed = daily ? seedFrom('bandz-' + new Date().toISOString().slice(0, 10)) : (Math.random() * 1e9) | 0;
    S.dungeon = newDungeon(seed);
    const v = $('dungeonview');
    v.style.display = 'block';
    v.innerHTML = '';
    ctx.print('<b>DUNGEON</b> <span class="dim">' + (daily ? '· daily seed — same dungeon for everyone today' : '· floor 1 · find the <b>&gt;</b> stairs') + '</span>');
    try {
      dungeonDraw('move: WASD / arrows / swipe · attack: walk into goblins');
    } catch (err) {
      // never leave a broken dungeon wedged: it captures WASD keys and would eat typing
      S.dungeon = null;
      v.style.display = 'none';
      ctx.print('dungeon crashed on launch: ' + esc(err && err.message) + ' <span class="dim">— cleaned up so it can\'t eat your keys</span>');
      input.focus();
      return;
    }
    input.blur();
  }
});
// dungeon key capture
document.addEventListener('keydown', (e) => {
  const d = S.dungeon;
  if (!d) return;
  if (d.dead) { if (e.key === 'q' || e.key === 'Enter') dungeonQuit(); return; }
  const k = e.key.toLowerCase();
  const map = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
  if (k === 'q') { e.preventDefault(); dungeonQuit(); return; }
  if (map[k]) {
    e.preventDefault();
    try { dungeonMove(map[k][0], map[k][1]); }
    catch (err) {
      // a mid-game crash must not wedge the keyboard either
      S.dungeon = null;
      try { $('dungeonview').style.display = 'none'; } catch (e2) {}
      print('dungeon crashed: ' + esc(err.message) + ' <span class="dim">— cleaned up so it can\'t eat your keys</span>');
      input.focus();
    }
  }
});
// swipe to move in the dungeon
(function () {
  let sx = null, sy = null;
  const v = $('dungeonview');
  v.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  v.addEventListener('touchend', (e) => {
    if (sx == null || !S.dungeon || S.dungeon.dead) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    sx = sy = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) dungeonMove(Math.sign(dx), 0);
    else dungeonMove(0, Math.sign(dy));
  }, { passive: true });
})();

/* ---------------- init ---------------- */
const BUILD = 11; // bump with every deploy; the shell checks version.json and warns on stale builds
setTheme(storeGet('bs_theme') || 'gold');
setCRT(storeGet('bs_crt') === '1');
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((r) => { try { r.update(); } catch (e) {} }) // force the update check every load
      .catch(() => {});
  });
}
// stale-build banner: cache-busted fetch slips past the old worker's cache
function checkUpdate() {
  fetch('version.json?t=' + Date.now()).then((r) => r.json()).then((v) => {
    if (v && v.build > BUILD) {
      print('<b>⟳ UPDATE AVAILABLE</b> <span class="dim">— you\'re on an old build. Close this tab completely (tab switcher → ✕), force-close Safari, reopen the link.</span>', 'accent');
      blip(440, 0.12);
    }
  }).catch(() => {});
}

/* ---------------- status bar: clock + paper P&L ticker ---------------- */
(function () {
  const clock = $('clock'), pnl = $('pnl');
  function tick() {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick(); setInterval(tick, 20000);
  fetch('stackz.json', { cache: 'no-store' }).then((r) => r.json()).then((s) => {
    const v = (s.realized >= 0 ? '+' : '') + s.realized.toFixed(2);
    pnl.textContent = 'paper ' + v + ' · ' + s.closed + '/' + s.gate;
  }).catch(() => {});
})();

/* ================= PHONE INSTALL ================= */
defineCommand({
  name: 'install',
  help: 'install — get Bandz Shell on your phone like an app',
  explain: 'iPhones can\'t sideload apps, but Add to Home Screen is the real deal: fullscreen icon, offline, no App Store.',
  run(args, ctx) {
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) { ctx.print('you\'re already running installed. ✓', 'accent'); return; }
    ctx.print('<b>PUT ME ON YOUR PHONE</b><br>' +
      '1. tap <b>Share</b> in Safari (the square with ↑)<br>' +
      '2. tap <b>Add to Home Screen</b><br>' +
      '3. open me from the icon — fullscreen, offline-ready<br>' +
      '<span class="dim">that\'s the download. no App Store, no waiting.</span>');
  }
});

/* ================= WEB BROWSER ================= */
function browserGo(url) {
  let u = url.trim();
  if (!u) return;
  if (!/^[a-z]+:\/\//i.test(u)) {
    u = u.indexOf('.') === -1
      ? 'https://duckduckgo.com/?q=' + encodeURIComponent(u)
      : 'https://' + u;
  }
  $('urlbar').value = u;
  const f = $('browserframe');
  f.removeAttribute('srcdoc');
  f.src = u;
  $('browser').classList.add('open');
}
function browserClose() {
  $('browser').classList.remove('open');
  $('browserframe').src = 'about:blank';
}
$('gobtn').addEventListener('click', () => browserGo($('urlbar').value));
$('urlbar').addEventListener('keydown', (e) => { if (e.key === 'Enter') browserGo($('urlbar').value); });
$('browserclose').addEventListener('click', browserClose);
$('openext').addEventListener('click', () => { const u = $('urlbar').value; if (u) window.open(u, '_blank'); });
defineCommand({
  name: 'browse',
  help: 'browse <url> — the web, inside the terminal',
  explain: 'Opens a real browser pane. Some sites (Google, etc.) block embedding — then use the ↗ safari button.',
  run(args, ctx) {
    if (!args.length) { ctx.print('browse where? <span class="dim">e.g. browse github.com</span>', 'dim'); return; }
    browserGo(args.join(' '));
    ctx.print('opening… <span class="dim">(✕ closes the pane)</span>');
  }
});

/* ================= HTML PREVIEW ================= */
defineCommand({
  name: 'html',
  help: 'html <code> — render HTML live',
  explain: 'Your own little web lab. Type HTML, watch it render instantly. e.g. html <h1>yo</h1>',
  run(args, ctx) {
    const code = args.join(' ');
    if (!code) {
      ctx.print('give me HTML. <span class="dim">e.g. html &lt;h1 style="color:gold"&gt;yo&lt;/h1&gt;</span>', 'dim');
      return;
    }
    const f = $('browserframe');
    f.removeAttribute('src');
    f.srcdoc = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;padding:20px;background:#111;color:#eee}</style></head><body>' + code + '</body></html>';
    $('urlbar').value = 'preview: your HTML';
    $('browser').classList.add('open');
    ctx.print('rendered. ✕ closes it.', 'dim');
  }
});

/* ================= C++ — the honest path ================= */
defineCommand({
  name: 'cpp',
  help: 'c++ — can I code C++ here?',
  explain: 'Straight answer about C++ on a phone, and the real path to it.',
  run(args, ctx) {
    ctx.print('<b>C++ ON YOUR PHONE — HONEST VERSION</b><br><br>' +
      'C++ needs <i>compiling</i> — turning code into a real program takes a heavy toolchain (g++, clang) that phones don\'t have. No terminal app is going to change that.<br><br>' +
      '<b>Your path, in order:</b><br>' +
      '1. <b>JavaScript, right here.</b> It runs instantly in this terminal, it\'s visual, and it IS real game code — your web games are JavaScript. Learn here first.<br>' +
      '2. <b>Python</b> via the Matrix terminal (Pyodide) — also runs on your phone today.<br>' +
      '3. <b>C++ later, on the laptop</b> — when the v2 backend lands, this terminal can send C++ to your laptop, compile it for real, and show you the result. That\'s also where Unreal-engine-style dev lives.<br><br>' +
      '<span class="dim">Devs aren\'t made by the language — they\'re made by finishing games. Start with `newgame`.</span>');
  }
});

/* ================= DESK — your mini computer ================= */
const DESK = { tab: 'notes', q: '' };
const DESK_DEFS = {
  notes: { key: 'bs_notes', addLabel: 'note', isTodo: false },
  todos: { key: 'bs_todos', addLabel: 'todo', isTodo: true },
  ideas: { key: 'bs_ideas', addLabel: 'idea', isTodo: false },
};
function deskItems() {
  const def = DESK_DEFS[DESK.tab];
  let l = listGet(def.key);
  if (DESK.q) {
    const q = DESK.q.toLowerCase();
    l = l.filter((x) => (def.isTodo ? x.t : x).toLowerCase().indexOf(q) !== -1);
  }
  return l;
}
function deskRender() {
  document.querySelectorAll('.dtab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === DESK.tab));
  const def = DESK_DEFS[DESK.tab];
  const all = listGet(def.key);
  const l = deskItems();
  const box = $('desklist');
  if (!l.length) { box.innerHTML = '<div class="dim" style="padding:12px">nothing here yet.</div>'; return; }
  box.innerHTML = l.map((x) => {
    const i = all.indexOf(x);
    const txt = def.isTodo ? x.t : x;
    const done = def.isTodo && x.done;
    return '<div class="ditem' + (done ? ' doneitem' : '') + '" data-i="' + i + '">' +
      '<button class="ddel" data-del="' + i + '">✕</button>' +
      '<span class="dtxt" data-tog="' + i + '">' + (def.isTodo && !done ? (i + 1) + '. ' : def.isTodo && done ? '✓ ' : '• ') + esc(txt) + '</span></div>';
  }).join('');
}
function deskAdd() {
  const v = $('deskinput').value.trim();
  if (!v) return;
  const def = DESK_DEFS[DESK.tab];
  listAdd(def.key, def.isTodo ? { t: v, done: false } : v);
  $('deskinput').value = '';
  deskRender();
  blip(880, 0.06);
}
function deskOpen() { DESK.q = ''; $('desksearch').value = ''; $('desk').classList.add('open'); deskRender(); $('deskinput').focus(); }
function deskClose() { $('desk').classList.remove('open'); input.focus(); }
document.querySelectorAll('.dtab').forEach((b) => b.addEventListener('click', () => { DESK.tab = b.getAttribute('data-tab'); deskRender(); }));
$('desksearch').addEventListener('input', (e) => { DESK.q = e.target.value; deskRender(); });
$('deskaddbtn').addEventListener('click', deskAdd);
$('deskinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') deskAdd(); });
$('deskclose').addEventListener('click', deskClose);
$('desklist').addEventListener('click', (e) => {
  const def = DESK_DEFS[DESK.tab];
  const del = e.target.getAttribute('data-del');
  const tog = e.target.getAttribute('data-tog');
  if (del != null) {
    const l = listGet(def.key); l.splice(parseInt(del, 10), 1);
    storeSet(def.key, JSON.stringify(l)); deskRender();
  } else if (tog != null && def.isTodo) {
    const l = listGet(def.key); const it = l[parseInt(tog, 10)];
    if (it) { it.done = !it.done; storeSet(def.key, JSON.stringify(l)); deskRender(); }
  }
});
defineCommand({
  name: 'desk',
  help: 'desk — your mini computer (notes/todos/ideas)',
  explain: 'Your organized space. Same data as the note/todo/idea commands, but visual: tabs, search, tap to toggle.',
  run(args, ctx) { deskOpen(); }
});

/* ================= STUDIO — build games here ================= */
function gameKey(n) { return 'bs_game_' + n; }
function gameGet(n) { return storeJSON(gameKey(n), null); }
function gameSave(n, code) { storeSet(gameKey(n), JSON.stringify({ code: code, updated: Date.now() })); }
function myGames() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('bs_game_') === 0) out.push(k.slice(8));
    }
  } catch (e) {}
  return out.sort();
}
let editingGame = null;
let edLive = true, edTimer = null;
function edRenderPreview() {
  if (!edLive || !editingGame) return;
  try {
    const f = $('edpreview');
    f.removeAttribute('src');
    f.srcdoc = $('edcode').value;
  } catch (e) {}
}
function editorOpen(name, code) {
  editingGame = name;
  $('edtitle').textContent = 'edit · ' + name;
  $('edcode').value = code;
  $('edmsg').textContent = 'edit the code · save keeps it on your phone · run plays it';
  $('edlive').classList.toggle('on', edLive);
  $('edpreview').classList.toggle('on', edLive);
  $('editor').classList.add('open');
  edRenderPreview();
}
function editorClose() { $('editor').classList.remove('open'); editingGame = null; try { const f = $('edpreview'); f.removeAttribute('srcdoc'); f.removeAttribute('src'); } catch (e) {} input.focus(); }
$('edclose').addEventListener('click', editorClose);
$('edlive').addEventListener('click', () => {
  edLive = !edLive;
  $('edlive').classList.toggle('on', edLive);
  $('edpreview').classList.toggle('on', edLive);
  if (edLive) { $('edmsg').textContent = 'live preview on — it rebuilds as you type'; edRenderPreview(); }
  else { const f = $('edpreview'); f.removeAttribute('srcdoc'); f.removeAttribute('src'); $('edmsg').textContent = 'live preview off'; }
  blip(edLive ? 990 : 520, 0.06);
});
$('edcode').addEventListener('input', () => {
  clearTimeout(edTimer);
  edTimer = setTimeout(edRenderPreview, 900); // rebuild ~1s after he stops typing
});
$('edsave').addEventListener('click', () => {
  if (!editingGame) return;
  gameSave(editingGame, $('edcode').value);
  $('edmsg').textContent = 'saved ✓ ' + new Date().toLocaleTimeString();
  blip(990, 0.08);
});
$('edrun').addEventListener('click', () => {
  if (!editingGame) return;
  gameSave(editingGame, $('edcode').value);
  runGameSrc($('edcode').value, editingGame);
});
function runGameSrc(code, title) {
  $('editor').classList.remove('open');
  $('arcadetitle').textContent = '▸ ' + title;
  const f = $('arcadeframe');
  f.removeAttribute('src');
  f.srcdoc = code;
  $('arcade').classList.add('open');
  blip(520, 0.08);
}
defineCommand({
  name: 'studio',
  help: 'studio — build games in the terminal',
  explain: 'Your game jam machine. newgame scaffolds one, edit opens the code, run plays it. All on your phone.',
  run(args, ctx) {
    const mine = myGames();
    ctx.print('<b>GAME STUDIO</b> <span class="dim">— build games, learn to code, ship portfolio pieces</span><br>' +
      'templates: <b>doomlike</b> <span class="dim">(DOOM-style raycaster — heavily commented so you can learn it)</span><br>' +
      (mine.length ? 'your games: ' + mine.map((g) => '<b>' + esc(g) + '</b>').join(' · ') + '<br>' : '') +
      '<span class="dim">newgame doomlike → edit my-doomlike → run my-doomlike</span>');
  }
});
defineCommand({
  name: 'newgame',
  help: 'newgame [template] [name] — scaffold a game',
  explain: 'Copies a template into your own game that you can edit and run. This is how devs start: remix, don\'t blank-page.',
  run(args, ctx) {
    const tpl = (args[0] || '').toLowerCase();
    if (!tpl) {
      ctx.print('templates: <b>doomlike</b><br><span class="dim">e.g. newgame doomlike my-shooter</span>');
      return;
    }
    if (tpl !== 'doomlike') { ctx.print('no template "' + esc(tpl) + '" yet. <span class="dim">doomlike is the one.</span>'); return; }
    const name = (args[1] || 'my-doomlike').toLowerCase().replace(/[^a-z0-9-]/g, '');
    ctx.print('scaffolding <b>' + esc(name) + '</b>…');
    fetch('studio/doomlike.html').then((r) => {
      if (!r.ok) throw new Error('template missing');
      return r.text();
    }).then((code) => {
      gameSave(name, code);
      ctx.print('✓ <b>' + esc(name) + '</b> is yours now.<br><span class="dim">edit ' + esc(name) + ' → change the code → run ' + esc(name) + ' → play it.<br>every LEARN comment in the code teaches you how it works.</span>');
      blip(990, 0.1);
    }).catch(() => ctx.print('couldn\'t fetch the template. check your signal.', 'dim'));
  }
});
defineCommand({
  name: 'edit',
  help: 'edit <game> — open the code editor',
  explain: 'Opens your game\'s code. Change numbers, colors, maps — save, run, see what happens. That loop IS learning to code.',
  run(args, ctx) {
    const name = (args[0] || '').toLowerCase();
    if (!name) {
      const mine = myGames();
      ctx.print(mine.length ? 'your games: ' + mine.map(esc).join(' · ') + '<br><span class="dim">edit &lt;name&gt;</span>' : 'no games yet. <span class="dim">newgame doomlike</span> first.', 'dim');
      return;
    }
    const g = gameGet(name);
    if (!g) { ctx.print('no game "' + esc(name) + '". <span class="dim">newgame doomlike ' + esc(name) + '</span> to create it.', 'dim'); return; }
    editorOpen(name, g.code);
  }
});
defineCommand({
  name: 'run',
  help: 'run <game> — play your game',
  explain: 'Launches your game fullscreen. Made something cool? This is your portfolio piece.',
  run(args, ctx) {
    const name = (args[0] || '').toLowerCase();
    const g = name && gameGet(name);
    if (!g) { ctx.print('run what? <span class="dim">run &lt;game&gt; — see `studio`</span>', 'dim'); return; }
    runGameSrc(g.code, name);
  }
});

/* ================= SUGGESTIONS — it guesses what you'll say ================= */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = [], cur = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
function cmdNames() {
  return Object.keys(Commands).filter((n) => Commands[n].name === n).sort();
}
function closestCmd(name) {
  let best = null, bd = 3;
  cmdNames().forEach((n) => {
    const d = levenshtein(name, n);
    if (d < bd) { bd = d; best = n; }
  });
  return best;
}
const ARG_HINTS = {
  theme: () => Object.keys(THEMES),
  play: () => ['doom'],
  learn: () => Object.keys(TRACKS),
  dungeon: () => ['daily'],
  explain: () => cmdNames(),
  newgame: () => ['doomlike'],
  edit: () => myGames(),
  run: () => myGames(),
};
let sugList = [], sugIdx = -1;
function sugVisible() { return $('suggest').style.display === 'block' && sugList.length > 0; }
function updateSuggest() {
  const box = $('suggest');
  sugList = []; sugIdx = -1;
  if (S.dungeon) { box.style.display = 'none'; return; }
  const v = input.value;
  if (!v) { box.style.display = 'none'; return; }
  const m = v.match(/^(\S+)\s+(.*)$/);
  if (m) {
    // completing an argument: "theme m" -> "theme matrix"
    const cmd = m[1].toLowerCase(), frag = m[2].toLowerCase();
    const hints = (ARG_HINTS[cmd] || (() => []))();
    sugList = hints.filter((h) => h.toLowerCase().indexOf(frag) === 0)
      .map((h) => ({ t: m[1] + ' ' + h, d: '' }));
  } else {
    // completing the command itself
    const frag = v.toLowerCase();
    const cmds = cmdNames().filter((n) => n.indexOf(frag) === 0)
      .map((n) => ({ t: n, d: Commands[n].help }));
    const als = Object.keys(Commands)
      .filter((n) => Commands[n].name !== n && n.indexOf(frag) === 0)
      .map((n) => ({ t: n, d: 'alias → ' + Commands[n].name }));
    const seen = {};
    cmds.concat(als).forEach((s) => { seen[s.t] = 1; });
    const hist = [];
    for (let i = 0; i < S.history.length && hist.length < 3; i++) {
      const h = S.history[i];
      if (h.toLowerCase().indexOf(frag) === 0 && !seen[h]) { seen[h] = 1; hist.push({ t: h, d: 'history' }); }
    }
    sugList = cmds.concat(als, hist).slice(0, 6);
  }
  if (!sugList.length) { box.style.display = 'none'; return; }
  box.innerHTML = sugList.map((s, i) =>
    '<div class="sug" data-i="' + i + '"><b>' + esc(s.t) + '</b>' +
    (s.d ? ' <span class="dim">· ' + esc(s.d) + '</span>' : '') + '</div>').join('');
  box.style.display = 'block';
}
function sugMove(d) {
  if (!sugList.length) return;
  sugIdx = (sugIdx + d + sugList.length) % sugList.length;
  const els = $('suggest').querySelectorAll('.sug');
  els.forEach((el, i) => el.classList.toggle('on', i === sugIdx));
}
function sugAccept(i) {
  const s = sugList[i == null ? sugIdx : i];
  if (!s) return false;
  input.value = s.t + (s.t.indexOf(' ') === -1 ? ' ' : '');
  $('suggest').style.display = 'none';
  sugList = []; sugIdx = -1;
  input.focus();
  return true;
}
function sugHide() { $('suggest').style.display = 'none'; sugList = []; sugIdx = -1; }
$('suggest').addEventListener('click', (e) => {
  const el = e.target.closest('.sug');
  if (el) sugAccept(parseInt(el.getAttribute('data-i'), 10));
});
input.addEventListener('input', updateSuggest);

/* test hook (node only, harmless in browser) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { newDungeon: newDungeon, mulberry32: mulberry32, seedFrom: seedFrom, sparkline: sparkline, bar: bar, parseArgs: parseArgs,
    levenshtein: levenshtein, closestCmd: closestCmd, cmdNames: cmdNames, ARG_HINTS: ARG_HINTS,
    TRACKS: TRACKS, trackIdx: trackIdx, activeTrack: activeTrack };
}

/* ================= SHIP + BACKUP — portfolio & safety ================= */
function downloadFile(name, content, type) {
  try {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 5000);
    return true;
  } catch (e) { return false; }
}
async function shareFile(name, content, type, title) {
  try {
    const file = new File([content], name, { type: type || 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || name });
      return true;
    }
  } catch (e) { /* user cancelled or unsupported */ }
  return false;
}
defineCommand({
  name: 'ship',
  help: 'ship <game> — package your game to share',
  explain: 'Bundles your game into one file you can text to people. Send the file to bands and it goes live on your public portfolio link.',
  run(args, ctx) {
    const name = (args[0] || '').toLowerCase();
    const g = name && gameGet(name);
    if (!g) {
      const mine = myGames();
      ctx.print('ship what?' + (mine.length ? '<br><span class="dim">your games: ' + mine.map(esc).join(' · ') + '</span>' : '<br><span class="dim">no games yet — `newgame doomlike` first</span>'));
      return;
    }
    const fname = 'bandz-' + name + '.html';
    ctx.print('packaging <b>' + esc(name) + '</b>…');
    try { storeSet('bs_shipped', '1'); } catch (e) {}
    shareFile(fname, g.code, 'text/html', name).then((shared) => {
      if (!shared) {
        if (!downloadFile(fname, g.code, 'text/html')) { ctx.print('couldn\'t make the file on this browser.', 'dim'); return; }
      }
      ctx.print((shared ? 'share sheet opened ✓' : 'downloaded <b>' + esc(fname) + '</b> ✓') +
        '<br><span class="dim">send that file to bands in chat and I\'ll put it live at</span><br>' +
        '<b>thefreatbandz.github.io/bandz-shell/showcase/' + esc(name) + '/</b>');
      blip(990, 0.1);
    });
  }
});
defineCommand({
  name: 'showcase',
  help: 'showcase — your public portfolio',
  explain: 'The games you\'ve shipped to a public link. This is the portfolio.',
  run(args, ctx) {
    fetch('showcase/index.json?t=' + Date.now()).then((r) => r.json()).then((idx) => {
      const gs = (idx && idx.games) || [];
      if (!gs.length) {
        ctx.print('<b>SHOWCASE</b> <span class="dim">— nothing shipped yet</span><br><span class="dim">`ship &lt;game&gt;` puts your game here, on a link you can send anyone.</span>');
        return;
      }
      ctx.print('<b>SHOWCASE</b> <span class="dim">— your public portfolio</span><br>' +
        gs.map((g) => '▸ <b>' + esc(g.name) + '</b> <span class="dim">— thefreatbandz.github.io/bandz-shell/showcase/' + esc(g.path) + '/</span>').join('<br>'));
    }).catch(() => ctx.print('couldn\'t reach the showcase. check your signal.', 'dim'));
  }
});
defineCommand({
  name: 'export',
  help: 'export [games|desk|all] — back up your stuff',
  explain: 'Your games and notes live in the phone\'s browser storage, which iOS can wipe. Export keeps a copy in your Files.',
  run(args, ctx) {
    const what = (args[0] || 'all').toLowerCase();
    const data = { app: 'bandz-shell', v: 1, exported: new Date().toISOString(), games: {}, desk: null };
    if (what === 'games' || what === 'all') {
      myGames().forEach((n) => { const g = gameGet(n); if (g) data.games[n] = g.code; });
    }
    if (what === 'desk' || what === 'all') {
      data.desk = { notes: listGet('bs_notes'), todos: listGet('bs_todos'), ideas: listGet('bs_ideas') };
    }
    const n = Object.keys(data.games).length;
    const fname = 'bandz-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    if (!downloadFile(fname, JSON.stringify(data), 'application/json')) { ctx.print('couldn\'t make the file on this browser.', 'dim'); return; }
    ctx.print('backed up <b>' + esc(fname) + '</b> <span class="dim">(' + n + ' game' + (n === 1 ? '' : 's') + (data.desk ? ' + desk' : '') + ')</span><br><span class="dim">keep it in Files or iCloud. `import` restores it.</span>');
    blip(990, 0.1);
  }
});
defineCommand({
  name: 'import',
  help: 'import — restore from a backup file',
  explain: 'Reads a bandz backup file and puts your games and desk stuff back.',
  run(args, ctx) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data || data.app !== 'bandz-shell') throw new Error('not a bandz backup');
          let ng = 0;
          Object.keys(data.games || {}).forEach((n) => {
            const key = String(n).toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (key && typeof data.games[n] === 'string') { gameSave(key, data.games[n]); ng++; }
          });
          let nd = 0;
          if (data.desk) {
            ['notes', 'todos', 'ideas'].forEach((k) => {
              if (Array.isArray(data.desk[k])) { storeSet('bs_' + k, JSON.stringify(data.desk[k])); nd += data.desk[k].length; }
            });
          }
          ctx.print('restored <b>' + ng + '</b> game' + (ng === 1 ? '' : 's') + (nd ? ' + ' + nd + ' desk items' : '') + ' <span class="dim">from ' + esc(f.name) + '</span>');
          blip(990, 0.1);
        } catch (e) { ctx.print('couldn\'t read that file. <span class="dim">is it a bandz backup?</span>'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }
});

/* ================= LIL G — your terminal guide ================= */
const GUIDE_TOPICS = {
  start: { t: 'where do I start?', b: 'You already did — you\'re here. The fastest path: <b>newgame doomlike</b> → <b>edit</b> it (live preview shows your changes) → <b>guide loop</b> when you hit code you don\'t get → <b>ship</b> it when it\'s yours. That\'s the whole dev loop.' },
  variable: { t: 'variables', b: 'A variable is a labeled box. <b>let hp = 100</b> makes a box called hp holding 100. Change it: <b>hp = hp - 10</b>. In your raycaster, search LEARN comments for <b>let</b> — every setting is a variable you can tweak live.' },
  loop: { t: 'loops', b: 'A loop repeats code. <b>for (let i = 0; i < 10; i++)</b> runs 10 times. Your dungeon map is drawn with a loop — one loop per row, one per column. Try in <b>html</b>: <b>&lt;script&gt;for(let i=0;i<5;i++)document.write("yo "+i+"&lt;br&gt;")&lt;/script&gt;</b>' },
  function: { t: 'functions', b: 'A function is a reusable recipe. <b>function shoot() { ... }</b> defines it, <b>shoot()</b> runs it. The raycaster is built from functions: one casts rays, one draws walls, one moves enemies. Read them top to bottom — each LEARN comment says what its function cooks.' },
  array: { t: 'arrays', b: 'An array is a list. <b>let inv = ["sword", "potion"]</b>. Grab items: <b>inv[0]</b> is "sword". Your dungeon\'s goblins live in an array — the game loops it to move every goblin each turn.' },
  if: { t: 'if statements', b: '<b>if (hp &lt;= 0) { die() }</b> — do something only when a condition is true. Games are mostly ifs: if player hits wall, stop. If bullet hits enemy, damage. Open your raycaster and count the ifs — you\'ll see the game thinking.' },
  raycaster: { t: 'how the raycaster works', b: 'For every vertical slice of your screen, it shoots an invisible ray into the map until it hits a wall. Close wall = tall slice, far wall = short slice. That\'s the whole 3D trick DOOM used in 1993 — and your template has it in ~100 lines with LEARN comments.' },
  sprite: { t: 'sprites', b: 'A sprite is a 2D image in a 3D-ish world — your raycaster\'s enemies are sprites. They get bigger as you get closer (same math as the walls). Change the enemy emoji/color in the template and watch them change live.' },
  map: { t: 'game maps', b: 'Your raycaster map is just text: <b>#</b> = wall, <b>.</b> = floor. Draw a new shape with # and . in the MAP variable and the level rebuilds instantly in the live preview. Level design is typing.' },
  ship: { t: 'shipping your game', b: '<b>ship &lt;game&gt;</b> packages it into one file → share sheet → send it to bands in chat → I put it live at <b>thefreatbandz.github.io/bandz-shell/showcase/&lt;game&gt;/</b>. That link is your portfolio. <b>showcase</b> lists everything you\'ve shipped.' },
  portfolio: { t: 'building your portfolio', b: 'A portfolio is proof you can build. Every game you <b>ship</b> becomes a link. 3-4 shipped games + this terminal itself = a real junior-dev portfolio. Quality over quantity — one polished raycaster remix beats five half-done ones.' },
  backup: { t: 'backing up', b: 'Your stuff lives in the phone\'s browser storage — iOS can wipe it. <b>export</b> downloads everything (games + desk) to a file. Do it after every real work session. <b>import</b> brings it back.' },
  doom: { t: 'doom', b: '<b>doom</b> launches DOOM (Freedoom — free and legal). Touch controls on phone, WASD + mouse on desktop, controller if you pair one. <b>play</b> shows the arcade shelf.' },
  dungeon: { t: 'dungeon', b: 'Our original roguelike. WASD/arrows/swipe to move, walk into goblins to fight, grab <b>*</b> gold, find the <b>&gt;</b> stairs. <b>dungeon daily</b> = same seed all day. q quits. Permadeath — make it count.' },
  stackz: { t: 'stackz', b: 'Your paper-trading command center. The bot paper-trades toward 100 closed trades before real money is even a question. <b>stackz</b> shows the scoreboard — win rate, P&amp;L, open positions.' },
  desk: { t: 'desk', b: 'Your mini-computer: notes, todos, ideas in one place with tabs and search. Quick-add from the terminal: <b>note</b>, <b>todo</b>, <b>idea</b>. <b>export desk</b> backs it up.' },
  theme: { t: 'themes', b: '<b>theme</b> lists them: gold, matrix, amber, vapor, corrosion. <b>theme matrix</b> switches. Your pick sticks — it saves on the phone.' },
  controller: { t: 'controller', b: 'Pair any Bluetooth controller (Xbox/PS) in iPhone Settings → Bluetooth, then open <b>doom</b>. Left stick moves, right stick turns, RT/A fires, LB/B uses, Start = enter. A 🎮 badge shows up top when it connects.' },
};
const GUIDE_TIPS = [
  'Tab finishes your command. The popup above the keyboard guesses what you\'re typing — tap it.',
  'Stuck? <b>why</b> explains your last error in plain words.',
  'Every LEARN comment in the raycaster is a mini-lesson. Read them while the live preview runs.',
  'Change ONE number at a time in your game, watch the preview, then change the next. That\'s debugging.',
  '<b>export</b> after every real session. Future you says thanks.',
  'The dungeon daily seed is the same all day — race yourself.',
  'Type <b>guide loop</b>, <b>guide variable</b>, <b>guide function</b> — tiny coding lessons, right here.',
  '<b>ship</b> early, <b>ship</b> often. A portfolio is just shipped things.',
  'Your terminal learns your habits — past commands show up in the suggestion popup.',
  'CRT mode (<b>crt on</b>) is pure vibes. Try it with matrix theme.',
  'Got a controller? Pair it in Settings → Bluetooth, then <b>doom</b>.',
  'The map in your raycaster is just text. Draw with # and . — you\'re level designing.',
];
function guideBrief(ctx) {
  const mine = myGames();
  const shipped = storeGet('bs_shipped') === '1';
  let next;
  if (!mine.length) next = 'you haven\'t cooked a game yet — <b>newgame doomlike</b> is the move. I\'ll explain the code with you.';
  else if (!shipped) next = 'you\'ve got <b>' + mine.length + '</b> game' + (mine.length === 1 ? '' : 's') + ' — <b>ship ' + esc(mine[0]) + '</b> turns it into a file you can send anyone.';
  else next = 'portfolio\'s started. Next: remix the raycaster into something that\'s <i>yours</i> — new map, new colors, then <b>ship</b> it.';
  const tip = GUIDE_TIPS[(Math.random() * GUIDE_TIPS.length) | 0];
  ctx.print(
    '<span class="accent">  .-.</span><br>' +
    '<span class="accent">  |o o|</span>  <b>lil g</b> <span class="dim">— your terminal homie</span><br>' +
    '<span class="accent">  |_-_|</span>  xp <b>' + S.xp + '</b> · ' + mine.length + ' game' + (mine.length === 1 ? '' : 's') + ' cooking<br><br>' +
    'next up: ' + next + '<br><br>' +
    '<span class="dim">tip: ' + tip + '<br>ask me stuff: `guide loop` · `guide ship` · `guide doom` · `guide tip`</span>');
}
defineCommand({
  name: 'guide', aliases: ['g'],
  help: 'guide [topic] — ask lil g',
  explain: 'Lil g is your built-in guide — next steps, coding lessons, and answers about the terminal. No signal needed, he lives here.',
  run(args, ctx) {
    const q = args.join(' ').toLowerCase().trim();
    if (!q) { guideBrief(ctx); return; }
    if (q === 'tip' || q === 'tips') {
      ctx.print('<b>lil g tip:</b> ' + GUIDE_TIPS[(Math.random() * GUIDE_TIPS.length) | 0]);
      return;
    }
    // fuzzy topic match
    let best = null, bk = '';
    Object.keys(GUIDE_TOPICS).forEach((k) => {
      if (q === k || q.indexOf(k) === 0 || k.indexOf(q) === 0) { if (k.length > bk.length) { best = GUIDE_TOPICS[k]; bk = k; } }
    });
    if (!best) {
      // maybe they asked about a command — point at explain
      if (Commands[q]) { ctx.print('<b>lil g:</b> that\'s a command — <b>explain ' + esc(q) + '</b> breaks it down for you.'); return; }
      ctx.print('<b>lil g:</b> hmm, I don\'t know about "' + esc(q) + '" yet. Try: ' + Object.keys(GUIDE_TOPICS).slice(0, 8).map(esc).join(', ') + '…<br><span class="dim">or just `guide` for the briefing.</span>');
      return;
    }
    ctx.print('<b>lil g on ' + esc(best.t) + ':</b><br>' + best.b);
    if (Math.random() < 0.35) S.xp = (S.xp || 0) + 1;
  }
});
ARG_HINTS.guide = () => Object.keys(GUIDE_TOPICS).concat(['tip']);

/* ================= WATCH — video in the terminal ================= */
function ytId(u) {
  u = u.trim();
  const m = u.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
  return null;
}
defineCommand({
  name: 'watch',
  help: 'watch <youtube link | .mp4> — play video here',
  explain: 'YouTube links play right in the terminal (YouTube allows embedding). Netflix & co. block embedding — use the ↗ safari button for those.',
  run(args, ctx) {
    const raw = args.join(' ').trim();
    if (!raw) { ctx.print('watch what? <span class="dim">e.g. watch https://youtu.be/dQw4w9WgXcQ</span>'); return; }
    const id = ytId(raw);
    if (id) {
      const f = $('browserframe');
      f.removeAttribute('srcdoc');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1';
      $('urlbar').value = '▶ youtube: ' + id;
      $('browser').classList.add('open');
      ctx.print('loading the video… <span class="dim">(✕ closes the pane)</span>');
      blip(880, 0.07);
      return;
    }
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(raw)) {
      let u = raw;
      if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
      const f = $('browserframe');
      f.removeAttribute('src');
      f.srcdoc = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center}video{width:100%;max-height:100%}</style></head>' +
        '<body><video src="' + esc(u) + '" controls playsinline autoplay></video></body></html>';
      $('urlbar').value = '▶ video file';
      $('browser').classList.add('open');
      ctx.print('loading the video… <span class="dim">(✕ closes the pane)</span>');
      blip(880, 0.07);
      return;
    }
    ctx.print('I can play <b>YouTube</b> links and direct video files (.mp4) right here.<br><span class="dim">Netflix / Hulu / Disney+ block embedding — `browse` them and use the ↗ safari button.</span>');
  }
});

})();
