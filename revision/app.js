'use strict';
/* ====== stockage local (IndexedDB) ====== */
const DB = (() => {
  let dbp;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('revision-base', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('docs', { keyPath: 'key' });
        db.createObjectStore('progress');
        db.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    all: store => tx(store, 'readonly', s => s.getAll()),
    allKeys: store => tx(store, 'readonly', s => s.getAllKeys()),
    get: (store, k) => tx(store, 'readonly', s => s.get(k)),
    put: (store, v, k) => tx(store, 'readwrite', s => k === undefined ? s.put(v) : s.put(v, k)),
    del: (store, k) => tx(store, 'readwrite', s => s.delete(k)),
    clear: store => tx(store, 'readwrite', s => s.clear())
  };
})();

/* ====== état ====== */
const S = {
  docs: [], cards: [], pools: {}, prog: {}, byId: {}, secById: {}, docByKey: {},
  meta: { themesOff: [], newPerSession: 10, size: 20, days: [], suspended: [] },
  session: null
};
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const plural = (n, a, b) => n + ' ' + (n > 1 ? (b || a + 's') : a);

async function load() {
  try {
    const m = await DB.get('meta', 'settings');
    if (m) Object.assign(S.meta, m);
    S.docs = await DB.all('docs');
    const keys = await DB.allKeys('progress');
    const vals = await DB.all('progress');
    keys.forEach((k, i) => S.prog[k] = vals[i]);
  } catch (e) { console.error(e); toast('Le stockage local est indisponible sur ce navigateur.'); }
  rebuild();
}
function rebuild() {
  S.docs.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  S.docByKey = Object.fromEntries(S.docs.map(d => [d.key, d]));
  S.secById = {};
  S.docs.forEach(d => d.sections.forEach(s => S.secById[s.id] = { s, d }));
  const built = Engine.buildCards(S.docs);
  const susp = new Set(S.meta.suspended);
  S.cards = built.cards.filter(c => !susp.has(c.id));
  S.pools = built.pools;
  S.byId = Object.fromEntries(S.cards.map(c => [c.id, c]));
}
const saveMeta = () => DB.put('meta', JSON.parse(JSON.stringify(S.meta)), 'settings');

