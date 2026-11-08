/* Moteur de révision : lit les fiches (docx ou texte/markdown), les découpe
   en sections et en extrait des cartes (QCM chiffres clés, vrai/faux, fiches).
   Fonctionne dans le navigateur ; exporté aussi pour Node (tests). */
(function (root) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  /* ---------- utilitaires ---------- */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }
  const clean = s => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripNum = s => s.replace(/\*+/g, '').replace(/^\s*(?:[IVX]+|\d+(?:\.\d+)*|[A-Za-z])[.)]\s*/, '').replace(/^\s*\d+(?:\.\d+)+\s+/, '').trim();

  function titleFromFilename(name) {
    let t = name.replace(/\.(docx|md|txt)$/i, '');
    t = t.replace(/\s*\(1\)$/, '').replace(/\set_ou\s/g, ' et/ou ').replace(/\s_\s/g, ' : ').replace(/___/g, ' : ').replace(/__/g, ' (').replace(/_/g, ' ');
    // « Titre (CGI. art. 41) » perdus par les noms de fichiers : on garde simple
    t = t.replace(/\s+:\s+/g, ' : ').replace(/\s+/g, ' ').trim();
    // parenthèses ouvertes non fermées issues du remplacement
    const open = (t.match(/\(/g) || []).length, close = (t.match(/\)/g) || []).length;
    if (open > close) t += ')'.repeat(open - close);
    return t;
  }

  /* ---------- thèmes ---------- */
  const THEMES = [
    ['Assurance-vie', /assurance[- ]vie/i],
    ['IFI', /\bIFI\b/],
    ['Plus-values', /plus-value|abattement de 500/i],
    ['Reports d’imposition', /report d.imposition|apport en soci|apport à une holding|151 (octies|nonies)/i],
    ['Transmission', /DMTG|donation|dons familiaux|présent d.usage|dutreil/i],
    ['Succession & couple', /succession|réserve|avantage matrimonial|quotité/i],
    ['Impôt sur le revenu', /\bIR\b|CEHR|CDHR|revenus fonciers|quotient/i],
    ['Immobilier', /SCPI|location|bail|malraux|monuments|jeanbrun|bailleur/i],
    ['Sociétés', /SAS|SARL|EURL|SPFPL|holding|société|démembrement/i]
  ];
  function themeOf(title) {
    for (const [name, rx] of THEMES) if (rx.test(title)) return name;
    return 'Autres';
  }

  /* ---------- lecture docx ---------- */
  function wAttr(el, name) { return el.getAttributeNS(W, name) || el.getAttribute('w:' + name); }
  function kids(el, name) {
    const out = [];
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === name) out.push(n);
    return out;
  }
  function first(el, name) { return el ? kids(el, name)[0] : undefined; }

  function readStyles(xml, DP) {
    const map = {};
    if (!xml) return map;
    const d = new DP().parseFromString(xml, 'application/xml');
    const styles = d.getElementsByTagNameNS(W, 'style');
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const id = wAttr(s, 'styleId');
      const nameEl = first(s, 'name');
      const name = nameEl ? (wAttr(nameEl, 'val') || '') : '';
      let lvl = null;
      const m = /(?:heading|titre|title)\s*(\d)/i.exec(name) || /^(?:heading|titre)(\d)$/i.exec(id || '');
      if (m) lvl = +m[1];
      else if (/^(title|titre)$/i.test(name)) lvl = 0;
      const ppr = first(s, 'pPr'), ol = first(ppr, 'outlineLvl');
      if (lvl === null && ol) lvl = +wAttr(ol, 'val') + 1;
      map[id] = { name, lvl };
    }
    return map;
  }

  function paraInfo(p, styles) {
    let text = '', bold = 0, total = 0;
    const walk = el => {
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        const ln = n.localName;
        if (ln === 'r') {
          const rpr = first(n, 'rPr');
          const b = first(rpr, 'b');
          const isBold = b && wAttr(b, 'val') !== '0' && wAttr(b, 'val') !== 'false';
          for (let c = n.firstChild; c; c = c.nextSibling) {
            if (c.nodeType !== 1) continue;
            if (c.localName === 't') { const t = c.textContent; text += t; total += t.trim().length; if (isBold) bold += t.trim().length; }
            else if (c.localName === 'tab') text += ' ';
            else if (c.localName === 'br') text += ' ';
          }
        } else if (ln === 'hyperlink' || ln === 'smartTag' || ln === 'ins' || ln === 'sdt' || ln === 'sdtContent' || ln === 'fldSimple') walk(n);
      }
    };
    walk(p);
    const ppr = first(p, 'pPr');
    const ps = first(ppr, 'pStyle');
    const styleId = ps ? wAttr(ps, 'val') : '';
    let lvl = styleId && styles[styleId] ? styles[styleId].lvl : null;
    const ol = first(ppr, 'outlineLvl');
    if (lvl === null && ol) lvl = +wAttr(ol, 'val') + 1;
    const list = !!first(ppr, 'numPr') || /list|liste|puce|bullet/i.test(styleId);
    return { text: clean(text), lvl, list, allBold: total > 0 && bold / total > 0.9 };
  }

  async function docxToLines(buf, JSZipLib, DP) {
    const zip = await JSZipLib.loadAsync(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Fichier Word illisible');
    const xml = await docFile.async('string');
    const stylesFile = zip.file('word/styles.xml');
    const styles = readStyles(stylesFile ? await stylesFile.async('string') : '', DP);
    const d = new DP().parseFromString(xml, 'application/xml');
    const body = d.getElementsByTagNameNS(W, 'body')[0];
    const lines = [];
    const visit = el => {
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        if (n.localName === 'p') {
          const info = paraInfo(n, styles);
          if (!info.text) continue;
          let lvl = info.lvl;
          // repli : paragraphe court tout en gras et numéroté = titre
          if ((lvl === null || lvl === undefined) && info.allBold && info.text.length < 140) {
            const m = /^\s*(\d+(?:\.\d+)*)\.?\s+\S/.exec(info.text);
            if (m) lvl = m[1].split('.').length + 1;
          }
          if (lvl !== null && lvl !== undefined && info.text.length < 200) lines.push({ k: 'h', lvl: Math.max(1, lvl), text: info.text });
          else lines.push({ k: info.list ? 'li' : 'p', text: info.text, bold: info.allBold });
        } else if (n.localName === 'tbl') {
          const rows = [];
          for (const tr of kids(n, 'tr')) {
            const row = [];
            for (const tc of kids(tr, 'tc')) {
              const parts = [];
              for (const p of tc.getElementsByTagNameNS(W, 'p')) { const t = paraInfo(p, styles).text; if (t) parts.push(t); }
              row.push(parts.join(' '));
            }
            if (row.some(c => c)) rows.push(row);
          }
          if (rows.length) lines.push({ k: 'table', rows });
        } else if (n.localName === 'sdt' || n.localName === 'sdtContent') visit(n);
      }
    };
    visit(body);
    return lines;
  }

  /* ---------- lecture texte / markdown ---------- */
  function mdInline(s) {
    return clean(s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__/g, '').replace(/(^|\s)\*([^*]+)\*/g, '$1$2').replace(/\\([*_\[\]()#.-])/g, '$1'));
  }
  function textToLines(txt) {
    const lines = [];
    const raw = txt.replace(/\r/g, '').split('\n');
    let table = null;
    for (let line of raw) {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(mdInline);
        if (!table) { table = { k: 'table', rows: [] }; lines.push(table); }
        table.rows.push(cells);
        continue;
      }
      table = null;
      if (!line.trim()) continue;
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { const t = mdInline(h[2]); if (t) lines.push({ k: 'h', lvl: h[1].length, text: t }); continue; }
      const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) { const t = mdInline(li[1]); if (t) lines.push({ k: 'li', text: t }); continue; }
      const t = mdInline(line);
      if (t) lines.push({ k: 'p', text: t, bold: /^\*\*.*\*\*$/.test(line.trim()) });
    }
    return lines;
  }

  /* ---------- structuration en sections ---------- */
  function linesToDoc(lines, filename) {
    let title = titleFromFilename(filename);
    let updated = '';
    const sections = [];
    const stack = [];
    let cur = { title: 'Introduction', path: [], blocks: [] };
    sections.push(cur);
    let inEx = false, idx = 0;
    for (const l of lines) {
      idx++;
      if (idx <= 3 && sections.length === 1 && !cur.blocks.length && (l.k === 'h' || (l.k === 'p' && l.bold)) && l.text.length < 220 && !/^Mis à jour/i.test(l.text)) {
        title = clean(l.text.replace(/\s*:\s*/g, ' : '));
        continue;
      }
      if (!updated && l.k === 'p') {
        const m = /^Mis à jour le (.+)$/i.exec(l.text);
        if (m) { updated = m[1]; continue; }
      }
      if (l.k === 'h') {
        const t = stripNum(l.text);
        if (!t) continue;
        while (stack.length && stack[stack.length - 1].lvl >= l.lvl) stack.pop();
        stack.push({ lvl: l.lvl, text: t });
        cur = { title: t, path: stack.map(s => s.text), blocks: [] };
        sections.push(cur);
        inEx = /exemple|illustration|cas pratique|application/i.test(t);
        continue;
      }
      if (l.k === 'table') { cur.blocks.push(inEx ? { t: 'table', rows: l.rows, ex: 1 } : { t: 'table', rows: l.rows }); continue; }
      if (/^(remarque|attention|exemples?|précisions?|à noter|important|illustration|en pratique)\s*:?$/i.test(l.text)) {
        inEx = /exemple|illustration/i.test(l.text);
        cur.blocks.push({ t: 'label', text: l.text.replace(/\s*:$/, '') }); continue;
      }
      // titre en gras non numéroté, isolé : sous-titre léger
      if (l.k === 'p' && l.bold && l.text.length < 110 && !/[.;]$/.test(l.text) && sections.length === 1 && !cur.blocks.length) {
        // première ligne en gras = titre du document dans les exports texte
        continue;
      }
      const blk = { t: l.k === 'li' ? 'li' : 'p', text: l.text };
      if (inEx || /^(exemple|illustration)\s*:/i.test(l.text)) blk.ex = 1;
      cur.blocks.push(blk);
    }
    const docKey = hash(title.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç]+/g, ''));
    const out = sections.filter(s => s.blocks.length).map((s, i) => ({
      id: docKey + '-' + hash(s.path.join('>') + '|' + i),
      title: s.title, path: s.path, blocks: s.blocks
    }));
    return { key: docKey, title, theme: themeOf(title), updated, file: filename, sections: out, importedAt: Date.now() };
  }

  async function parseFile(name, buf, JSZipLib, DP) {
    const u8 = new Uint8Array(buf);
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    let lines;
    if (isZip) lines = await docxToLines(buf, JSZipLib, DP);
    else lines = textToLines(new TextDecoder('utf-8').decode(u8));
    const doc = linesToDoc(lines, name);
    doc.sig = hash(JSON.stringify(doc.sections.map(s => s.blocks.length + s.title)));
    return doc;
  }

  /* ---------- extraction des faits ---------- */
  const NUM = '(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+|\\d+)(?:,(\\d+))?';
  const RX_QTY = new RegExp('(?<![\\w,.])' + NUM + '\\s?(€|euros?\\b|%|ans?\\b|années?\\b|mois\\b|jours?\\b)', 'gi');
  const RX_ART = /\b(?:CGI|C\.\s?civ|CMF|CSS|CSP|C\.\s?com|LPF)\.?\s*,?\s*art\.?\s*((?:[LRD]\.?\s?)?\d+(?:-\d+)*(?:\s?[A-Z](?![a-z]))?(?:\s(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies|undecies|duodecies|terdecies|quaterdecies|quindecies)\b)?(?:\s[A-Z]\b(?![.']))?)/g;
  const RX_NOISE = /notre document|voir notre|voir nos|cliquez|fidroit|http|document giratoire|ci-dessous|ci-après|tableau suivant|exemple\s*:|en l.espèce|\bN\s?[+-]\s?\d|=|\s[x×]\s\d|\bM\.\s|\bMme\b|\bsoit\s\d/i;

  function unitOf(u) {
    u = u.toLowerCase();
    if (u === '€' || u.startsWith('euro')) return '€';
    if (u === '%') return '%';
    if (u.startsWith('an') || u.startsWith('ann')) return 'ans';
    if (u === 'mois') return 'mois';
    return 'jours';
  }
  function toVal(intPart, dec) { return parseFloat(intPart.replace(/[ .\u00a0\u202f]/g, '') + (dec ? '.' + dec : '')); }
  function frNum(v) {
    const neg = v < 0; v = Math.abs(v);
    let [i, d] = (Math.round(v * 100) / 100).toString().split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + i + (d ? ',' + d : '');
  }
  function fmtQty(v, unit, word) {
    if (unit === '€') return frNum(v) + (word && word.toLowerCase().startsWith('euro') ? ' euros' : ' €');
    if (unit === '%') return frNum(v) + ' %';
    if (unit === 'ans') return frNum(v) + (v <= 1 ? ' an' : ' ans');
    if (unit === 'mois') return frNum(v) + ' mois';
    return frNum(v) + (v <= 1 ? ' jour' : ' jours');
  }

  function sentencesOf(text) {
    return text.split(/(?<=[.;!?])\s+(?=[A-ZÀ-ÝÉ«"(–-])/).map(s => s.trim()).filter(Boolean);
  }

  function extractFacts(doc) {
    const facts = [];
    const seen = new Set();
    for (const s of doc.sections) {
      const texts = [];
      if (/exemple|illustration|cas pratique/i.test(s.path.join(' '))) continue;
      let lead = '';
      for (const b of s.blocks) {
        if (b.ex) continue;
        if (b.t === 'p') lead = /:\s*$/.test(b.text) && b.text.length < 220 ? b.text : '';
        if (b.t === 'li') sentencesOf(b.text).forEach(x => texts.push(lead ? { x, lead } : x));
        else if (b.t === 'p') texts.push(...sentencesOf(b.text));
        else if (b.t === 'table' && b.rows.length > 1) {
          const head = b.rows[0];
          for (const r of b.rows.slice(1)) {
            const parts = r.map((c, i) => (head[i] && head[i] !== c && i > 0 ? head[i] + ' : ' : '') + c).filter(Boolean);
            const line = parts.join(' — ');
            if (line.length < 300) texts.push(line);
          }
        }
      }
      for (const item of texts) {
        const sent = typeof item === 'string' ? item : item.x;
        const lead = typeof item === 'string' ? '' : item.lead;
        if (sent.length < 30 || sent.length > 340 || RX_NOISE.test(sent)) continue;
        let n = 0;
        const add = (start, end, token, unit, val, word) => {
          if (n >= 2) return;
          const id = hash(doc.key + '|' + sent + '|' + start + '|' + token);
          if (seen.has(id)) return;
          seen.add(id); n++;
          facts.push(lead ? { id, doc: doc.key, sec: s.id, sent, start, end, token, unit, val, word, lead } : { id, doc: doc.key, sec: s.id, sent, start, end, token, unit, val, word });
        };
        RX_QTY.lastIndex = 0;
        let m;
        while ((m = RX_QTY.exec(sent))) {
          const val = toVal(m[1], m[2]);
          const unit = unitOf(m[3]);
          if (!isFinite(val)) continue;
          if (unit === 'ans' && (val > 120 || val === 0)) continue;
          if (unit === '%' && val > 100) continue;
          add(m.index, m.index + m[0].length, m[0], unit, val, m[3]);
        }
        RX_ART.lastIndex = 0;
        while ((m = RX_ART.exec(sent))) {
          const a = m[1].trim();
          const st = m.index + m[0].lastIndexOf(m[1]);
          add(st, st + m[1].length, a, 'art', null, null);
        }
      }
    }
    return facts;
  }

  /* ---------- distracteurs ---------- */
  const STD = {
    '%': [3, 5, 6, 7.5, 9.2, 10, 11, 12.8, 15, 17.2, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100],
    'ans': [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 22, 25, 30, 65, 70],
    'mois': [1, 2, 3, 6, 9, 12, 18, 24, 36],
    'jours': [8, 15, 30, 45, 60, 90],
    '€': []
  };
  function rnd(seed) { let x = seed % 2147483647; if (x <= 0) x += 2147483646; return () => (x = x * 16807 % 2147483647) / 2147483647; }
  function seedOf(id) { let s = 0; for (const c of id) s = (s * 31 + c.charCodeAt(0)) | 0; return Math.abs(s) || 7; }

  function buildPools(facts) {
    const pools = {};
    for (const f of facts) {
      const k = f.unit;
      (pools[k] = pools[k] || new Map());
      const key = f.unit === 'art' ? f.token.replace(/\s+/g, ' ') : String(f.val);
      if (!pools[k].has(key)) pools[k].set(key, f);
    }
    return pools;
  }

  function distractors(f, pools, count) {
    const r = rnd(seedOf(f.id));
    const out = [];
    const shown = new Set();
    function push(label) { const k = norm(label); if (!shown.has(k)) { shown.add(k); out.push(label); } }
    function norm(s) { return s.toLowerCase().replace(/[\s\u00a0\u202f]/g, '').replace(/euros?/, '€').replace(/ans?$/, 'an').replace(/jours?$/, 'jour'); }
    shown.add(norm(f.unit === 'art' ? f.token : fmtQty(f.val, f.unit, f.word)));
    if (f.unit === 'art') {
      const arr = [...pools.art.keys()].filter(k => k !== f.token);
      const sameFam = arr.filter(k => k.split(' ')[0].replace(/\D/g, '').slice(0, 2) === f.token.split(' ')[0].replace(/\D/g, '').slice(0, 2));
      const src = sameFam.length >= count ? sameFam : arr;
      for (let i = 0; i < 40 && out.length < count && src.length; i++) push(src[Math.floor(r() * src.length)]);
      return out;
    }
    const v = f.val;
    const cand = [];
    const pool = pools[f.unit] ? [...pools[f.unit].values()].map(x => x.val) : [];
    // valeurs du corpus dans un ordre de grandeur voisin
    const near = pool.filter(x => x !== v && x > 0 && (v === 0 || (x / v < 6 && v / x < 6)));
    for (let i = 0; i < 6 && near.length; i++) cand.push(near[Math.floor(r() * near.length)]);
    if (f.unit === '€') {
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
      cand.push(v * 2, v / 2, v + mag, Math.max(mag, v - mag), v * 1.5);
    } else {
      const std = STD[f.unit].filter(x => x !== v);
      std.sort((a, b) => Math.abs(a - v) - Math.abs(b - v));
      cand.push(...std.slice(0, 5));
    }
    // mélange déterministe
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const x of cand) {
      if (out.length >= count) break;
      if (!(x > 0) || x === v) continue;
      let y = x;
      if (f.unit === '€') { const step = y >= 10000 ? 1000 : y >= 1000 ? 100 : y >= 100 ? 10 : 1; y = Math.round(y / step) * step; }
      else if (f.unit !== '%') y = Math.round(y);
      if (f.unit === '%' && y > 100) continue;
      push(fmtQty(y, f.unit, f.word));
    }
    return out;
  }

  /* ---------- cartes ---------- */
  function buildCards(docs) {
    const cards = [];
    const allFacts = [];
    for (const d of docs) {
      const facts = extractFacts(d);
      allFacts.push(...facts);
    }
    const pools = buildPools(allFacts);
    const docByKey = Object.fromEntries(docs.map(d => [d.key, d]));
    for (const f of allFacts) {
      const d = docByKey[f.doc];
      const base = { doc: f.doc, theme: d.theme, sec: f.sec, fact: f };
      cards.push(Object.assign({ id: 'q:' + f.id, type: 'qcm' }, base));
      cards.push(Object.assign({ id: 'v:' + f.id, type: 'vf' }, base));
    }
    for (const d of docs) {
      for (const s of d.sections) {
        const len = s.blocks.reduce((a, b) => a + (b.text ? b.text.length : 0), 0);
        if (len < 160 || !s.path.length) continue;
        cards.push({ id: 'f:' + s.id, type: 'fiche', doc: d.key, theme: d.theme, sec: s.id });
      }
    }
    return { cards, pools };
  }

  /* Prépare une question jouable (choix mélangés, vrai/faux tiré au sort) */
  function materialize(card, pools, salt) {
    if (card.type === 'fiche') return card;
    const f = card.fact;
    const before = f.sent.slice(0, f.start), after = f.sent.slice(f.end);
    const good = f.unit === 'art' ? f.token : fmtQty(f.val, f.unit, f.word);
    const ds = distractors(f, pools, 3);
    const r = rnd(seedOf(card.id + (salt || '')));
    if (card.type === 'qcm') {
      if (ds.length < 2) return null;
      const choices = [good, ...ds].sort(() => r() - 0.5);
      return Object.assign({}, card, { before, after, good, choices });
    }
    if (!ds.length) return null;
    const truth = r() < 0.5;
    const shown = truth ? good : ds[0];
    return Object.assign({}, card, { before, after, shown, good, truth });
  }

  /* ---------- répétition espacée (Leitner) ---------- */
  const INTERVALS = [0, 1, 3, 7, 16, 35, 80]; // jours
  const DAY = 86400000;
  function schedule(prog, grade, now) {
    // grade : 0 = raté, 1 = difficile, 2 = bon
    const p = prog ? Object.assign({}, prog) : { box: 0, seen: 0, ok: 0 };
    p.seen++;
    if (grade === 0) { p.box = 0; p.lapses = (p.lapses || 0) + 1; }
    else if (grade === 1) { p.box = Math.max(1, p.box); p.ok++; }
    else { p.box = Math.min(INTERVALS.length - 1, p.box + 1); p.ok++; }
    p.last = now;
    p.due = now + (p.box === 0 ? 10 * 60000 : INTERVALS[p.box] * DAY - 3 * 3600000);
    return p;
  }

  const api = { parseFile, textToLines, linesToDoc, extractFacts, buildCards, materialize, schedule, themeOf, titleFromFilename, hash, fmtQty, INTERVALS, THEMES: THEMES.map(t => t[0]).concat('Autres') };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
