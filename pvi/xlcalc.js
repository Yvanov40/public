// =====================================================================================
//  xlcalc.js — calcule les formules d'un classeur ExcelJS et range le résultat dans chaque cellule
// -------------------------------------------------------------------------------------
//  Excel recalcule tout à l'ouverture ; mais les aperçus (iPhone, Mail, Gmail, WhatsApp…)
//  n'affichent que les valeurs enregistrées. On les calcule donc avant d'écrire le fichier.
//  Couvre les fonctions des classeurs de ces applis : IF, IFERROR, AND, OR, NOT, MIN, MAX, SUM,
//  SUMPRODUCT, ROUND, ABS, PMT, FV, IRR ; opérateurs + - * / ^ & = <> < <= > >= ; plages et
//  renvois à un autre onglet ('Nom'!B4). Même fichier dans le navigateur (window.XlCalc) et Node.
// =====================================================================================
(function (racine) {
  "use strict";
  class ErreurXL extends Error { constructor(c) { super(c); this.code = c; } }
  const err = (c) => { throw new ErreurXL(c); };
  const colNum = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };

  // ---------------------------------------------------------------- découpage
  function jetons(f) {
    const t = []; let i = 0;
    const re = {
      espace: /^\s+/, nombre: /^\d+(\.\d+)?([eE][+-]?\d+)?/, texte: /^"((?:[^"]|"")*)"/,
      ref: /^(?:('(?:[^']|'')+'|[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/,
      fonction: /^([A-Z][A-Z0-9.]*)\s*\(/, op: /^(<=|>=|<>|[-+*/^&=<>(),:])/
    };
    while (i < f.length) {
      const s = f.slice(i); let m;
      if ((m = re.espace.exec(s))) { i += m[0].length; continue; }
      if ((m = re.texte.exec(s))) { t.push({ k: "s", v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
      if ((m = re.fonction.exec(s))) { t.push({ k: "f", v: m[1] }); i += m[0].length; continue; }
      if ((m = re.ref.exec(s))) {
        const feuille = m[1] ? (m[1][0] === "'" ? m[1].slice(1, -1).replace(/''/g, "'") : m[1]) : null;
        t.push({ k: "r", feuille, c1: colNum(m[2]), l1: +m[3], c2: m[4] ? colNum(m[4]) : null, l2: m[5] ? +m[5] : null }); i += m[0].length; continue;
      }
      if ((m = re.nombre.exec(s))) { t.push({ k: "n", v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (/^TRUE\b/.test(s)) { t.push({ k: "b", v: true }); i += 4; continue; }
      if (/^FALSE\b/.test(s)) { t.push({ k: "b", v: false }); i += 5; continue; }
      if ((m = re.op.exec(s))) { t.push({ k: "o", v: m[1] }); i += m[0].length; continue; }
      throw new Error("formule illisible : " + f + " (à « " + s.slice(0, 12) + " »)");
    }
    return t;
  }

  // ---------------------------------------------------------------- arbre (priorités d'Excel)
  function analyser(f) {
    const t = jetons(f); let p = 0;
    const voir = () => t[p], prendre = () => t[p++];
    const estOp = (v) => voir() && voir().k === "o" && voir().v === v;
    function comparaison() { let a = concat(); while (voir() && voir().k === "o" && ["=", "<>", "<", "<=", ">", ">="].includes(voir().v)) { const o = prendre().v; a = { op: o, a, b: concat() }; } return a; }
    function concat() { let a = somme(); while (estOp("&")) { prendre(); a = { op: "&", a, b: somme() }; } return a; }
    function somme() { let a = produit(); while (estOp("+") || estOp("-")) { const o = prendre().v; a = { op: o, a, b: produit() }; } return a; }
    function produit() { let a = puissance(); while (estOp("*") || estOp("/")) { const o = prendre().v; a = { op: o, a, b: puissance() }; } return a; }
    function puissance() { let a = unaire(); while (estOp("^")) { prendre(); a = { op: "^", a, b: unaire() }; } return a; }
    function unaire() { if (estOp("-")) { prendre(); return { op: "neg", a: unaire() }; } if (estOp("+")) { prendre(); return unaire(); } return atome(); }
    function atome() {
      const j = prendre();
      if (!j) throw new Error("formule incomplète : " + f);
      if (j.k === "n" || j.k === "s" || j.k === "b") return { val: j.v };
      if (j.k === "r") return { ref: j };
      if (j.k === "f") {
        const args = [];
        if (!estOp(")")) { do { if (estOp(",")) { prendre(); args.push({ val: null }); continue; } args.push(comparaison()); if (estOp(",")) prendre(); else break; } while (true); }
        if (!estOp(")")) throw new Error("parenthèse attendue : " + f); prendre();
        return { fn: j.v, args };
      }
      if (j.k === "o" && j.v === "(") { const x = comparaison(); if (!estOp(")")) throw new Error("parenthèse attendue : " + f); prendre(); return x; }
      throw new Error("formule illisible : " + f);
    }
    const arbre = comparaison();
    if (p < t.length) throw new Error("formule illisible (fin) : " + f);
    return arbre;
  }

  // ---------------------------------------------------------------- valeurs
  const num = (v) => {
    if (Array.isArray(v)) v = v[0];
    if (v == null || v === "") return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    const x = parseFloat(v); if (isNaN(x)) err("#VALUE!"); return x;
  };
  const bool = (v) => typeof v === "boolean" ? v : num(v) !== 0;
  const aplat = (v) => Array.isArray(v) ? v.flat(Infinity) : [v];
  // opération élément par élément (pour SUMPRODUCT et les plages)
  function element(a, b, f) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : null, B = Array.isArray(b) ? b : null, n = (A || B).length;
      return Array.from({ length: n }, (_, i) => element(A ? A[i] : a, B ? B[i] : b, f));
    }
    return f(a, b);
  }
  function comparer(o, a, b) {
    const sa = typeof a === "string", sb = typeof b === "string";
    let x, y; if (sa || sb) { x = String(a ?? "").toLowerCase(); y = String(b ?? "").toLowerCase(); } else { x = num(a); y = num(b); }
    return o === "=" ? x === y : o === "<>" ? x !== y : o === "<" ? x < y : o === "<=" ? x <= y : o === ">" ? x > y : x >= y;
  }
  function arrondir(x, d) { const k = Math.pow(10, d); return Math.sign(x) * Math.round(+(Math.abs(x) * k).toPrecision(15)) / k; }
  function tri(flux, estim) {
    const van = (t) => flux.reduce((s, f, i) => s + f / Math.pow(1 + t, i), 0);
    const der = (t) => flux.reduce((s, f, i) => s - i * f / Math.pow(1 + t, i + 1), 0);
    let t = estim;
    for (let k = 0; k < 50; k++) { const v = van(t), d = der(t); if (!isFinite(v) || !d) break; const n = t - v / d; if (Math.abs(n - t) < 1e-10) { if (n > -1) return n; break; } t = n; if (t <= -1) break; }
    let bas = -0.99, haut = 1;
    if (van(bas) * van(haut) > 0) { haut = 10; if (van(bas) * van(haut) > 0) err("#NUM!"); }
    for (let i = 0; i < 200; i++) { const m = (bas + haut) / 2; if (van(bas) * van(m) <= 0) haut = m; else bas = m; }
    return (bas + haut) / 2;
  }
  const FONCTIONS = {
    IF: (a, ev) => bool(ev(a[0])) ? ev(a[1]) : (a.length > 2 ? ev(a[2]) : false),
    IFERROR: (a, ev) => { try { const v = ev(a[0]); if (typeof v === "number" && !isFinite(v)) err("#NUM!"); return v; } catch (e) { if (e instanceof ErreurXL) return ev(a[1]); throw e; } },
    AND: (a, ev) => a.every((x) => aplat(ev(x)).every(bool)),
    OR: (a, ev) => a.some((x) => aplat(ev(x)).some(bool)),
    NOT: (a, ev) => !bool(ev(a[0])),
    MIN: (a, ev) => { const v = a.flatMap((x) => aplat(ev(x))).filter((x) => x !== null && x !== "").map(num); return v.length ? Math.min(...v) : 0; },
    MAX: (a, ev) => { const v = a.flatMap((x) => aplat(ev(x))).filter((x) => x !== null && x !== "").map(num); return v.length ? Math.max(...v) : 0; },
    SUM: (a, ev) => a.flatMap((x) => aplat(ev(x))).reduce((s, x) => s + (typeof x === "number" ? x : 0), 0),
    SUMPRODUCT: (a, ev) => { const L = a.map((x) => aplat(ev(x)).map(num)); return L[0].reduce((s, _, i) => s + L.reduce((p, l) => p * l[i], 1), 0); },
    ROUND: (a, ev) => arrondir(num(ev(a[0])), num(ev(a[1]))),
    ABS: (a, ev) => Math.abs(num(ev(a[0]))),
    PMT: (a, ev) => { const r = num(ev(a[0])), n = num(ev(a[1])), pv = num(ev(a[2])), fv = a[3] ? num(ev(a[3])) : 0; if (!n) err("#NUM!"); return r === 0 ? -(pv + fv) / n : -(pv * Math.pow(1 + r, n) + fv) * r / (Math.pow(1 + r, n) - 1); },
    FV: (a, ev) => { const r = num(ev(a[0])), n = num(ev(a[1])), pm = num(ev(a[2])), pv = a[3] ? num(ev(a[3])) : 0; return r === 0 ? -(pv + pm * n) : -(pv * Math.pow(1 + r, n) + pm * (Math.pow(1 + r, n) - 1) / r); },
    IRR: (a, ev) => tri(aplat(ev(a[0])).filter((x) => typeof x === "number"), a[1] ? num(ev(a[1])) : 0.1)
  };

  // ---------------------------------------------------------------- le classeur
  function calculer(wb) {
    const memo = new Map(), enCours = new Set(), arbres = new Map();
    const feuilleDe = (nom, defaut) => nom ? wb.getWorksheet(nom) || err("#REF!") : defaut;
    function valeurCellule(ws, l, c) {
      const cle = ws.id + ":" + l + ":" + c;
      if (memo.has(cle)) { const m = memo.get(cle); if (m instanceof ErreurXL) throw m; return m; }
      const cell = ws.getCell(l, c), v = cell.value;
      let res;
      if (v && typeof v === "object" && v.formula) {
        if (enCours.has(cle)) err("#CIRC!");
        enCours.add(cle);
        try {
          if (!arbres.has(v.formula)) arbres.set(v.formula, analyser(v.formula));
          res = evaluer(arbres.get(v.formula), ws);
          if (Array.isArray(res)) res = aplat(res)[0];
          if (typeof res === "number" && !isFinite(res)) err("#NUM!");
        } catch (e) { if (e instanceof ErreurXL) { memo.set(cle, e); enCours.delete(cle); throw e; } throw e; }
        enCours.delete(cle);
      } else if (v && typeof v === "object" && "result" in v) res = v.result;
      else if (v && typeof v === "object" && v.richText) res = v.richText.map((x) => x.text).join("");
      else res = v == null ? null : v;
      memo.set(cle, res);
      return res;
    }
    function evaluer(n, ws) {
      const ev = (x) => evaluer(x, ws);
      if ("val" in n) return n.val;
      if (n.ref) {
        const r = n.ref, w = feuilleDe(r.feuille, ws);
        if (r.c2 == null) return valeurCellule(w, r.l1, r.c1);
        const out = [];
        for (let l = Math.min(r.l1, r.l2); l <= Math.max(r.l1, r.l2); l++) for (let c = Math.min(r.c1, r.c2); c <= Math.max(r.c1, r.c2); c++) out.push(valeurCellule(w, l, c));
        return out;
      }
      if (n.fn) { const f = FONCTIONS[n.fn]; if (!f) throw new Error("fonction non prise en charge : " + n.fn); return f(n.args, ev); }
      if (n.op === "neg") return element(ev(n.a), 0, (x) => -num(x));
      const a = ev(n.a), b = ev(n.b);
      switch (n.op) {
        case "+": return element(a, b, (x, y) => num(x) + num(y));
        case "-": return element(a, b, (x, y) => num(x) - num(y));
        case "*": return element(a, b, (x, y) => num(x) * num(y));
        case "/": return element(a, b, (x, y) => { const d = num(y); if (d === 0) err("#DIV/0!"); return num(x) / d; });
        case "^": return element(a, b, (x, y) => { const r = Math.pow(num(x), num(y)); if (!isFinite(r)) err("#NUM!"); return r; });
        case "&": return element(a, b, (x, y) => String(x ?? "") + String(y ?? ""));
        default: return element(a, b, (x, y) => comparer(n.op, x, y));
      }
    }
    let erreurs = 0;
    wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (!v || typeof v !== "object" || !v.formula) return;
      let res;
      try { res = valeurCellule(ws, cell.row, cell.col); } catch (e) { if (e instanceof ErreurXL) { res = { error: e.code === "#CIRC!" ? "#VALUE!" : e.code }; erreurs++; } else throw e; }
      cell.value = { formula: v.formula, result: res === null ? 0 : res };
    })));
    return { erreurs };
  }

  const XlCalc = { calculer, analyser };
  if (typeof module !== "undefined" && module.exports) module.exports = XlCalc; else racine.XlCalc = XlCalc;
})(typeof window !== "undefined" ? window : globalThis);