/* ====== statistiques ====== */
function themeList() {
  const map = {};
  for (const d of S.docs) (map[d.theme] = map[d.theme] || { name: d.theme, docs: 0, cards: 0, score: 0 }).docs++;
  for (const c of S.cards) {
    const t = map[c.theme]; if (!t) continue;
    t.cards++;
    const p = S.prog[c.id];
    if (p) t.score += Math.min(p.box, 4) / 4;
  }
  return Engine.THEMES.map(n => map[n]).filter(Boolean);
}
function activeCards(types) {
  const off = new Set(S.meta.themesOff);
  return S.cards.filter(c => !off.has(c.theme) && (!types || types.includes(c.type)));
}
function counts(types) {
  const now = Date.now();
  let due = 0, fresh = 0;
  for (const c of activeCards(types)) {
    const p = S.prog[c.id];
    if (!p) fresh++; else if (p.due <= now) due++;
  }
  return { due, fresh };
}
function streak() {
  const set = new Set(S.meta.days);
  let n = 0; const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ====== navigation ====== */
function setHeader(sub, back) {
  $('#hSub').textContent = sub || 'La base, carte par carte';
  $('#btnBack').classList.toggle('hidden', !back);
  $('#btnRead').classList.toggle('hidden', !!back);
  $('#btnSettings').classList.toggle('hidden', !!back);
}
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', route);
$('#btnBack').onclick = () => {
  if (S.session && !S.session.done && S.session.answered > 0 && !confirm('Quitter la session en cours ? Vos réponses sont déjà enregistrées.')) return;
  S.session = null; S.cs = null; go('#accueil');
};
$('#btnRead').onclick = () => go('#lire');
$('#btnSettings').onclick = () => go('#base');

function route() {
  const h = location.hash.slice(1) || 'accueil';
  window.scrollTo(0, 0);
  if (h === 'claude' && S.cs) return viewClaudeQ();
  if (h === 'programme') return viewProgramme();
  if (!S.docs.length && h !== 'base') return viewEmpty();
  if (h === 'session' && S.session) return viewCard();
  if (h === 'lire') return viewLibrary();
  if (h.startsWith('fiche-')) return viewDoc(h.slice(6));
  if (h === 'base') return viewBase();
  S.session = null;
  return viewHome();
}

/* ====== accueil ====== */
const MODES = [
  { id: 'mix', glyph: '∑', name: 'Session du jour', desc: 'Révisions dues et nouvelles cartes, tous formats', types: ['qcm', 'vf', 'fiche'] },
  { id: 'qcm', glyph: '%', name: 'Chiffres clés', desc: 'Retrouver le seuil, le taux, la durée ou l’article', types: ['qcm'] },
  { id: 'vf', glyph: 'V/F', name: 'Vrai ou faux', desc: 'Repérer le chiffre qui a été modifié', types: ['vf'] },
  { id: 'fiche', glyph: '¶', name: 'Restituer une section', desc: 'Réciter de mémoire, puis comparer avec la fiche', types: ['fiche'] }
];
function viewHome() {
  setHeader(streak() > 1 ? plural(streak(), 'jour') + ' de révision d’affilée' : null, false);
  const c = counts(MODES[0].types);
  const newN = Math.min(c.fresh, S.meta.newPerSession);
  const total = Math.min(S.meta.size, c.due + newN);
  const headline = c.due ? plural(c.due, 'carte') + ' à revoir' : (c.fresh ? 'Rien en retard' : 'Tout est à jour');
  const line = c.due
    ? (newN ? `Plus ${plural(newN, 'nouvelle carte', 'nouvelles cartes')} pour avancer dans la base.` : 'Toutes les cartes des thèmes choisis ont été vues.')
    : (c.fresh ? `Découvrez ${plural(newN, 'nouvelle carte', 'nouvelles cartes')} aujourd’hui.` : 'Revenez demain, ou entraînez-vous en avance.');
  const th = themeList();
  app.innerHTML = claudeBlock() + `
  <section class="today"><div class="stack"><div class="under"></div><div class="sheet">
    <h2>${esc(headline)}</h2><p>${esc(line)}</p>
    <button class="btn primary block" id="start">${total ? 'Commencer la session' : 'S’entraîner en avance'}</button>
  </div></div></section>
  <h3 class="sec">Choisir un format</h3>
  <div class="modes">${MODES.slice(1).map(m => {
    const k = counts(m.types);
    return `<button class="mode" data-mode="${m.id}"><span class="glyph">${m.glyph}</span><span><b>${m.name}</b><span>${m.desc}</span></span><span class="count">${k.due ? k.due + ' dues' : ''}</span></button>`;
  }).join('')}</div>
  <h3 class="sec">Thèmes révisés</h3>
  <div class="themes">${th.map((t, i) => {
    const pct = t.cards ? Math.round(100 * t.score / t.cards) : 0;
    const on = !S.meta.themesOff.includes(t.name);
    return `<div class="theme"><input type="checkbox" id="th${i}" data-theme="${esc(t.name)}" ${on ? 'checked' : ''}>
      <label for="th${i}"><span class="name">${esc(t.name)}</span><br><span class="meta">${plural(t.docs, 'fiche')}, ${t.cards} cartes</span></label>
      <span class="pct" title="Maîtrise">${pct} %</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('')}</div>
  <p class="note" style="margin-top:14px">La maîtrise progresse quand une carte est réussie plusieurs fois à quelques jours d’intervalle.</p>`;
  bindClaudeBlock();
  $('#start').onclick = () => startSession('mix');
  app.querySelectorAll('.mode').forEach(b => b.onclick = () => startSession(b.dataset.mode));
  app.querySelectorAll('[data-theme]').forEach(cb => cb.onchange = () => {
    const off = new Set(S.meta.themesOff);
    cb.checked ? off.delete(cb.dataset.theme) : off.add(cb.dataset.theme);
    S.meta.themesOff = [...off]; saveMeta(); viewHome();
  });
}

/* ====== sessions ====== */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startSession(modeId, onlyDoc) {
  const mode = MODES.find(m => m.id === modeId);
  const now = Date.now();
  let pool = activeCards(mode.types);
  if (onlyDoc) pool = S.cards.filter(c => c.doc === onlyDoc && mode.types.includes(c.type));
  const due = pool.filter(c => S.prog[c.id] && S.prog[c.id].due <= now).sort((a, b) => S.prog[a.id].due - S.prog[b.id].due);
  const usedFacts = new Set();
  const pick = [];
  const take = c => {
    const f = c.fact ? c.fact.id : c.id;
    if (usedFacts.has(f)) return false;
    usedFacts.add(f); pick.push(c); return true;
  };
  for (const c of due) { if (pick.length >= S.meta.size) break; take(c); }
  let fresh = shuffle(pool.filter(c => !S.prog[c.id]));
  if (modeId === 'mix') { // dosage : moitié QCM, un quart vrai/faux, un quart fiches
    const by = t => fresh.filter(c => c.type === t);
    const q = by('qcm'), v = by('vf'), f = by('fiche'); fresh = [];
    while (q.length || v.length || f.length) { for (const arr of [q, v, q, f]) if (arr.length) fresh.push(arr.shift()); }
  }
  let added = 0;
  for (const c of fresh) { if (pick.length >= S.meta.size || added >= S.meta.newPerSession) break; if (take(c)) added++; }
  if (!pick.length) { // entraînement en avance : cartes les moins maîtrisées
    const seen = pool.filter(c => S.prog[c.id]).sort((a, b) => S.prog[a.id].box - S.prog[b.id].box || S.prog[a.id].due - S.prog[b.id].due);
    for (const c of seen) { if (pick.length >= S.meta.size) break; take(c); }
  }
  if (!pick.length) { toast('Aucune carte dans ce format pour les thèmes choisis.'); return; }
  S.session = { mode: modeId, queue: shuffle(pick), i: 0, answered: 0, good: 0, retried: new Set(), done: false };
  go('#session');
}

function notches(id) {
  const box = S.prog[id] ? S.prog[id].box : 0;
  return `<span class="notches" title="Niveau ${box} sur 6">${[1, 2, 3, 4, 5].map(i => `<i class="${box >= i ? 'on' : ''}"></i>`).join('')}</span>`;
}
function sectionHTML(sec, clip) {
  let html = '';
  let list = null;
  for (const b of sec.blocks) {
    if (b.t !== 'li' && list) { html += '<ul>' + list + '</ul>'; list = null; }
    if (b.t === 'li') list = (list || '') + `<li>${esc(b.text)}</li>`;
    else if (b.t === 'p') html += `<p>${esc(b.text)}</p>`;
    else if (b.t === 'label') html += `<div class="lbl">${esc(b.text)}</div>`;
    else if (b.t === 'table') html += `<div class="tblwrap"><table>${b.rows.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('')}</table></div>`;
  }
  if (list) html += '<ul>' + list + '</ul>';
  return `<div class="doc${clip ? ' clip' : ''}">${html}</div>`;
}

function viewCard() {
  const ss = S.session;
  if (ss.i >= ss.queue.length) return viewEnd();
  const card = ss.queue[ss.i];
  const m = Engine.materialize(card, S.pools, String(ss.i));
  if (!m) { ss.i++; return viewCard(); }
  const ref = S.secById[card.sec];
  const d = S.docByKey[card.doc];
  setHeader(MODES.find(x => x.id === ss.mode).name, true);
  const head = `<div class="session-top"><div class="progress"><i style="width:${100 * ss.i / ss.queue.length}%"></i></div><span class="n">${ss.i + 1} / ${ss.queue.length}</span></div>`;
  const src = `<p class="src">${esc(d.title)}${ref && ref.s.path.length ? ' › ' + esc(ref.s.path[ref.s.path.length - 1]) : ''}</p>`;
  let body = m.fact && m.fact.lead ? `<p class="note" style="margin:0 0 6px">${esc(m.fact.lead)}</p>` : '';
  if (m.type === 'qcm') {
    body += `<p class="prompt ruled">${esc(m.before)}<span class="blank" aria-label="à compléter"></span>${esc(m.after)}</p>
      <div class="choices">${m.choices.map((c, i) => `<button class="choice" data-c="${esc(c)}"><kbd>${i + 1}</kbd>${esc(c)}</button>`).join('')}</div>`;
  } else if (m.type === 'vf') {
    body += `<p class="prompt ruled">${esc(m.before)}<mark class="hl">${esc(m.shown)}</mark>${esc(m.after)}</p>
      <div class="duo"><button class="btn" data-vf="1">Vrai</button><button class="btn" data-vf="0">Faux</button></div>`;
  } else {
    const path = ref.s.path;
    body = `<p class="prompt">${path.length > 1 ? `<span style="color:var(--muted);font-size:16px">${esc(path.slice(0, -1).join(' › '))}</span><br>` : ''}${esc(path[path.length - 1])}</p>
      <p class="note" style="margin:12px 0 0">Récitez ou notez les points essentiels de cette section, puis retournez la carte.</p>
      <button class="btn primary block next" id="flip">Retourner la carte</button>`;
  }
  app.innerHTML = head + `<article class="card"><div class="tab">${esc(d.theme)}</div><div class="face">${notches(card.id)}${src}${body}<div id="after"></div></div></article>
    <div class="small-actions"><button class="linkbtn" id="skip">Passer</button><button class="linkbtn" id="susp">Retirer cette carte</button></div>`;

  const after = $('#after');
  const ctx = () => ref ? `<details class="ctx"><summary>Voir la section de la fiche</summary>${sectionHTML(ref.s)}</details>` : '';
  const finish = (grade, html) => {
    record(card, grade, m.good);
    after.innerHTML = `<div class="reveal">${html}${ctx()}<button class="btn primary block next" id="nxt">Continuer</button></div>`;
    $('#nxt').focus({ preventScroll: true });
    $('#nxt').onclick = () => { ss.i++; viewCard(); };
  };
  if (m.type === 'qcm') {
    const btns = [...app.querySelectorAll('.choice')];
    btns.forEach(b => b.onclick = () => {
      const ok = b.dataset.c === m.good;
      btns.forEach(x => { x.disabled = true; if (x.dataset.c === m.good) x.classList.add('ok'); });
      if (!ok) b.classList.add('ko');
      $('.prompt').innerHTML = `${esc(m.before)}<mark class="hl ok">${esc(m.good)}</mark>${esc(m.after)}`;
      finish(ok ? 2 : 0, `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Exact.' : 'La bonne réponse est ' + esc(m.good) + '.'}</p>`);
    });
  } else if (m.type === 'vf') {
    const btns = [...app.querySelectorAll('[data-vf]')];
    btns.forEach(b => b.onclick = () => {
      const said = b.dataset.vf === '1';
      const ok = said === m.truth;
      btns.forEach(x => x.disabled = true);
      $('.prompt').innerHTML = m.truth ? `${esc(m.before)}<mark class="hl ok">${esc(m.good)}</mark>${esc(m.after)}`
        : `${esc(m.before)}<mark class="hl ko">${esc(m.shown)}</mark> <mark class="hl ok">${esc(m.good)}</mark>${esc(m.after)}`;
      finish(ok ? 2 : 0, `<p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Exact' : 'Non'} : la phrase était ${m.truth ? 'vraie' : 'fausse, le texte indique ' + esc(m.good)}.</p>`);
    });
  } else {
    $('#flip').onclick = () => {
      $('#flip').remove();
      after.innerHTML = `<div class="reveal" style="margin-top:16px">${sectionHTML(ref.s)}
        <p class="note" style="margin:14px 0 0">Comment s’est passée la restitution ?</p>
        <div class="trio"><button class="btn" data-g="0">À revoir</button><button class="btn" data-g="1">Partielle</button><button class="btn" data-g="2">Complète</button></div></div>`;
      app.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { record(card, +b.dataset.g); ss.i++; viewCard(); });
    };
  }
  $('#skip').onclick = () => { ss.i++; viewCard(); };
  $('#susp').onclick = async () => {
    if (!confirm('Retirer définitivement cette carte des révisions ?')) return;
    S.meta.suspended.push(card.id); await saveMeta();
    S.cards = S.cards.filter(c => c.id !== card.id);
    ss.queue.splice(ss.i, 1); toast('Carte retirée.'); viewCard();
  };
}

