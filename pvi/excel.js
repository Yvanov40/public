// =====================================================================================
//  excel.js — le classeur Excel de la plus-value immobilière, en formules vivantes
// -------------------------------------------------------------------------------------
//  Onglet « Calcul » : les hypothèses en haut (cellules jaunes, modifiables), puis le prix de
//  cession corrigé, le prix de revient, la plus-value brute, les abattements pour durée, et un
//  bloc par cédant (exonérations, bases, impôt, prélèvements, surtaxe). Toutes les formules
//  renvoient au même onglet ; aucun nom défini. Les choix de l'appli (frais réels ou forfait,
//  exonérations, ventilation du démembrement) sont repris comme hypothèses, avec leur motif.
//  Onglet « Hypothèses saisies » : le récapitulatif de la saisie, pour mémoire.
// =====================================================================================
(function (racine) {
  "use strict";
  const EUR = '#,##0 "€";[Red]-#,##0 "€"', PCT = "0.00 %", PCT1 = "0.0 %", NB = "0";
  const JAUNE = "FFFDF3D6", BLEU_SAISIE = "FF1F4E9A", GRIS = "FF7C7466", FOND = "FFEFE9DE";
  const TRANCHES = [[60000, .02, 1 / 20], [100000, .02, 0], [110000, .03, 1 / 10], [150000, .03, 0], [160000, .04, .15], [200000, .04, 0], [210000, .05, .2], [250000, .05, 0], [260000, .06, .25]];
  // surtaxe (art. 1609 nonies G) : le taux est multiplié par « m » (Corse), pas le lissage
  function surtaxe(x, m) {
    let f = `0.06*${m}*${x}`;
    for (let i = TRANCHES.length - 1; i >= 0; i--) { const [hi, r, l] = TRANCHES[i]; f = `IF(${x}<=${hi},MAX(0,${r}*${m}*${x}${l ? `-(${hi}-${x})*${+l.toFixed(6)}` : ""}),${f})`; }
    return `IF(${x}<=50000,0,${f})`;
  }
  const abIR = (y) => `IF(${y}<6,0,IF(${y}>=22,1,0.06*(${y}-5)))`;
  const abPS = (y) => `IF(${y}<6,0,IF(${y}>=30,1,IF(${y}<22,0.0165*(${y}-5),0.28+0.09*(${y}-22))))`;

  function construire(ExcelJS, ctx) {
    const { f, R, couleur } = ctx, X = R.X;
    const BLEU = "FF" + String(couleur || "0C2D39").replace("#", "").toUpperCase();
    const wb = new ExcelJS.Workbook();
    wb.creator = ctx.cabinet || "Plus-value immobilière"; wb.calcProperties = { fullCalcOnLoad: true };
    const ws = wb.addWorksheet("Calcul", { views: [{ showGridLines: false }] });
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: "&L" + String(ctx.cabinet || "").replace(/&/g, "&&") + "&RPage &P / &N" };
    ws.columns = [{ width: 58 }, { width: 18 }, { width: 18 }, { width: 46 }];
    const noms = {}, attente = [];
    let r = 1;
    const cell = (l, c) => ws.getCell(l, c);
    const note = (t) => { if (t) { cell(r, 4).value = t; cell(r, 4).font = { italic: true, size: 9, color: { argb: GRIS } }; } };
    const titre = (t, taille) => { cell(r, 1).value = t; cell(r, 1).font = { bold: true, size: taille || 11, color: { argb: BLEU } }; r++; };
    const bande = (t, cols) => { for (let i = 1; i <= (cols || 4); i++) cell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU } }; cell(r, 1).value = t; ws.getRow(r).font = { bold: true, color: { argb: "FFFFFFFF" } }; r++; };
    const hyp = (nom, lib, v, fmt, n, fixe) => {
      cell(r, 1).value = lib; const c = cell(r, 2); c.value = v; c.numFmt = fmt || EUR;
      if (!fixe) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: JAUNE } }; c.font = { color: { argb: BLEU_SAISIE } }; }
      note(n); noms[nom] = "$B$" + r; r++;
    };
    const calc = (nom, lib, formule, fmt, n, fort, col) => {
      cell(r, 1).value = lib; const c = cell(r, col || 2); attente.push([c, formule]); c.numFmt = fmt || EUR;
      if (fort) { ws.getRow(r).font = { bold: true }; for (let i = 1; i <= 3; i++) cell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND } }; }
      note(n); if (nom) noms[nom] = "$" + "ABCD"[(col || 2) - 1] + "$" + r; r++;
    };
    // deux colonnes (impôt sur le revenu / prélèvements sociaux) sur la même ligne
    const calc2 = (n1, n2, lib, f1, f2, fmt, n, fort) => {
      cell(r, 1).value = lib;
      if (f1 != null) { attente.push([cell(r, 2), f1]); cell(r, 2).numFmt = fmt || EUR; if (n1) noms[n1] = "$B$" + r; }
      if (f2 != null) { attente.push([cell(r, 3), f2]); cell(r, 3).numFmt = fmt || EUR; if (n2) noms[n2] = "$C$" + r; }
      if (fort) { ws.getRow(r).font = { bold: true }; for (let i = 1; i <= 3; i++) cell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND } }; }
      note(n); r++;
    };
    const num = (x) => { const v = parseFloat(String(x ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(v) ? v : 0; };

    titre("Simulation de plus-value immobilière", 15);
    cell(r, 1).value = [ctx.cabinet, "Cession du " + (ctx.dateCession || "—"), "édition du " + new Date().toLocaleDateString("fr-FR")].filter(Boolean).join(" · "); cell(r, 1).font = { color: { argb: GRIS }, size: 10 }; r++;
    cell(r, 1).value = "Formules vivantes : modifiez les cellules jaunes, tout l'onglet se recalcule. Les choix faits dans l'appli (forfaits, exonérations, démembrement) sont repris comme hypothèses."; cell(r, 1).font = { italic: true, size: 9, color: { argb: GRIS } }; r += 2;

    // ---------------------------------------------------------------- hypothèses
    bande("Hypothèses");
    titre("Le prix de cession");
    hyp("prix", "Prix de cession stipulé", num(f.prixCession));
    hyp("charges", "Charges et indemnités au profit du cédant", num(f.charges));
    hyp("fraisC", "Frais de cession", num(f.fraisCession));
    hyp("mob", "Mobilier vendu (valeur justifiée)", num(f.mobilier));
    hyp("tva", "TVA acquittée", num(f.tvaCession));
    const frac = !!X.frac && R.FR;
    if (!frac) {
      titre("L'acquisition");
      hyp("A", X.constr ? "Prix d'acquisition du terrain" : f.modeAcq === "gratuit" ? "Valeur retenue (donation / succession)" : "Prix d'acquisition stipulé", X.A);
      if (X.constr) hyp("C", "Coût de la construction", X.C);
      hyp("frais", "Frais d'acquisition retenus", Math.round(X.frais * 100) / 100, EUR, X.fraisLib);
      hyp("trav", "Travaux retenus", Math.round(X.trav * 100) / 100, EUR, X.travLib || "aucun");
      hyp("def", "Déficit foncier « travaux » non imputé", X.def);
      hyp("lm", "Amortissements LMNP réintégrés", X.lm, EUR, X.lm ? "cession depuis le 15/02/2025" : "");
      hyp("jb", "Amortissements Jeanbrun réintégrés", X.jb);
      titre("La durée de détention");
      hyp("yT", X.constr ? "Années pleines de détention du terrain" : "Années pleines de détention", R.yT, NB, "de la date d'acquisition à la date de cession");
      if (X.constr) hyp("yC", "Années pleines depuis le début des travaux", R.yC, NB);
    } else {
      titre("Les fractions (vente en bloc d'un bien acquis en plusieurs fois)");
      hyp("def", "Déficit foncier « travaux » non imputé (ventilé)", X.def);
      hyp("amF", "Amortissements réintégrés (ventilés)", X.lm + X.jb);
      R.FR.forEach((x, i) => {
        hyp("q" + i, x.nom + " : part du bien", x.q, PCT1);
        hyp("a" + i, x.nom + " : prix d'acquisition", x.a);
        hyp("fr" + i, x.nom + " : frais d'acquisition retenus", Math.round(x.fr * 100) / 100, EUR, x.fl);
        hyp("tr" + i, x.nom + " : travaux retenus", Math.round(x.tr * 100) / 100, EUR, x.tl || "aucun");
        hyp("y" + i, x.nom + " : années pleines de détention", x.y, NB);
      });
    }
    titre("La fiscalité");
    hyp("tIR", "Taux de l'impôt sur le revenu", X.tIR, PCT1);
    hyp("corse", "Surtaxe Corse (taux × 5 jusqu'à 22 ans) ?", f.corse ? 1 : 0, NB, "1 = oui");
    hyp("tab", "Terrain à bâtir (pas de surtaxe) ?", X.type === "tab" ? 1 : 0, NB, "1 = oui");
    hyp("sci", "Cession par une société à l'IR (surtaxe appréciée sur la société) ?", X.sci ? 1 : 0, NB, "1 = oui");
    hyp("fLS", "Exonération « logement social » (part exonérée)", X.fLS, PCT1);
    hyp("ve", "Abattement exceptionnel art. 150 VE", X.ve, PCT1);
    hyp("tCom", "Taxe communale sur les terrains devenus constructibles", Math.round(X.tCom * 100) / 100, EUR, X.tCom ? "calculée par l'appli (art. 1529)" : "");
    hyp("tNat", "Taxe nationale sur les terrains devenus constructibles", Math.round(X.tNat * 100) / 100, EUR, X.tNat ? "calculée par l'appli (art. 1605 nonies)" : "");
    if (X.type === "foret") hyp("ha", "Bois et forêts : nombre d'hectares", X.hectares, "0.00", "réduction de 10 € par hectare et par année de détention");
    titre("Les cédants");
    R.res.forEach((c, i) => {
      hyp("s" + i, c.nom + " : part de la plus-value", c.part, "0.00 %", f.demembre ? "quote-part × valeur du droit (démembrement)" : "quote-part");
      hyp("e" + i, c.nom + " : part exonérée", c.is ? 1 : c.e || 0, PCT1, c.is ? "associé à l'IS : hors régime des particuliers" : (c.exos || []).join(" ; ").slice(0, 250));
      hyp("nr" + i, c.nom + " : exonération non-résident de 150 000 € ?", c.nr150 ? 1 : 0, NB, "1 = oui");
      hyp("tPS" + i, c.nom + " : taux des prélèvements sociaux", c.tauxPS, PCT1);
    });
    r++;

    // ---------------------------------------------------------------- calcul
    bande("La plus-value");
    calc("P", "Prix de cession corrigé", "={prix}+{charges}-{fraisC}-{mob}-{tva}", EUR, "", true);
    if (!frac) {
      calc("PR", "Prix de revient", X.constr ? "={A}+{C}+{frais}+{trav}+{def}-{lm}-{jb}" : "={A}+{frais}+{trav}+{def}-{lm}-{jb}", EUR, "", true);
      calc("PVB", "Plus-value brute (bien entier)", "={P}-{PR}", EUR, "", true);
      if (X.constr) {
        calc("rT", "Part du terrain dans le prix de revient", "=IF({A}+{C}>0,{A}/({A}+{C}),1)", PCT1, "abattements pondérés terrain / construction");
        calc("aIR", "Abattement pour durée : impôt sur le revenu", `={rT}*${abIR("{yT}")}+(1-{rT})*${abIR("{yC}")}`, PCT);
        calc("aPS", "Abattement pour durée : prélèvements sociaux", `={rT}*${abPS("{yT}")}+(1-{rT})*${abPS("{yC}")}`, PCT);
        calc("yMax", "Durée retenue pour la surtaxe Corse et la forêt", "=MAX({yT},{yC})", NB);
      } else {
        calc("aIR", "Abattement pour durée : impôt sur le revenu", "=" + abIR("{yT}"), PCT, "6 % par an de la 6e à la 21e année, 4 % la 22e");
        calc("aPS", "Abattement pour durée : prélèvements sociaux", "=" + abPS("{yT}"), PCT, "1,65 % par an de la 6e à la 21e, 1,60 % la 22e, 9 % au-delà");
        calc("yMax", "Durée retenue pour la surtaxe Corse et la forêt", "={yT}", NB);
      }
      calc("NIR", "Plus-value après abattement : impôt sur le revenu", "={PVB}*(1-{aIR})");
      calc("NPS", "Plus-value après abattement : prélèvements sociaux", "={PVB}*(1-{aPS})");
    } else {
      const S = (k) => R.FR.map((x, i) => `{${k}${i}}`).join("+");
      R.FR.forEach((x, i) => {
        titre(x.nom);
        calc("pcs" + i, "Prix de cession ventilé", `={P}*{q${i}}`);
        calc("pr" + i, "Prix de revient", `={a${i}}+{fr${i}}+{tr${i}}+({def}-{amF})*{q${i}}`);
        calc("pvb" + i, "Plus- ou moins-value brute", `={pcs${i}}-{pr${i}}`);
        calc("nir" + i, "Après abattement : impôt sur le revenu", `={pvb${i}}*(1-${abIR(`{y${i}}`)})`);
        calc("nps" + i, "Après abattement : prélèvements sociaux", `={pvb${i}}*(1-${abPS(`{y${i}}`)})`);
      });
      titre("Total des fractions");
      calc("PR", "Prix de revient total", "=" + S("pr"), EUR, "", true);
      calc("PVB", "Plus-value brute (somme des fractions)", "=" + S("pvb"), EUR, "", true);
      calc("NIR", "Après abattements et imputation des moins-values : impôt sur le revenu", "=" + S("nir"));
      calc("NPS", "Après abattements et imputation des moins-values : prélèvements sociaux", "=" + S("nps"));
      calc("yMax", "Durée retenue pour la surtaxe Corse et la forêt", "=MAX(" + R.FR.map((x, i) => `{y${i}}`).join(",") + ")", NB);
    }
    calc("mult", "Multiplicateur de la surtaxe", "=IF(AND({corse}=1,{yMax}<=22),5,1)", NB);
    r++;
    bande("Par cédant");
    cell(r, 2).value = "Impôt sur le revenu"; cell(r, 3).value = "Prélèvements sociaux"; ws.getRow(r).font = { bold: true, color: { argb: GRIS } }; r++;
    const pvIRs = R.res.map((c, i) => `{pvIR${i}}`).join("+");
    R.res.forEach((c, i) => {
      titre(c.nom);
      calc2("pvb" + i + "c", null, "Quote-part de plus-value brute", `={PVB}*{s${i}}`, null);
      calc2("nI" + i, "nP" + i, "Après abattement pour durée", `=MAX(0,{NIR})*{s${i}}`, `=MAX(0,{NPS})*{s${i}}`);
      calc2("x1" + i, "y1" + i, "Après exonération, logement social et art. 150 VE", `={nI${i}}*(1-{e${i}})*(1-{fLS})*(1-{ve})`, `={nP${i}}*(1-{e${i}})*(1-{fLS})*(1-{ve})`);
      calc2("pvIR" + i, "pvPS" + i, "Plus-value nette imposable",
        `=IF(AND({pvb${i}c}<=0,{nI${i}}<=0,{nP${i}}<=0),0,MAX(0,{x1${i}}-IF({nr${i}}=1,MIN(150000,{x1${i}}),0)))`,
        `=IF(AND({pvb${i}c}<=0,{nI${i}}<=0,{nP${i}}<=0),0,MAX(0,{y1${i}}-IF({nr${i}}=1,MIN(150000,{y1${i}}),0)))`, EUR, "", true);
      calc2("IR" + i, "PS" + i, "Impôt", X.type === "foret" ? `={pvIR${i}}*{tIR}-MIN({pvIR${i}}*{tIR},10*{yMax}*{ha}*{s${i}})` : `={pvIR${i}}*{tIR}`, `={pvPS${i}}*{tPS${i}}`, EUR, X.type === "foret" ? "IR après la réduction forestière" : "");
      calc2("sur" + i, null, "Surtaxe sur les plus-values élevées", `=IF({tab}=1,0,IF({sci}=1,IF((${pvIRs})>0,${surtaxe(`(${pvIRs})`, "{mult}")}*{pvIR${i}}/(${pvIRs}),0),${surtaxe(`{pvIR${i}}`, "{mult}")}))`, null);
      calc2("tx" + i, null, "Taxes sur les terrains devenus constructibles", `=({tCom}+{tNat})*{s${i}}`, null);
      calc2("tot" + i, null, "Total dû", `={IR${i}}+{PS${i}}+{sur${i}}+{tx${i}}`, null, EUR, "", true);
    });
    r++;
    bande("Synthèse");
    const som = (k) => "=" + R.res.map((c, i) => `{${k}${i}}`).join("+");
    calc("TIR", "Impôt sur le revenu", som("IR"));
    calc("TPS", "Prélèvements sociaux", som("PS"));
    calc("TSUR", "Surtaxe et taxes sur les terrains", "=" + R.res.map((c, i) => `{sur${i}}+{tx${i}}`).join("+"));
    calc("TOT", "Impôt total", "={TIR}+{TPS}+{TSUR}", EUR, "", true);
    calc("NET", "Net vendeur (prix − frais de cession − impôts)", "={prix}-{fraisC}-{TOT}", EUR, "", true);
    r++;
    (ctx.notes || []).forEach(([t, m]) => { cell(r, 1).value = m; cell(r, 1).font = { italic: true, size: 9, color: { argb: GRIS } }; cell(r, 1).alignment = { wrapText: true }; ws.mergeCells(r, 1, r, 4); ws.getRow(r).height = Math.min(60, 13 * Math.ceil(m.length / 120)); r++; });
    // résolution des noms
    for (const [c, f2] of attente) c.value = { formula: f2.slice(1).replace(/\{([^}]+)\}/g, (m, n) => { if (!(n in noms)) throw new Error("nom inconnu : " + n); return noms[n]; }) };

    // ---------------------------------------------------------------- récapitulatif de la saisie
    const w2 = wb.addWorksheet("Hypothèses saisies", { views: [{ showGridLines: false }] });
    w2.columns = [{ width: 52 }, { width: 40 }];
    w2.addRow(["Hypothèses saisies dans l'appli"]).font = { bold: true, size: 13, color: { argb: BLEU } };
    w2.addRow(["Pour mémoire : les calculs sont dans l'onglet « Calcul »."]).font = { italic: true, size: 9, color: { argb: GRIS } };
    w2.addRow([]);
    (ctx.recap || []).forEach(([a, b]) => w2.addRow([a, typeof b === "number" ? b : String(b ?? "")]).getCell(2).numFmt = EUR);
    if (ctx.projection && ctx.projection.length) {
      w2.addRow([]); w2.addRow(["Projection : même prix, vente plus tardive (valeurs calculées par l'appli)"]).font = { bold: true, color: { argb: BLEU } };
      const t = w2.addRow(["Année de vente", "Détention (ans)", "IR", "PS", "Surtaxe et taxes", "Total"]); t.font = { bold: true };
      w2.getColumn(3).width = 14; w2.getColumn(4).width = 14; w2.getColumn(5).width = 16; w2.getColumn(6).width = 14;
      ctx.projection.forEach((p) => { const x = w2.addRow([p.k ? String(p.an) : "Date saisie (" + p.an + ")", p.y, p.IR, p.PS, p.sur, p.tot]); [3, 4, 5, 6].forEach((k) => { x.getCell(k).numFmt = EUR; }); });
    }
    return { wb, noms };
  }

  const ExcelPVI = { construire };
  if (typeof module !== "undefined" && module.exports) module.exports = ExcelPVI; else racine.ExcelPVI = ExcelPVI;
})(typeof window !== "undefined" ? window : globalThis);