function record(card, grade, attendu) {
  const ss = S.session;
  const ref = S.secById[card.sec], d = S.docByKey[card.doc];
  queueResult({ src: 'auto', type: card.type, fiche: d ? d.title : '', section: ref && ref.s.path.length ? ref.s.path[ref.s.path.length - 1] : '', attendu: attendu || null, note: grade });
  const p = Engine.schedule(S.prog[card.id], grade, Date.now());
  S.prog[card.id] = p;
  DB.put('progress', p, card.id);
  ss.answered++;
  if (grade > 0) ss.good++;
  else if (!ss.retried.has(card.id)) { // on la repropose plus loin dans la session
    ss.retried.add(card.id);
    ss.queue.splice(Math.min(ss.queue.length, ss.i + 4), 0, card);
  }
  if (!S.meta.days.includes(today())) { S.meta.days = S.meta.days.slice(-400).concat(today()); saveMeta(); }
}

function viewEnd() {
  const ss = S.session; ss.done = true;
  flushResults();
  const pct = ss.answered ? Math.round(100 * ss.good / ss.answered) : 0;
  const c = counts(MODES[0].types);
  setHeader('Session terminée', true);
  app.innerHTML = `<section class="today"><div class="stack"><div class="under"></div><div class="sheet">
    <p class="score">${pct} %</p>
    <p>${plural(ss.good, 'bonne réponse', 'bonnes réponses')} sur ${ss.answered}. ${c.due ? plural(c.due, 'carte') + ' restent à revoir aujourd’hui.' : 'Plus rien n’est en retard.'}</p>
    <div class="row"><button class="btn primary" id="again">Nouvelle session</button><button class="btn" id="home">Accueil</button></div>
  </div></div></section>`;
  $('#again').onclick = () => startSession(ss.mode);
  $('#home').onclick = () => { S.session = null; go('#accueil'); };
}

/* ====== lecture ====== */
function viewLibrary() {
  setHeader('Lire la base', true);
  const groups = {};
  S.docs.forEach(d => (groups[d.theme] = groups[d.theme] || []).push(d));
  app.innerHTML = `<input class="search" id="q" type="search" placeholder="Chercher dans la base : abattement, 790 G, usufruit…" autocomplete="off">
    <div id="res"></div>
    <div id="list">${Engine.THEMES.filter(t => groups[t]).map(t => `<h3 class="sec">${esc(t)}</h3><div class="doclist">${groups[t].map(d =>
      `<button data-k="${d.key}">${esc(d.title)}<span>${d.updated ? 'Mise à jour du ' + esc(d.updated) : esc(d.file)}</span></button>`).join('')}</div>`).join('')}</div>`;
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => go('#fiche-' + b.dataset.k));
  let timer;
  $('#q').oninput = e => { clearTimeout(timer); timer = setTimeout(() => search(e.target.value), 180); };
}
function search(q) {
  q = q.trim().toLowerCase();
  const res = $('#res'), list = $('#list');
  if (q.length < 3) { res.innerHTML = ''; list.classList.remove('hidden'); return; }
  list.classList.add('hidden');
  const hits = [];
  outer: for (const d of S.docs) for (const s of d.sections) {
    for (const b of s.blocks) {
      const t = b.text || (b.rows ? b.rows.flat().join(' ') : '');
      const i = t.toLowerCase().indexOf(q);
      if (i >= 0) {
        hits.push({ d, s, snip: (i > 60 ? '…' : '') + t.slice(Math.max(0, i - 60), i + 120) + '…' });
        if (hits.length >= 60) break outer;
        break;
      }
    }
  }
  res.innerHTML = hits.length ? hits.map(h => `<button class="hit" data-k="${h.d.key}" data-s="${h.s.id}"><b>${esc(h.d.title)} › ${esc(h.s.title)}</b>${esc(h.snip)}</button>`).join('')
    : `<p class="note">Aucun passage ne contient « ${esc(q)} ». Essayez un terme plus court ou un numéro d’article.</p>`;
  res.querySelectorAll('.hit').forEach(b => b.onclick = () => { S.jump = b.dataset.s; go('#fiche-' + b.dataset.k); });
}
function viewDoc(key) {
  const d = S.docByKey[key];
  if (!d) return go('#lire');
  setHeader(d.theme, true);
  let toc = '', body = '';
  let prev = [];
  d.sections.forEach(s => {
    for (let i = 0; i < s.path.length - 1; i++) {
      if (prev[i] !== s.path[i]) { const h = Math.min(4, i + 2); body += `<h${h}>${esc(s.path[i])}</h${h}>`; prev = prev.slice(0, i).concat(s.path[i]); }
    }
    const lvl = Math.min(4, s.path.length + 1);
    if (s.path.length) {
      body += `<h${lvl} id="s-${s.id}">${esc(s.title)}</h${lvl}>`;
      if (s.path.length <= 2) toc += `<a href="#" data-s="${s.id}" class="l${s.path.length}">${esc(s.title)}</a>`;
    }
    prev = s.path.slice();
    body += sectionHTML(s).replace(/^<div class="doc">|<\/div>$/g, '');
  });
  const n = S.cards.filter(c => c.doc === key).length;
  app.innerHTML = `<h2 style="font:600 26px/1.2 var(--serif);margin:10px 0 6px">${esc(d.title)}</h2>
    <p class="note">${d.updated ? 'Mise à jour du ' + esc(d.updated) + '. ' : ''}${n} cartes tirées de cette fiche.</p>
    <div class="row" style="margin:14px 0"><button class="btn primary" id="drill">Réviser cette fiche</button></div>
    ${toc ? `<nav class="toc" aria-label="Sommaire">${toc}</nav>` : ''}<div class="doc">${body}</div>`;
  $('#drill').onclick = () => startSession('mix', key);
  app.querySelectorAll('.toc a').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById('s-' + a.dataset.s).scrollIntoView({ behavior: 'smooth' }); });
  if (S.jump) { const el = document.getElementById('s-' + S.jump); S.jump = null; if (el) setTimeout(() => el.scrollIntoView(), 50); }
}

/* ====== import / base ====== */
function importBlock() {
  return `<div class="drop" id="drop">
    <p style="margin:0 0 14px">Glissez ici les fichiers Word de votre dossier BASE, ou choisissez-les.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" id="pickFiles">Choisir les fichiers</button><button class="btn" id="pickDir">Choisir le dossier</button></div>
  </div><div class="log" id="log"></div>`;
}
function bindImport() {
  $('#pickFiles').onclick = () => $('#fileInput').click();
  $('#pickDir').onclick = () => $('#dirInput').click();
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || !('webkitdirectory' in document.createElement('input'))) $('#pickDir').remove();
  const drop = $('#drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); };
}
$('#fileInput').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
$('#dirInput').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };

async function importFiles(files) {
  files = files.filter(f => /\.(docx|md|txt)$/i.test(f.name) && !f.name.startsWith('~$'));
  const log = $('#log');
  if (!files.length) { toast('Aucun fichier Word (.docx) dans la sélection.'); return; }
  let added = 0, updated = 0, same = 0, failed = 0;
  const seenSig = new Set(S.docs.map(d => d.sig));
  for (const f of files) {
    try {
      const doc = await Engine.parseFile(f.name, await f.arrayBuffer(), JSZip, DOMParser);
      if (!doc.sections.length) throw new Error('aucun contenu lisible');
      const old = S.docByKey[doc.key];
      if (old && old.sig === doc.sig) { same++; continue; }
      if (!old && seenSig.has(doc.sig)) { same++; continue; } // doublon (copie « (1) »)
      await DB.put('docs', doc);
      seenSig.add(doc.sig);
      const i = S.docs.findIndex(d => d.key === doc.key);
      if (i >= 0) { S.docs[i] = doc; updated++; } else { S.docs.push(doc); S.docByKey[doc.key] = doc; added++; }
      if (log) log.insertAdjacentHTML('afterbegin', `<div>${old ? 'Mise à jour' : 'Ajoutée'} : ${esc(doc.title)}</div>`);
    } catch (e) {
      failed++;
      if (log) log.insertAdjacentHTML('afterbegin', `<div style="color:var(--ko)">Illisible : ${esc(f.name)} (${esc(e.message)})</div>`);
    }
  }
  rebuild();
  const parts = [];
  if (added) parts.push(plural(added, 'fiche ajoutée', 'fiches ajoutées'));
  if (updated) parts.push(plural(updated, 'fiche mise à jour', 'fiches mises à jour'));
  if (same) parts.push(plural(same, 'déjà à jour', 'déjà à jour'));
  if (failed) parts.push(plural(failed, 'fichier illisible', 'fichiers illisibles'));
  toast(parts.join(', ') + '.');
  if (added || updated) setTimeout(() => go('#accueil'), 900);
}

function viewEmpty() {
  setHeader(null, false);
  $('#btnRead').classList.add('hidden');
  app.innerHTML = claudeBlock() + `<section class="today"><div class="stack"><div class="under"></div><div class="sheet">
    <h2 style="font-size:22px">Cartes automatiques, en plus</h2>
    <p>Facultatif : importez vos fiches Word pour réviser aussi en cartes automatiques (chiffres clés, vrai ou faux, sections) et lire la base hors connexion. Les fiches restent sur cet appareil.</p>
    ${importBlock()}
  </div></div></section>
  <h3 class="sec">Depuis OneDrive</h3>
  <ol class="steps">
    <li>Sur ordinateur, avec OneDrive synchronisé : « Choisir le dossier », puis sélectionnez le dossier BASE.</li>
    <li>Sur iPhone : « Choisir les fichiers », onglet Parcourir, OneDrive, dossier BASE, Sélectionner, puis tout sélectionner.</li>
    <li>Sur Android : « Choisir les fichiers », menu, OneDrive, dossier BASE, puis appui long pour sélectionner plusieurs fichiers.</li>
  </ol>
  <p class="note">Une sauvegarde faite sur un autre appareil (menu Base) peut aussi être restaurée ici, fiches et progression comprises.</p>
  <button class="btn" id="restore">Restaurer une sauvegarde</button>`;
  bindImport();
  bindClaudeBlock();
  $('#restore').onclick = () => $('#restoreInput').click();
}

function viewBase() {
  setHeader('Base et réglages', true);
  const nCards = S.cards.length, seen = Object.keys(S.prog).length;
  app.innerHTML = `
  <h3 class="sec" style="margin-top:8px">Mettre à jour la base</h3>
  <p class="note">Réimportez le dossier BASE quand des fiches changent : seules les fiches nouvelles ou modifiées sont prises en compte, la progression est conservée.</p>
  ${importBlock()}
  <p class="note">${plural(S.docs.length, 'fiche')} chargées, ${nCards} cartes, dont ${seen} déjà travaillées.</p>

  <h3 class="sec">Rythme des sessions</h3>
  <p style="margin:0 0 8px">Cartes par session</p>
  <div class="seg" id="size">${[10, 20, 30, 50].map(n => `<button aria-pressed="${S.meta.size === n}" data-n="${n}">${n}</button>`).join('')}</div>
  <p style="margin:16px 0 8px">Nouvelles cartes par session, au maximum</p>
  <div class="seg" id="newp">${[5, 10, 20, 30].map(n => `<button aria-pressed="${S.meta.newPerSession === n}" data-n="${n}">${n}</button>`).join('')}</div>

  <h3 class="sec">Sessions préparées par Claude</h3>
  <p class="note">À la fin de chaque session, l’état (terminée, score, erreurs, programme) est publié sur le site. La tâche Cowork le consulte toutes les heures et prépare la session suivante. Le token reste sur cet appareil.</p>
  <input class="search" id="tok" type="password" placeholder="Token GitHub (github_pat_…)" autocomplete="off" value="${ghToken() ? '••••••••' : ''}">
  <div class="row"><button class="btn" id="saveTok">Enregistrer le token</button>${ghToken() ? '<button class="btn" id="delTok">Oublier le token</button>' : ''}</div>
  <p class="note" id="tokState">${ghToken() ? 'Connecté à GitHub.' : 'Non connecté : Claude ne voit ni vos résultats ni votre programme.'}</p>
  <button class="btn" id="progBtn">Régler le programme de révision</button>

  <h3 class="sec">Sauvegarde</h3>
  <p class="note">La sauvegarde contient les fiches et la progression. Elle permet de passer de l’ordinateur au téléphone sans réimporter le dossier BASE.</p>
  <div class="row"><button class="btn" id="backup">Télécharger une sauvegarde</button><button class="btn" id="restore">Restaurer une sauvegarde</button></div>

  <h3 class="sec">Fiches chargées</h3>
  <div class="doclist">${S.docs.map(d => `<button data-del="${d.key}">${esc(d.title)}<span>${d.sections.length} sections. Toucher pour retirer cette fiche.</span></button>`).join('')}</div>
  <div class="foot"><button class="btn" id="resetProg">Remettre la progression à zéro</button><button class="btn" id="wipe">Tout effacer de cet appareil</button></div>`;
  bindImport();
  const seg = (id, key) => app.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { S.meta[key] = +b.dataset.n; saveMeta(); viewBase(); });
  seg('size', 'size'); seg('newp', 'newPerSession');
  $('#backup').onclick = backup;
  $('#progBtn').onclick = () => go('#programme');
  $('#saveTok').onclick = async () => {
    const v = $('#tok').value.trim();
    if (!v || v.startsWith('••')) { $('#tokState').textContent = 'Collez un token qui commence par github_pat_.'; return; }
    $('#tokState').textContent = 'Vérification…';
    const r = await fetch('https://api.github.com/repos/' + GH.repo, { headers: { Authorization: 'Bearer ' + v } }).catch(() => null);
    if (!r || !r.ok) { $('#tokState').textContent = 'Ce token n’a pas accès au dépôt ' + GH.repo + '. Vérifiez-le puis réessayez.'; return; }
    try { localStorage.setItem('rev-gh-token', v); } catch (e) {}
    await flushResults(true); viewBase(); toast('Token enregistré.');
  };
  if ($('#delTok')) $('#delTok').onclick = () => { try { localStorage.removeItem('rev-gh-token'); } catch (e) {} viewBase(); };
  $('#restore').onclick = () => $('#restoreInput').click();
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const d = S.docByKey[b.dataset.del];
    if (!confirm(`Retirer « ${d.title} » de la base sur cet appareil ?`)) return;
    await DB.del('docs', d.key); S.docs = S.docs.filter(x => x.key !== d.key); rebuild(); viewBase();
  });
  $('#resetProg').onclick = async () => {
    if (!confirm('Effacer toute la progression ? Les fiches restent chargées.')) return;
    await DB.clear('progress'); S.prog = {}; S.meta.days = []; S.meta.suspended = []; await saveMeta(); rebuild(); toast('Progression remise à zéro.');
  };
  $('#wipe').onclick = async () => {
    if (!confirm('Effacer les fiches et la progression de cet appareil ?')) return;
    await Promise.all([DB.clear('docs'), DB.clear('progress'), DB.clear('meta')]);
    S.docs = []; S.prog = {}; S.meta.days = []; S.meta.suspended = []; S.meta.themesOff = []; rebuild(); go('#accueil');
  };
}

async function backup() {
  const data = { app: 'revision-base', v: 1, at: new Date().toISOString(), meta: S.meta, docs: S.docs, progress: S.prog };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `revision-base-${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: 'Sauvegarde révision' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('#restoreInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'revision-base') throw new Error('format');
    await Promise.all([DB.clear('docs'), DB.clear('progress')]);
    for (const d of data.docs) await DB.put('docs', d);
    for (const [k, v] of Object.entries(data.progress || {})) await DB.put('progress', v, k);
    S.meta = Object.assign(S.meta, data.meta || {}); await saveMeta();
    S.docs = data.docs; S.prog = data.progress || {}; rebuild();
    toast(`Sauvegarde restaurée : ${plural(S.docs.length, 'fiche')}.`); go('#accueil');
  } catch (err) { toast('Ce fichier n’est pas une sauvegarde de cette application.'); }
};

/* ====== sessions préparées par Claude + état partagé (data/etat.json) ====== */
const GH = { repo: 'Yvanov40/public', dir: 'revision/data' };
const PROG_DEFAUT = { nb_questions: 40, fiches: [], consignes: '' };
function ghToken() { try { return localStorage.getItem('rev-gh-token') || ''; } catch (e) { return ''; } }
function toB64(str) { const u = new TextEncoder().encode(str); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); }
function fromB64(b) { return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), c => c.charCodeAt(0))); }
function programme() { return Object.assign({}, PROG_DEFAUT, S.meta.programme || {}); }

/* Chaque réponse alimente les statistiques par fiche et la liste des erreurs récentes */
function queueResult(e) {
  if (e.fin) return;
  const st = S.meta.ficheStats = S.meta.ficheStats || {};
  const ok = e.src === 'claude' ? !!e.ok : e.note > 0;
  if (e.fiche) {
    const f = st[e.fiche] = st[e.fiche] || { vues: 0, reussies: 0 };
    f.vues++; if (ok) f.reussies++; f.derniere = new Date().toISOString().slice(0, 10);
  }
  if (!ok) {
    const err = { le: new Date().toISOString().slice(0, 16), fiche: e.fiche || '', source: e.src };
    if (e.question) { err.question = e.question; err.repondu = e.choisi; err.bonne_reponse = e.bonne; }
    else { err.section = e.section || ''; err.attendu = e.attendu || ''; }
    S.meta.erreurs = (S.meta.erreurs || []).concat(err).slice(-80);
  }
  S.meta.dirty = true;
  saveMeta();
}
function etatJSON() {
  const c = S.claude, done = c && (S.meta.claudeDone || []).includes(c.id);
  const last = S.meta.claudeLast || {};
  return {
    app: 'revision-base',
    mis_a_jour: new Date().toISOString(),
    session_id: c ? c.id : null,
    statut: !c ? 'aucune' : done ? 'terminee' : 'en_cours',
    termine_le: done && last.id === c.id ? last.le : null,
    score: done && last.id === c.id ? last.score : null,
    total: done && last.id === c.id ? last.total : null,
    programme: programme(),
    erreurs_recentes: (S.meta.erreurs || []).slice(-40),
    stats_par_fiche: S.meta.ficheStats || {}
  };
}
let pushing = null;
function flushResults(force) {
  if (pushing) return pushing;
  const tok = ghToken();
  if (!tok || (!S.meta.dirty && !force)) return Promise.resolve(false);
  pushing = (async () => {
    const url = `https://api.github.com/repos/${GH.repo}/contents/${GH.dir}/etat.json`;
    const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha;
      const g = await fetch(url + '?ref=main&t=' + Date.now(), { headers: h, cache: 'no-store' });
      if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error('lecture ' + g.status);
      const et = etatJSON();
      const body = { message: `Révision : état ${et.statut}${et.score !== null ? ' ' + et.score + '/' + et.total : ''}`, content: toB64(JSON.stringify(et, null, 1)), branch: 'main' };
      if (sha) body.sha = sha;
      const p = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify(body) });
      if (p.ok) { S.meta.dirty = false; await saveMeta(); return true; }
      if (p.status !== 409 && p.status !== 422) throw new Error('écriture ' + p.status);
    }
    return false;
  })().catch(e => { console.warn('Synchronisation', e); return false; }).finally(() => { pushing = null; });
  return pushing;
}
async function loadClaude() {
  try {
    const [r, k] = await Promise.all([
      fetch('data/session-claude.json?t=' + Date.now(), { cache: 'no-store' }),
      fetch('data/catalogue.json?t=' + Date.now(), { cache: 'no-store' }).catch(() => null)
    ]);
    if (k && k.ok) { try { S.catalogue = (await k.json()).fiches || null; } catch (e) {} }
    if (!r.ok) return;
    const c = await r.json();
    if (!c || !c.id || !Array.isArray(c.questions) || !c.questions.length) return;
    const changed = !S.claude || S.claude.id !== c.id;
    S.claude = c;
    if (changed) {
      if (!S.meta.claudeSeen || S.meta.claudeSeen !== c.id) { S.meta.claudeSeen = c.id; S.meta.dirty = true; saveMeta(); flushResults(); }
      if (/^#?(accueil)?$/.test(location.hash) && !S.session && !S.cs) route();
    }
  } catch (e) {}
}
function claudeBlock() {
  const c = S.claude;
  if (!c) return '';
  const done = (S.meta.claudeDone || []).includes(c.id);
  const pr = S.meta.claudeProgress && S.meta.claudeProgress.id === c.id && !S.meta.claudeProgress.replay ? S.meta.claudeProgress : null;
  const last = S.meta.claudeLast && S.meta.claudeLast.id === c.id ? S.meta.claudeLast : null;
  let line, actions;
  if (done) {
    line = `Terminée${last ? ' avec ' + last.score + ' / ' + last.total : ''}. Claude prépare la suivante : elle apparaîtra ici dans l’heure, entre 8 h et 20 h. En attendant, vous pouvez la refaire.`;
    actions = `<button class="btn primary block" id="startClaude">Refaire la session</button>`;
  } else {
    line = `${plural(c.questions.length, 'question')}. ${esc(c.pourquoi || '')}`;
    actions = pr ? `<button class="btn primary block" id="startClaude">Reprendre à la question ${pr.i + 1}</button>` : `<button class="btn primary block" id="startClaude">Commencer</button>`;
  }
  return `<article class="card" style="margin:34px 0 8px"><div class="tab">Préparée par Claude</div><div class="face">
    <h2 style="font:600 22px/1.25 var(--serif);margin:0 0 6px">${esc(c.titre || 'Session du moment')}</h2>
    <p class="note" style="margin:0 0 16px">${done ? esc(line) : line}</p>
    ${actions}
    <div class="small-actions"><button class="linkbtn" id="toProg">Régler le programme</button>${ghToken() ? '' : '<button class="linkbtn" id="toTok">Connecter GitHub</button>'}</div></div></article>`;
}
function bindClaudeBlock() {
  const b = $('#startClaude'); if (b) b.onclick = () => startClaude();
  const p = $('#toProg'); if (p) p.onclick = () => go('#programme');
  const t = $('#toTok'); if (t) t.onclick = () => go('#base');
}
function startClaude(only) {
  const c = S.claude;
  const done = (S.meta.claudeDone || []).includes(c.id);
  const pr = S.meta.claudeProgress;
  if (!only && pr && pr.id === c.id && !pr.replay && !done) { S.cs = pr; return go('#claude'); }
  S.cs = { id: c.id, idx: only || c.questions.map((_, i) => i), i: 0, good: 0, miss: [], replay: done || !!only };
  S.meta.claudeProgress = S.cs; saveMeta();
  go('#claude');
}
function viewClaudeQ() {
  const cs = S.cs, c = S.claude;
  if (!c || c.id !== cs.id) { S.cs = null; return go('#accueil'); }
  setHeader(cs.replay ? 'Session refaite' : 'Préparée par Claude', true);
  if (cs.i >= cs.idx.length) return viewClaudeEnd();
  const k = cs.idx[cs.i], q = c.questions[k];
  app.innerHTML = `<div class="session-top"><div class="progress"><i style="width:${100 * cs.i / cs.idx.length}%"></i></div><span class="n">${cs.i + 1} / ${cs.idx.length}</span></div>
  <article class="card"><div class="tab">${esc(q.theme || Engine.themeOf(q.fiche || ''))}</div><div class="face">
    <p class="src">${esc(q.fiche || '')}</p>
    <p class="prompt">${esc(q.question)}</p>
    <div class="choices">${q.choix.map((o, j) => `<button class="choice" data-j="${j}"><kbd>${j + 1}</kbd>${esc(o)}</button>`).join('')}</div>
    <div id="after"></div></div></article>`;
  const btns = [...app.querySelectorAll('.choice')];
  btns.forEach(b => b.onclick = () => {
    const j = +b.dataset.j, ok = j === q.reponse;
    btns.forEach(x => { x.disabled = true; if (+x.dataset.j === q.reponse) x.classList.add('ok'); });
    if (!ok) { b.classList.add('ko'); cs.miss.push(k); } else cs.good++;
    if (!cs.replay) queueResult({ src: 'claude', fiche: q.fiche || '', question: q.question, choisi: q.choix[j], bonne: q.choix[q.reponse], ok });
    cs.i++; S.meta.claudeProgress = cs; saveMeta();
    $('#after').innerHTML = `<div class="reveal"><p class="verdict ${ok ? 'ok' : 'ko'}">${ok ? 'Exact.' : 'La bonne réponse est : ' + esc(q.choix[q.reponse]) + '.'}</p>
      ${q.explication ? `<p class="doc" style="margin:8px 0 0">${esc(q.explication)}</p>` : ''}
      <button class="btn primary block next" id="nxt">${cs.i < cs.idx.length ? 'Question suivante' : 'Voir le résultat'}</button></div>`;
    $('#nxt').focus({ preventScroll: true });
    $('#nxt').onclick = () => viewClaudeQ();
  });
}
function viewClaudeEnd() {
  const cs = S.cs, c = S.claude;
  if (!cs.replay && !(S.meta.claudeDone || []).includes(c.id)) {
    S.meta.claudeDone = (S.meta.claudeDone || []).concat(c.id).slice(-200);
    S.meta.claudeLast = { id: c.id, score: cs.good, total: cs.idx.length, le: new Date().toISOString() };
    if (!S.meta.days.includes(today())) S.meta.days = S.meta.days.concat(today());
    S.meta.dirty = true;
  }
  S.meta.claudeProgress = null; saveMeta();
  const tok = ghToken();
  app.innerHTML = `<section class="today"><div class="stack"><div class="under"></div><div class="sheet">
    <p class="score">${cs.good} / ${cs.idx.length}</p>
    <p>${cs.miss.length ? plural(cs.miss.length, 'question') + ' à revoir.' : 'Sans faute.'} <span id="syncMsg">${cs.replay ? 'Session refaite : la prochaine session de Claude n’est pas affectée.' : tok ? 'Envoi du résultat à Claude…' : 'Connectez GitHub dans Base et réglages pour que Claude prépare la session suivante.'}</span></p>
    <div class="row">${cs.miss.length ? '<button class="btn primary" id="rv">Rejouer mes erreurs</button>' : ''}<button class="btn" id="redo">Refaire toute la session</button><button class="btn" id="home">Accueil</button></div>
  </div></div></section>`;
  if ($('#rv')) $('#rv').onclick = () => startClaude(cs.miss.slice());
  $('#redo').onclick = () => startClaude(c.questions.map((_, i) => i));
  $('#home').onclick = () => { S.cs = null; go('#accueil'); };
  if (!cs.replay && tok) flushResults().then(ok => { const m = $('#syncMsg'); if (m) m.textContent = ok ? 'Résultat envoyé : Claude prépare la session suivante, elle apparaîtra dans l’heure (entre 8 h et 20 h).' : 'Envoi impossible pour l’instant, nouvel essai à la prochaine ouverture.'; });
}

/* ====== programme de révision (modulable) ====== */
function viewProgramme() {
  setHeader('Programme de révision', true);
  const pr = programme();
  const titles = (S.catalogue && S.catalogue.length ? S.catalogue : S.docs.map(d => d.title)).slice().sort((a, b) => a.localeCompare(b, 'fr'));
  const sel = new Set(pr.fiches.length ? pr.fiches : titles);
  const groups = {};
  titles.forEach(t => (groups[Engine.themeOf(t)] = groups[Engine.themeOf(t)] || []).push(t));
  app.innerHTML = `<p class="note" style="margin-top:8px">Claude construit chaque session à partir de ce programme. Les changements comptent dès la prochaine session.</p>
  <h3 class="sec">Questions par session</h3>
  <div class="seg" id="nb">${[20, 40, 60, 80].map(n => `<button aria-pressed="${pr.nb_questions === n}" data-n="${n}">${n}</button>`).join('')}</div>
  <h3 class="sec">Consignes pour Claude</h3>
  <textarea class="search" id="cons" rows="4" style="resize:vertical;font:inherit" placeholder="Exemples : insiste sur les cas pratiques chiffrés ; plus de questions sur le Dutreil ; évite l’historique des anciens régimes.">${esc(pr.consignes)}</textarea>
  <h3 class="sec">Fiches à réviser</h3>
  ${titles.length ? `<div class="row" style="margin-bottom:8px"><button class="btn" id="all">Tout cocher</button><button class="btn" id="none">Tout décocher</button></div>
  ${Engine.THEMES.filter(t => groups[t]).map(t => `<h4 style="margin:18px 0 4px;font:600 14px var(--sans);color:var(--muted)"><label><input type="checkbox" data-th="${esc(t)}" style="accent-color:var(--teal)"> ${esc(t)}</label></h4>
    ${groups[t].map(f => `<label class="theme" style="grid-template-columns:auto 1fr;padding:8px 4px"><input type="checkbox" data-f="${esc(f)}" ${sel.has(f) ? 'checked' : ''}><span style="font-size:15px">${esc(f)}</span></label>`).join('')}`).join('')}`
    : '<p class="note">La liste des fiches apparaîtra après le premier passage de Claude, ou après un import du dossier BASE.</p>'}
  <div class="foot"><button class="btn primary block" id="saveProg">Enregistrer le programme</button><p class="note" id="progState">${ghToken() ? '' : 'Connectez GitHub dans Base et réglages : sans cela, Claude ne voit pas votre programme.'}</p></div>`;
  let nb = pr.nb_questions;
  app.querySelectorAll('#nb button').forEach(b => b.onclick = () => { nb = +b.dataset.n; app.querySelectorAll('#nb button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const boxes = () => [...app.querySelectorAll('[data-f]')];
  const syncTh = () => app.querySelectorAll('[data-th]').forEach(cb => { const fs = groups[cb.dataset.th].map(f => boxes().find(x => x.dataset.f === f)); cb.checked = fs.every(x => x.checked); cb.indeterminate = !cb.checked && fs.some(x => x.checked); });
  syncTh();
  boxes().forEach(b => b.onchange = syncTh);
  app.querySelectorAll('[data-th]').forEach(cb => cb.onchange = () => { groups[cb.dataset.th].forEach(f => { boxes().find(x => x.dataset.f === f).checked = cb.checked; }); syncTh(); });
  if ($('#all')) { $('#all').onclick = () => { boxes().forEach(b => b.checked = true); syncTh(); }; $('#none').onclick = () => { boxes().forEach(b => b.checked = false); syncTh(); }; }
  $('#saveProg').onclick = async () => {
    const chosen = boxes().filter(b => b.checked).map(b => b.dataset.f);
    if (titles.length && !chosen.length) { $('#progState').textContent = 'Cochez au moins une fiche.'; return; }
    S.meta.programme = { nb_questions: nb, fiches: chosen.length === titles.length ? [] : chosen, consignes: $('#cons').value.trim().slice(0, 1500) };
    S.meta.dirty = true; await saveMeta();
    if (!ghToken()) { $('#progState').textContent = 'Programme enregistré sur cet appareil. Connectez GitHub pour que Claude le reçoive.'; return; }
    $('#progState').textContent = 'Envoi…';
    const ok = await flushResults(true);
    $('#progState').textContent = ok ? 'Programme envoyé à Claude.' : 'Envoi impossible : vérifiez le token dans Base et réglages.';
  };
}

/* ====== divers ====== */
let toastT;
function toast(msg, action) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.fn; t.appendChild(b); }
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), action ? 15000 : 3500);
}
document.addEventListener('keydown', e => {
  if (!S.session || location.hash !== '#session' || e.target.tagName === 'INPUT') return;
  const nxt = $('#nxt');
  if ((e.key === 'Enter' || e.key === ' ') && nxt) { e.preventDefault(); nxt.click(); return; }
  if (/^[1-4]$/.test(e.key)) { const b = app.querySelectorAll('.choice:not(:disabled)')[+e.key - 1]; if (b) b.click(); }
  if (e.key.toLowerCase() === 'v') { const b = app.querySelector('[data-vf="1"]:not(:disabled)'); if (b) b.click(); }
  if (e.key.toLowerCase() === 'f') { const b = app.querySelector('[data-vf="0"]:not(:disabled)'); if (b) b.click(); }
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller)
          toast('Nouvelle version disponible.', { label: 'Recharger', fn: () => { nw.postMessage('skip'); location.reload(); } });
      });
    });
  }).catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
load().then(() => { route(); loadClaude(); flushResults(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { loadClaude(); flushResults(); } });
