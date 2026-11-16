// =====================================================================================
//  excel.js — le classeur Excel de l'investissement immobilier, en formules vivantes
// -------------------------------------------------------------------------------------
//  • Un onglet de synthèse, puis un onglet par montage.
//  • Dans chaque onglet de montage : les hypothèses en haut (cellules jaunes, modifiables),
//    puis les résultats, les calculs de départ, le tableau année par année et la revente.
//    Toutes les formules ne renvoient qu'à des cellules du même onglet : on suit les flèches
//    (Formules › Repérer les antécédents) sans changer d'onglet. Aucun nom défini.
//  • Les formules refont le calcul de l'appli (moteur.js), à l'euro près. Une seule limite,
//    signalée dans l'onglet : la durée de détention fixe le nombre de lignes du tableau
//    (refaire l'export pour la changer), comme le nombre d'associés.
//  • Le même fichier tourne dans le navigateur (window.ExcelImmo) et dans Node (tests).
// =====================================================================================
(function (racine) {
  "use strict";
  const EUR = '#,##0 "€";[Red]-#,##0 "€"', PCT = "0.00 %", PCT1 = "0.0 %", NB = "0", DEC = "0.0";
  const BLEU = "FF0C2D39", JAUNE = "FFFDF3D6", BLEU_SAISIE = "FF1F4E9A", GRIS = "FF7C7466", FOND = "FFEFE9DE";
  const pc = (x) => (+x || 0) / 100;
  const lettre = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const nomOnglet = (s) => "'" + String(s).replace(/'/g, "''") + "'";

  // surtaxe sur les plus-values élevées (mêmes tranches que moteur.js), écrite en formule
  const TRANCHES = [[60000, .02, 1 / 20], [100000, .02, 0], [110000, .03, 1 / 10], [150000, .03, 0], [160000, .04, .15], [200000, .04, 0], [210000, .05, .2], [250000, .05, 0], [260000, .06, .25]];
  function formuleSurtaxe(x) {
    let f = "0.06*" + x;
    for (let i = TRANCHES.length - 1; i >= 0; i--) {
      const [hi, r, l] = TRANCHES[i];
      f = `IF(${x}<=${hi},MAX(0,${r}*${x}${l ? `-(${hi}-${x})*${+l.toFixed(6)}` : ""}),${f})`;
    }
    return `IF(${x}<=50000,0,${f})`;
  }

  // ---------------------------------------------------------------- un onglet : rangées, noms, formules à résoudre
  function creerFeuille(ws, couleur) {
    const noms = {}, attente = [];
    let r = 1;
    const ecrire = (cellule, v) => {
      if (typeof v === "string" && v[0] === "=") attente.push([cellule, v.slice(1)]);
      else cellule.value = v;
    };
    const F = {
      ws, noms,
      get r() { return r; },
      saut(n) { r += n || 1; },
      titre(t, sous) {
        ws.getCell(r, 1).value = t; ws.getCell(r, 1).font = { bold: true, size: 15, color: { argb: BLEU } }; r++;
        if (sous) { ws.getCell(r, 1).value = sous; ws.getCell(r, 1).font = { color: { argb: GRIS }, size: 10 }; r++; }
        r++;
      },
      section(t, aide) {
        const c = ws.getCell(r, 1); c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        for (let i = 1; i <= 3; i++) ws.getCell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleur } };
        r++;
        if (aide) { ws.getCell(r, 1).value = aide; ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: GRIS } }; r++; }
      },
      sousTitre(t) { ws.getCell(r, 1).value = t; ws.getCell(r, 1).font = { bold: true, color: { argb: BLEU } }; r++; },
      // une hypothèse (saisie) : cellule jaune
      hyp(nom, lib, val, fmt, note, fixe) {
        ws.getCell(r, 1).value = lib;
        const c = ws.getCell(r, 2); c.value = val; c.numFmt = fmt || EUR;
        if (!fixe) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: JAUNE } }; c.font = { color: { argb: BLEU_SAISIE } }; }
        else c.font = { color: { argb: GRIS } };
        if (note) { ws.getCell(r, 3).value = note; ws.getCell(r, 3).font = { italic: true, size: 9, color: { argb: GRIS } }; }
        noms[nom] = "$B$" + r; r++;
      },
      // un calcul (formule)
      calc(nom, lib, formule, fmt, note, fort) {
        ws.getCell(r, 1).value = lib;
        const c = ws.getCell(r, 2); ecrire(c, formule); c.numFmt = fmt || EUR;
        if (fort) { ws.getCell(r, 1).font = { bold: true }; c.font = { bold: true }; ws.getCell(r, 1).fill = ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND } }; }
        if (note) { ws.getCell(r, 3).value = note; ws.getCell(r, 3).font = { italic: true, size: 9, color: { argb: GRIS } }; }
        if (nom) noms[nom] = "$B$" + r;
        r++;
      },
      texte(t, gris) { ws.getCell(r, 1).value = t; if (gris) ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: GRIS } }; r++; },
      // le tableau année par année.
      //  colonnes : [{ n, t, f, f1, f0, fmt, tot }] ; dans les formules : [x] = colonne x de la même ligne,
      //  [x^] = colonne x de la ligne précédente ; {nom} = cellule nommée de l'onglet.
      //  Noms créés : {plage:x} (années 1 à N), {tout:x} (achat compris), {fin:x} (dernière année), {an1:x}.
      tableau(colonnes, N, opts) {
        opts = opts || {};
        const col = {}; colonnes.forEach((c, i) => { col[c.n] = i + 1; });
        const tete = r;
        colonnes.forEach((c, i) => {
          const x = ws.getCell(r, i + 1); x.value = c.t;
          x.font = { bold: true, color: { argb: "FFFFFFFF" } }; x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleur } };
          x.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
        });
        ws.getRow(r).height = 44; r++;
        const premiere = r, avecAchat = colonnes.some((c) => c.f0 != null);
        const remplacer = (f, ligne) => f.replace(/\[(\w+)(\^|@-\d+)?\]/g, (m, n, dec) => {
          if (!col[n]) throw new Error("colonne inconnue : " + n);
          return lettre(col[n]) + (dec === "^" ? ligne - 1 : dec ? ligne - +dec.slice(2) : ligne);
        });
        const lignes = [];
        if (avecAchat) lignes.push(0);
        for (let a = 1; a <= N; a++) lignes.push(a);
        for (const a of lignes) {
          colonnes.forEach((c, i) => {
            const x = ws.getCell(r, i + 1);
            let f = a === 0 ? c.f0 : (a === 1 && c.f1 != null ? c.f1 : c.f);
            if (typeof f === "function") f = f(a);
            if (c.n === "a") { x.value = a === 0 ? "Achat" : a; x.alignment = { horizontal: "center" }; return; }
            if (f == null) return;
            if (typeof f === "string" && f[0] === "=") ecrire(x, "=" + remplacer(f.slice(1), r)); else x.value = f;
            x.numFmt = c.fmt || EUR;
          });
          if (a % 2 === 0) colonnes.forEach((c, i) => { const x = ws.getCell(r, i + 1); if (!x.fill || !x.fill.fgColor) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF8F3" } }; });
          r++;
        }
        const an1 = premiere + (avecAchat ? 1 : 0), finL = r - 1;
        colonnes.forEach((c) => {
          const L = lettre(col[c.n]);
          noms["plage:" + c.n] = `$${L}$${an1}:$${L}$${finL}`;
          noms["tout:" + c.n] = `$${L}$${premiere}:$${L}$${finL}`;
          noms["fin:" + c.n] = `$${L}$${finL}`;
          noms["an1:" + c.n] = `$${L}$${an1}`;
        });
        // ligne des totaux
        if (colonnes.some((c) => c.tot)) {
          ws.getCell(r, 1).value = "Total";
          colonnes.forEach((c, i) => {
            if (!c.tot) return;
            const x = ws.getCell(r, i + 1); ecrire(x, `=SUM(${noms["plage:" + c.n]})`); x.numFmt = c.fmt || EUR;
          });
          ws.getRow(r).font = { bold: true };
          ws.getRow(r).eachCell((x) => { x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND } }; });
          r++;
        }
        ws.views = [{ state: "frozen", xSplit: 1, ySplit: 0 }];
        return { tete, premiere, fin: finL };
      },
      // remplace les {noms} par les adresses de l'onglet
      resoudre() {
        for (const [cellule, f] of attente) {
          const g = f.replace(/\{([^}]+)\}/g, (m, n) => { if (!(n in noms)) throw new Error("nom inconnu : " + n + " dans " + f); return noms[n]; });
          cellule.value = { formula: g };
        }
      }
    };
    return F;
  }

  // ---------------------------------------------------------------- les morceaux communs
  function hypBien(F, h, B, o) {
    F.section("Hypothèses", "Cellules jaunes : modifiez-les, tout l'onglet se recalcule.");
    F.sousTitre("Le bien");
    F.hyp("prix", "Prix d'achat (net vendeur)", B.prix);
    F.hyp("frais", "Frais d'acquisition", Math.round(B.frais * 100) / 100, EUR, h.fraisAuto ? "calculés à " + (h.neuf ? "2,5" : "8") + " % du prix dans l'appli" : "");
    F.hyp("travaux", "Travaux à l'achat", B.travaux);
    F.hyp("entretien", "Travaux d'entretien, réparation ou amélioration ?", B.travauxEntretien ? 1 : 0, NB, "1 = oui (déductibles) ; 0 = construction, agrandissement");
    if (o.meuble) F.hyp("mobilier", "Mobilier", +h.mobilier || 0);
    if (o.terrain) F.hyp("terrain", "Part du terrain (non amortissable)", pc(h.terrain), PCT1);
    F.sousTitre("Loyers et charges");
    F.hyp("loyerM", o.meuble ? "Loyer meublé hors charges, par mois" : "Loyer nu hors charges, par mois", o.meuble ? +h.loyerMeuble || 0 : +h.loyerNu || 0);
    F.hyp("vacance", "Vacance locative (mois par an)", Math.min(12, Math.max(0, +h.vacance || 0)), DEC);
    F.hyp("gestion", "Frais de gestion (en % des loyers)", pc(h.gestion), PCT1);
    F.hyp("copro", "Charges de copropriété non récupérables, par an", +h.copro || 0);
    F.hyp("tf", "Taxe foncière, par an", +h.taxeFonciere || 0);
    F.hyp("pno", "Assurance propriétaire non occupant, par an", +h.pno || 0);
    if (o.meuble) F.hyp("cfe", "CFE, par an", +h.cfe || 0);
    F.hyp("revalL", "Hausse des loyers, par an", pc(h.revalLoyer), PCT);
    F.hyp("revalC", "Hausse des charges, par an", pc(h.revalCharges), PCT);
    F.sousTitre("Financement");
    F.hyp("apport", "Apport", +h.apport || 0);
    F.hyp("taux", "Taux du prêt", pc(h.taux), PCT);
    F.hyp("duree", "Durée du prêt (ans)", +h.duree || 0, NB);
    F.hyp("assurance", "Assurance emprunteur (% du capital, par an)", pc(h.assurance), PCT);
  }
  function hypRevente(F, h, N) {
    F.sousTitre("Revente");
    F.hyp("N", "Durée de détention (ans)", N, NB, "fixe : une ligne par année dans le tableau ; refaire l'export pour la changer", true);
    F.hyp("revalP", "Valorisation du bien, par an", pc(h.revalPrix), PCT);
    F.hyp("fc", "Frais de vente (en % du prix)", pc(h.fraisCession), PCT1);
  }
  function hypReglages(F, R, cles) {
    const L = {
      psFoncier: ["Prélèvements sociaux sur revenus fonciers", PCT1], psBIC: ["Prélèvements sociaux sur BIC (LMNP)", PCT1], psPV: ["Prélèvements sociaux sur plus-values", PCT1],
      irPV: ["Impôt sur le revenu des plus-values", PCT1], forfaitFrais: ["Forfait frais d'acquisition (plus-value)", PCT1], forfaitTravaux: ["Forfait travaux après 5 ans (plus-value)", PCT1],
      microFoncierAbat: ["Micro-foncier : abattement", PCT1], microBICAbat: ["Micro-BIC : abattement", PCT1], deficitGlobal: ["Déficit foncier imputable sur le revenu global, par an", EUR],
      dureeBati: ["Durée d'amortissement du bâti (ans)", NB], dureeTravaux: ["Durée d'amortissement des travaux (ans)", NB], dureeMobilier: ["Durée d'amortissement du mobilier (ans)", NB],
      isReduit: ["IS : taux réduit", PCT1], isSeuil: ["IS : taux réduit jusqu'à", EUR], isNormal: ["IS : taux normal", PCT1], pfu: ["Flat tax (dividendes, boni)", PCT1], droitPartage: ["Droit de partage (liquidation)", PCT1]
    };
    F.sousTitre("Règles fiscales (menu Réglages de l'appli)");
    for (const k of cles) { const [lib, fmt] = L[k]; F.hyp(k, lib, fmt === EUR || fmt === NB ? +R[k] : pc(R[k]), fmt); }
  }
  // calculs de départ du prêt : suffixe "" (banque) ou "H" (holding)
  function calcPret(F, s, empF, tauxF, dureeF, assuF) {
    F.calc("emp" + s, s ? "Montant prêté par la holding" : "Emprunt bancaire", empF);
    F.calc("nMois" + s, "Nombre de mensualités", `=ROUND(${dureeF}*12,0)`, NB);
    F.calc("tM" + s, "Taux mensuel", `=${tauxF}/12`, "0.0000 %");
    F.calc("mens0" + s, "Mensualité hors assurance", `=IF(OR({emp${s}}<=0,{nMois${s}}<=0),0,PMT({tM${s}},{nMois${s}},-{emp${s}}))`);
    F.calc("assuM0" + s, "Assurance par mois", assuF ? `={emp${s}}*${assuF}/12` : "=0");
  }
  // colonnes du prêt (suffixe s) ; anticipation : remboursement anticipé à la fin de l'année 1 (montant {anticipe})
  function colsPret(s, anticipation) {
    const c = [
      { n: "crdD" + s, t: "Capital dû en début d'année" + (s ? " (holding)" : ""), f1: `={emp${s}}`, f: `=[crdF${s}^]` },
      { n: "mois" + s, t: "Mois remboursés" + (s ? " (holding)" : ""), f: `=MAX(0,MIN(12,{nMois${s}}-12*([a]-1)))`, fmt: NB },
      { n: "mens" + s, t: "Mensualité" + (s ? " (holding)" : ""), f1: `={mens0${s}}`, f: anticipation ? `=IF([antic^]>0,IF({nMois}-12*([a]-1)>0,PMT({tM},{nMois}-12*([a]-1),-[crdF^]),0),[mens^])` : `=[mens${s}^]` },
      { n: "assuM" + s, t: "Assurance par mois" + (s ? " (holding)" : ""), f1: `={assuM0${s}}`, f: anticipation ? `=IF([antic^]>0,IF([crdAv^]>0,[assuM^]*[crdF^]/[crdAv^],0),[assuM^])` : `=[assuM${s}^]` },
      { n: "crdAv" + s, t: anticipation ? "Capital dû avant remboursement anticipé" : "Capital dû en fin d'année" + (s ? " (holding)" : ""), f: `=IF([mois${s}]=0,[crdD${s}],MAX(0,ROUND(-FV({tM${s}},[mois${s}],-[mens${s}],[crdD${s}]),2)))` }
    ];
    if (anticipation) c.push({ n: "antic", t: "Remboursement anticipé", f1: "=MIN([crdAv],{anticipe})", f: "=0", tot: true },
      { n: "crdF", t: "Capital dû en fin d'année", f: "=[crdAv]-[antic]" });
    else c.push({ n: "crdF" + s, t: "(fin d'année)", f: `=[crdAv${s}]`, cache: true });
    c.push({ n: "int" + s, t: "Intérêts" + (s ? " (holding)" : ""), f: `=[mois${s}]*[mens${s}]-([crdD${s}]-[crdAv${s}])`, tot: true },
      { n: "cap" + s, t: "Capital remboursé" + (s ? " (holding)" : ""), f: `=[crdD${s}]-[crdAv${s}]`, tot: true },
      { n: "assu" + s, t: "Assurance" + (s ? " (holding)" : ""), f: `=[mois${s}]*[assuM${s}]`, tot: true });
    return c.filter((x) => !x.cache || anticipation);
  }
  // sans anticipation, « crdF » est la même colonne que « crdAv » : on la renomme
  function prets(s, anticipation) {
    const c = colsPret(s, anticipation);
    if (!anticipation) c.forEach((x) => { if (x.n === "crdAv" + s) { x.n = "crdF" + s; } x.f = x.f && x.f.replace(new RegExp("crdAv" + s + "\\b", "g"), "crdF" + s); if (x.f1) x.f1 = x.f1.replace(new RegExp("crdAv" + s + "\\b", "g"), "crdF" + s); });
    return c;
  }
  // déficits reportables 10 ans, imputés des plus anciens aux plus récents (comme moteur.js) :
  //  « cons » = ce qui est déjà imputé ou éteint ; au-delà de 10 ans, tout le déficit de l'année est sorti.
  function colsReports(p, lib, imputF, creeF) {
    return [
      { n: p + "dispo", t: lib + "déficits reportables (début)", f1: "=0", f: `=[${p}cum^]-[${p}cons]` },
      { n: p + "imput", t: lib + "déficits imputés", f: imputF, tot: true },
      { n: p + "cree", t: lib + "déficit reporté de l'année", f: creeF, tot: true },
      { n: p + "cum", t: lib + "déficits reportés depuis l'achat", f1: `=[${p}cree]`, f: `=[${p}cum^]+[${p}cree]` },
      { n: p + "cons", t: lib + "déficits déjà imputés ou éteints (10 ans)", f1: "=0", f: (a) => a >= 12 ? `=MAX([${p}cons^]+[${p}imput^],[${p}cum@-11])` : `=[${p}cons^]+[${p}imput^]` }
    ];
  }
  let ESTIMATION_TRI = null;
  const COL_LOYER = { n: "loyer", t: "Loyers encaissés", f: "={loyerM}*12*(1-{vacance}/12)*(1+{revalL})^([a]-1)", tot: true };
  const COL_CHP = { n: "chP", t: "Charges du propriétaire (copro, taxe foncière, PNO)", f: "=({copro}+{tf}+{pno})*(1+{revalC})^([a]-1)", tot: true };
  const COL_GEST = { n: "gest", t: "Frais de gestion", f: "=[loyer]*{gestion}", tot: true };
  const COL_TRAV = { n: "trav", t: "Travaux déduits", f1: "={travaux}*{entretien}", f: "=0", tot: true };

  // plus-value des particuliers (détention directe, LMNP, SCI à l'IR) ; quotes = associés [{nom, q}] ou null
  function blocPlusValue(F, o) {
    F.section("Revente et plus-value");
    F.calc("prixRev", "Prix de revente estimé", "={prix}*(1+{revalP})^{N}");
    F.calc("fcM", "Frais de vente", "={prixRev}*{fc}");
    F.calc("fraisRet", "Frais d'acquisition retenus (réels ou forfait)", `=MAX(${o.frais},${o.prix}*{forfaitFrais})`);
    F.calc("travR", "Travaux réels non déduits", o.travauxReels);
    F.calc("travRet", "Travaux retenus (forfait possible après 5 ans)", `=IF({N}>5,MAX({travR},${o.prix}*{forfaitTravaux}),{travR})`);
    F.calc("prixRevient", o.libPrix || "Prix de revient", `=${o.prix}+{fraisRet}+{travRet}`);
    if (o.amort) F.calc("amortR", "Amortissements réintégrés (LMNP, depuis 2025)", o.amort);
    F.calc("abIR", "Abattement pour durée de détention : impôt sur le revenu", "=IF({N}<6,0,IF({N}>=22,1,0.06*({N}-5)))", PCT1);
    F.calc("abPS", "Abattement pour durée de détention : prélèvements sociaux", "=IF({N}<6,0,IF({N}>=30,1,IF({N}<22,0.0165*({N}-5),0.28+0.09*({N}-22))))", PCT1);
    const brute = `({prixRev}-{fcM}-{prixRevient}${o.amort ? "+{amortR}" : ""})`;
    if (!o.associes) {
      F.calc("pvBrute", "Plus-value brute", "=" + brute);
      F.calc("baseIR", "Base imposable à l'impôt sur le revenu", "=MAX(0,{pvBrute})*(1-{abIR})");
      F.calc("basePS", "Base des prélèvements sociaux", "=MAX(0,{pvBrute})*(1-{abPS})");
      F.calc("irPVm", "Impôt sur le revenu", "={baseIR}*{irPV}");
      F.calc("psPVm", "Prélèvements sociaux", "={basePS}*{psPV}");
      F.calc("stPV", "Surtaxe sur plus-value élevée", "=" + formuleSurtaxe("{baseIR}"));
      F.calc("impRev", "Impôts à la revente", "={irPVm}+{psPVm}+{stPV}", EUR, "", true);
    } else {
      F.calc("pvBrute", "Plus-value brute (toute la SCI)", "=" + brute);
      const totaux = [];
      o.associes.forEach((x, i) => {
        F.sousTitre(x.nom + " (quote-part du capital)");
        F.calc("pvB" + i, "Plus-value brute de l'associé", `={pvBrute}*{q${i}}`);
        F.calc("bIR" + i, "Base à l'impôt sur le revenu", `=MAX(0,{pvB${i}})*(1-{abIR})`);
        F.calc("imp" + i, "Impôt, prélèvements et surtaxe", `={bIR${i}}*{irPV}+MAX(0,{pvB${i}})*(1-{abPS})*{psPV}+${formuleSurtaxe(`{bIR${i}}`)}`);
        totaux.push(`{imp${i}}`);
      });
      F.calc("impRev", "Impôts à la revente (tous les associés)", "=" + totaux.join("+"), EUR, "", true);
    }
    F.calc("crdFin", "Capital restant dû remboursé", o.crd || "={fin:crdT}");
    F.calc("net", "Net en poche à la revente", "={prixRev}-{fcM}-{crdFin}-{impRev}", EUR, "", true);
  }
  // les indicateurs (même définition que l'appli)
  function blocResultats(F, o) {
    F.section("Résultats", "Calculés plus bas dans l'onglet.");
    F.calc("cout", "Coût total de l'opération", o.cout || "={cout0}");
    F.calc("emprunt", "Montant emprunté", o.emprunt || "={emp}");
    F.calc("mensTot", "Mensualité (prêt + assurance)", o.mens || "={mens0}+{assuM0}");
    F.calc("cashCum", "Trésorerie cumulée pendant la détention (après impôts)", "=SUM({plage:cash})");
    F.calc("effort", "Effort d'épargne moyen, par mois", "=-{cashCum}/{N}/12", EUR, "positif : ce que vous ajoutez ; négatif : ce que vous gagnez");
    F.calc("impDet", "Impôts pendant la détention", o.societe ? "=SUM({plage:imp})+SUM({plage:isS})" : "=SUM({plage:imp})");
    F.calc("impRevR", "Impôts à la revente", "={impRev}");
    F.calc("netR", "Net en poche à la revente", "={net}");
    if (o.societe) {
      F.calc("mise", "Mise de fonds de votre société", "={miseS}");
      F.calc("gain", "Gain de votre société (après IS)", "=SUM({tout:fluxS})", EUR, "avant la flat tax d'une sortie");
    }
    F.calc("enrich", "Enrichissement net", `={net}+{cashCum}-{apportR}${o.societe ? "+{gain}" : ""}`, EUR, "net à la revente − apport − efforts d'épargne" + (o.societe ? " + gain de la société" : ""), true);
    const t = o.tri != null ? o.tri : ESTIMATION_TRI, g2 = t != null && isFinite(t) ? +t.toFixed(4) : 0.03;
    F.calc("tri", "Rendement de l'apport (TRI)", `=IFERROR(IRR({tout:flux},${g2}),IFERROR(IRR({tout:flux},0),IFERROR(IRR({tout:flux},-0.1),"–")))`, PCT, "taux de rendement interne des flux de la colonne « Flux pour le TRI »", true);
  }
  const colsFin = (o) => [
    { n: "flux", t: "Flux pour le TRI" + (o.societe ? " (foyer + société)" : ""), f0: o.societe ? "=-{apportR}-{miseS}" : "=-{apportR}", f: `=[cash]${o.societe ? "+[fluxS]" : ""}+IF([a]={N},{net},0)` },
    { n: "tresoC", t: "Trésorerie cumulée (apport compris)", f0: "=-{apportR}", f: "=[tresoC^]+[cash]" }
  ];

  // ---------------------------------------------------------------- les montages
  function nuOuLmnp(F, id, h, R, M, N) {
    const meuble = id === "lmnpMicro" || id === "lmnpReel", micro = id === "nuMicro" || id === "lmnpMicro", reel = !micro;
    const B = M.base(h, R, meuble);
    hypBien(F, h, B, { meuble, terrain: id === "lmnpReel" });
    if (id === "lmnpReel") F.hyp("compta", "Comptable LMNP, par an", +h.comptaLMNP || 0);
    F.sousTitre("Fiscalité"); F.hyp("tmi", "Tranche marginale d'imposition", pc(h.tmi), PCT1);
    hypRevente(F, h, N);
    const regl = meuble ? ["psBIC"] : ["psFoncier"];
    if (id === "nuMicro") regl.push("microFoncierAbat"); if (id === "nuReel") regl.push("deficitGlobal"); if (id === "lmnpMicro") regl.push("microBICAbat");
    if (id === "lmnpReel") regl.push("dureeBati", "dureeTravaux", "dureeMobilier");
    regl.push("irPV", "psPV", "forfaitFrais", "forfaitTravaux");
    hypReglages(F, R, regl);
    F.saut();
    blocResultats(F, {});
    F.saut();
    F.section("Calculs de départ");
    F.calc("cout0", "Coût de l'opération", meuble ? "={prix}+{frais}+{travaux}+{mobilier}" : "={prix}+{frais}+{travaux}");
    F.calc("apportR", "Apport retenu", "=MIN({apport},{cout0})");
    calcPret(F, "", "=MAX(0,{cout0}-{apport})", "{taux}", "{duree}", "{assurance}");
    if (id === "lmnpReel") {
      F.calc("aB", "Amortissement du bâti (frais d'achat compris), par an", "=({prix}*(1-{terrain})+{frais})/{dureeBati}");
      F.calc("aT", "Amortissement des travaux, par an", "=IF({entretien}=1,0,{travaux}/{dureeTravaux})");
      F.calc("aM", "Amortissement du mobilier, par an", "={mobilier}/{dureeMobilier}");
      F.calc("partImm", "Part de l'immeuble dans les amortissements", "=IF({aB}+{aT}+{aM}=0,0,({aB}+{aT})/({aB}+{aT}+{aM}))", PCT1);
    }
    F.saut();
    F.section("Année par année", reel && id !== "lmnpReel" ? "Déficits : la part due aux intérêts et l'excédent sur le plafond se reportent 10 ans." : id === "lmnpReel" ? "Les amortissements ne créent pas de déficit : l'excédent est mis en réserve. Les déficits se reportent 10 ans." : "");
    const sortie = meuble ? "[chP]+[cfeA]+[gest]" + (id === "lmnpReel" ? "+{compta}" : "") : "[chP]+[gest]";
    const fisc = meuble ? "{tmi}+{psBIC}" : "{tmi}+{psFoncier}";
    let cols = [{ n: "a", t: "Année" }, COL_LOYER, COL_CHP];
    if (meuble) cols.push({ n: "cfeA", t: "CFE", f: "={cfe}*(1+{revalC})^([a]-1)", tot: true });
    cols.push(COL_GEST);
    if (reel) cols.push(COL_TRAV);
    if (id === "lmnpReel") cols.push({ n: "comptaA", t: "Comptable", f: "={compta}", tot: true });
    cols.push({ n: "intAss", t: "Intérêts et assurance", f: "=[int]+[assu]", tot: true });
    if (id === "nuMicro") cols.push({ n: "res", t: "Revenu imposable (après abattement)", f: "=[loyer]*(1-{microFoncierAbat})", tot: true }, { n: "impos", t: "Imposable", f: "=[res]", tot: true }, { n: "imp", t: "Impôts (IR + PS)", f: `=[impos]*(${fisc})`, tot: true });
    if (id === "lmnpMicro") cols.push({ n: "res", t: "Revenu imposable (après abattement)", f: "=[loyer]*(1-{microBICAbat})", tot: true }, { n: "impos", t: "Imposable", f: "=[res]", tot: true }, { n: "imp", t: "Impôts (IR + PS)", f: `=[impos]*(${fisc})`, tot: true });
    if (id === "nuReel") cols.push(
      { n: "res", t: "Résultat foncier", f: "=[loyer]-[chP]-[gest]-[trav]-[intAss]", tot: true },
      { n: "glob", t: "Déficit imputé sur le revenu global", f: "=IF([res]<0,MIN(MAX(0,-[res]-MIN(-[res],[intAss])),{deficitGlobal}),0)", tot: true },
      ...colsReports("", "", "=IF([res]>=0,MIN([dispo],[res]),0)", "=IF([res]<0,-[res]-[glob],0)"),
      { n: "impos", t: "Imposable", f: "=IF([res]>=0,[res]-[imput],0)", tot: true },
      { n: "imp", t: "Impôts (IR + PS − économie)", f: `=[impos]*(${fisc})-[glob]*{tmi}`, tot: true });
    if (id === "lmnpReel") cols.push(
      { n: "avant", t: "Résultat avant amortissements", f: "=[loyer]-[chP]-[cfeA]-[gest]-[comptaA]-[trav]-[intAss]", tot: true },
      ...colsReports("d", "", "=IF([avant]>=0,MIN([ddispo],[avant]),0)", "=IF([avant]<0,-[avant],0)"),
      { n: "amA", t: "Amortissements de l'année", f: "=IF([a]<={dureeBati},{aB},0)+IF([a]<={dureeTravaux},{aT},0)+IF([a]<={dureeMobilier},{aM},0)", tot: true },
      { n: "amStD", t: "Amortissements en réserve (début)", f1: "=0", f: "=[amStF^]" },
      { n: "amDed", t: "Amortissements déduits", f: "=IF([avant]<0,0,MIN([amA]+[amStD],[avant]-[dimput]))", tot: true },
      { n: "amStF", t: "Amortissements en réserve (fin)", f: "=[amStD]+[amA]-[amDed]" },
      { n: "res", t: "Résultat (après amortissements)", f: "=[avant]-[amDed]", tot: true },
      { n: "impos", t: "Imposable", f: "=IF([avant]>=0,[avant]-[dimput]-[amDed],0)", tot: true },
      { n: "imp", t: "Impôts (IR + PS)", f: `=[impos]*(${fisc})`, tot: true });
    cols.push({ n: "cash", t: "Cash-flow après impôts", f: `=[loyer]-(${sortie}+[int]+[assu]+[cap])-[imp]`, tot: true });
    cols = cols.concat(colsFin({}), prets("", false), [{ n: "crdT", t: "Capital restant dû", f: "=[crdF]" }]);
    F.tableau(cols, N);
    F.saut();
    blocPlusValue(F, { prix: "{prix}", frais: "{frais}", travauxReels: reel && id !== "lmnpReel" || id === "lmnpReel" ? "={travaux}*(1-{entretien})" : "={travaux}", amort: id === "lmnpReel" ? "=SUM({plage:amDed})*{partImm}" : null });
  }

  function sci(F, id, h, R, M, N) {
    const holding = id === "sciIRHolding", inegal = id === "sciIRInegal";
    const B = M.base(h, R, false);
    hypBien(F, h, B, {});
    F.sousTitre("La SCI");
    F.hyp("compta", "Frais annuels de la SCI", +h.comptaSCI || 0);
    F.hyp("constit", "Création de la SCI", +h.constitution || 0);
    const asso = (h.associes && h.associes.length ? h.associes : [{ nom: "Associé", parts: 100, tmi: h.tmi }]);
    F.sousTitre("Les associés");
    asso.forEach((x, i) => {
      F.hyp("parts" + i, (x.nom || "Associé " + (i + 1)) + " : part du capital", pc(x.parts), PCT1);
      if (inegal) F.hyp("pres" + i, (x.nom || "Associé " + (i + 1)) + " : part des résultats (statuts)", pc(x.resultat ?? x.parts), PCT1);
      F.hyp("tmi" + i, (x.nom || "Associé " + (i + 1)) + " : tranche marginale", pc(x.tmi), PCT1);
    });
    if (holding) {
      F.sousTitre("Votre holding prêteuse");
      F.hyp("holdM", "Montant prêté par la holding", Math.max(0, +h.holdingMontant || 0));
      F.hyp("holdT", "Taux du prêt de la holding", pc(h.holdingTaux), PCT);
      F.hyp("holdD", "Durée du prêt de la holding (ans)", +h.holdingDuree || 0, NB);
      F.hyp("isSoc", "Taux d'IS de la holding (marginal)", pc(h.isSociete), PCT1);
    }
    hypRevente(F, h, N);
    hypReglages(F, R, ["psFoncier", "deficitGlobal", "irPV", "psPV", "forfaitFrais", "forfaitTravaux"]);
    F.saut();
    blocResultats(F, holding ? { societe: true, emprunt: "={emp}+{empH}", mens: "={mens0}+{assuM0}+{mens0H}" } : {});
    F.saut();
    F.section("Calculs de départ");
    F.calc("cout0", "Coût de l'opération", "={prix}+{frais}+{travaux}");
    F.calc("apportR", "Apport retenu", "=MIN({apport},{cout0})");
    F.calc("empTot", "Financement à emprunter", "=MAX(0,{cout0}-{apport})");
    if (holding) {
      F.calc("miseS", "Prêté par la holding (dans la limite du besoin)", "=MIN({holdM},{empTot})");
      calcPret(F, "", "={empTot}-{miseS}", "{taux}", "{duree}", "{assurance}");
      calcPret(F, "H", "={miseS}", "{holdT}", "{holdD}", null);
    } else calcPret(F, "", "={empTot}", "{taux}", "{duree}", "{assurance}");
    const sp = asso.map((x, i) => `{parts${i}}`).join("+"), sr = inegal ? asso.map((x, i) => `{pres${i}}`).join("+") : sp;
    asso.forEach((x, i) => {
      F.calc("q" + i, (x.nom || "Associé") + " : quote-part du capital", `=IF((${sp})=0,0,{parts${i}}/(${sp}))`, PCT1);
      F.calc("qr" + i, (x.nom || "Associé") + " : quote-part des résultats", inegal ? `=IF((${sr})=0,0,{pres${i}}/(${sr}))` : `={q${i}}`, PCT1);
    });
    F.saut();
    F.section("Année par année", "Chaque associé déclare sa quote-part ; ses déficits se reportent chez lui.");
    let cols = [{ n: "a", t: "Année" }, COL_LOYER, COL_CHP, COL_GEST, COL_TRAV,
      { n: "fSCI", t: "Frais de la SCI", f1: "={compta}+{constit}", f: "={compta}", tot: true },
      { n: "intAss", t: "Intérêts et assurance", f: holding ? "=[int]+[assu]+[intH]" : "=[int]+[assu]", tot: true },
      { n: "res", t: "Résultat de la SCI", f: "=[loyer]-[chP]-[gest]-[trav]-[fSCI]-[intAss]", tot: true }];
    const imps = [];
    asso.forEach((x, i) => {
      const nm = (x.nom || "Associé " + (i + 1));
      cols.push(
        { n: "r" + i, t: nm + " : quote-part du résultat", f: `=[res]*{qr${i}}`, tot: true },
        { n: "g" + i, t: nm + " : déficit sur le revenu global", f: `=IF([r${i}]<0,MIN(MAX(0,-[r${i}]-MIN(-[r${i}],[intAss]*{qr${i}})),{deficitGlobal}),0)` },
        ...colsReports("x" + i, nm + " : ", `=IF([r${i}]>=0,MIN([x${i}dispo],[r${i}]),0)`, `=IF([r${i}]<0,-[r${i}]-[g${i}],0)`),
        { n: "i" + i, t: nm + " : impôts (IR + PS − économie)", f: `=IF([r${i}]>=0,[r${i}]-[x${i}imput],0)*({tmi${i}}+{psFoncier})-[g${i}]*{tmi${i}}`, tot: true });
      imps.push(`[i${i}]`);
    });
    cols.push({ n: "imp", t: "Impôts de tous les associés", f: "=" + imps.join("+"), tot: true },
      { n: "cash", t: "Cash-flow après impôts", f: `=[loyer]-([chP]+[gest]+[fSCI]+[int]+[assu]+[cap]${holding ? "+[intH]+[capH]" : ""})-[imp]`, tot: true });
    if (holding) cols.push(
      { n: "isS", t: "Holding : IS sur les intérêts reçus", f: "=[intH]*{isSoc}", tot: true },
      { n: "cashS", t: "Holding : intérêts et capital reçus, après IS", f: "=[intH]-[isS]+[capH]", tot: true },
      { n: "fluxS", t: "Holding : flux (prêt, puis remboursements, solde à la revente)", f0: "=-{miseS}", f: "=[cashS]+IF([a]={N},[crdFH],0)" });
    cols = cols.concat(colsFin({ societe: holding }), prets("", false), holding ? prets("H", false) : [],
      [{ n: "crdT", t: "Capital restant dû (total)", f: holding ? "=[crdF]+[crdFH]" : "=[crdF]" }]);
    F.tableau(cols, N);
    F.saut();
    blocPlusValue(F, { prix: "{prix}", frais: "{frais}", travauxReels: "={travaux}*(1-{entretien})", associes: asso.map((x, i) => ({ nom: x.nom || "Associé " + (i + 1) })) });
  }

  function sciIS(F, h, R, M, N) {
    const B = M.base(h, R, false);
    hypBien(F, h, B, { terrain: true });
    F.sousTitre("La SCI à l'IS");
    F.hyp("compta", "Comptable de la SCI, par an", +h.comptaIS || 0);
    F.hyp("constit", "Création de la SCI", +h.constitution || 0);
    F.hyp("distrib", "Distribuer chaque année le bénéfice ?", h.distribuer ? 1 : 0, NB, "1 = oui ; 0 = mise en réserve et remboursement du compte courant");
    hypRevente(F, h, N);
    hypReglages(F, R, ["isReduit", "isSeuil", "isNormal", "dureeBati", "dureeTravaux", "pfu", "droitPartage"]);
    F.saut();
    blocResultats(F, {});
    F.saut();
    F.section("Calculs de départ");
    F.calc("cout0", "Coût de l'opération", "={prix}+{frais}+{travaux}");
    F.calc("apportR", "Apport (versé en compte courant)", "=MIN({apport},{cout0})");
    calcPret(F, "", "=MAX(0,{cout0}-{apport})", "{taux}", "{duree}", "{assurance}");
    F.calc("aB", "Amortissement du bâti, par an", "={prix}*(1-{terrain})/{dureeBati}");
    F.calc("aT", "Amortissement des travaux, par an", "=IF({entretien}=1,0,{travaux}/{dureeTravaux})");
    F.saut();
    F.section("Année par année", "Les frais d'achat sont passés en charges la 1re année ; les déficits se reportent sans limite. La trésorerie rembourse d'abord le compte courant.");
    const IS = (b) => `MIN(${b},{isSeuil})*{isReduit}+MAX(0,${b}-{isSeuil})*{isNormal}`;
    let cols = [{ n: "a", t: "Année" }, COL_LOYER, COL_CHP, COL_GEST, COL_TRAV,
      { n: "fAch", t: "Frais d'achat (charges)", f1: "={frais}", f: "=0", tot: true },
      { n: "fSCI", t: "Frais de la SCI", f1: "={compta}+{constit}", f: "={compta}", tot: true },
      { n: "intAss", t: "Intérêts et assurance", f: "=[int]+[assu]", tot: true },
      { n: "am", t: "Amortissements", f: "=IF([a]<={dureeBati},{aB},0)+IF([a]<={dureeTravaux},{aT},0)", tot: true },
      { n: "res", t: "Résultat comptable", f: "=[loyer]-[chP]-[gest]-[trav]-[fAch]-[fSCI]-[intAss]-[am]", tot: true },
      { n: "dD", t: "Déficits reportés (début)", f1: "=0", f: "=[dF^]" },
      { n: "base", t: "Base de l'IS", f: "=IF([res]>0,[res]-MIN([dD],[res]),0)", tot: true },
      { n: "dF", t: "Déficits reportés (fin)", f: "=IF([res]>0,[dD]-MIN([dD],[res]),[dD]-[res])" },
      { n: "is", t: "IS", f: "=" + IS("[base]"), tot: true },
      { n: "rsD", t: "Réserves (début)", f1: "=0", f: "=[rsF^]" },
      { n: "caisse", t: "Trésorerie disponible avant compte courant", f1: "=[loyer]-([chP]+[gest]+[fSCI]+[int]+[assu]+[cap]+[is])", f: "=[trF^]+[loyer]-([chP]+[gest]+[fSCI]+[int]+[assu]+[cap]+[is])" },
      { n: "apCCA", t: "Apport en compte courant", f: "=MAX(0,-[caisse])", tot: true },
      { n: "ccaD", t: "Compte courant (début)", f1: "={apportR}", f: "=[ccaF^]" },
      { n: "remb", t: "Remboursement du compte courant", f: "=IF([caisse]<0,0,MIN([caisse],[ccaD]))", tot: true },
      { n: "div", t: "Dividende", f: "=IF(AND({distrib}=1,[caisse]>=0),MIN([caisse]-[remb],MAX(0,[rsD]+[res]-[is])),0)", tot: true },
      { n: "pfuA", t: "Flat tax sur le dividende", f: "=[div]*{pfu}", tot: true },
      { n: "rsF", t: "Réserves (fin)", f: "=[rsD]+[res]-[is]-[div]" },
      { n: "trF", t: "Trésorerie de la SCI (fin)", f: "=MAX(0,[caisse])-[remb]-[div]" },
      { n: "ccaF", t: "Compte courant (fin)", f: "=[ccaD]+[apCCA]-[remb]" },
      { n: "imp", t: "Impôts (IS + flat tax)", f: "=[is]+[pfuA]", tot: true },
      { n: "cash", t: "Cash-flow des associés", f: "=-[apCCA]+[remb]+[div]-[pfuA]", tot: true }];
    cols = cols.concat(colsFin({}), prets("", false), [{ n: "crdT", t: "Capital restant dû", f: "=[crdF]" }]);
    F.tableau(cols, N);
    F.saut();
    F.section("Revente par la SCI et liquidation");
    F.calc("prixRev", "Prix de revente estimé", "={prix}*(1+{revalP})^{N}");
    F.calc("fcM", "Frais de vente", "={prixRev}*{fc}");
    F.calc("vnc", "Valeur nette comptable", "={prix}+{travaux}*(1-{entretien})-SUM({plage:am})");
    F.calc("pvC", "Plus-value comptable", "={prixRev}-{fcM}-{vnc}");
    F.calc("basePV", "Base de l'IS (après déficits)", "=MAX(0,IF({pvC}>0,{pvC}-MIN({fin:dF},{pvC}),{pvC}))");
    F.calc("isPV", "IS sur la plus-value", "=" + IS("{basePV}"));
    F.calc("crdFin", "Capital restant dû remboursé", "={fin:crdT}");
    F.calc("actif", "Actif net de la SCI", "={fin:trF}+{prixRev}-{fcM}-{crdFin}-{isPV}");
    F.calc("rendCCA", "Comptes courants rendus (sans impôt)", "=MIN(MAX(0,{actif}),{fin:ccaF})");
    F.calc("boni", "Boni de liquidation", "=MAX(0,{actif}-{rendCCA})");
    F.calc("dPart", "Droit de partage", "={boni}*{droitPartage}");
    F.calc("pfuB", "Flat tax sur le boni", "=({boni}-{dPart})*{pfu}");
    F.calc("impRev", "Impôts à la revente", "={isPV}+{dPart}+{pfuB}", EUR, "", true);
    F.calc("net", "Net en poche à la revente", "={rendCCA}+{boni}-{dPart}-{pfuB}", EUR, "", true);
  }

  function usufruit(F, id, h, R, M, N) {
    const coacq = id === "coacquisition";
    const B = M.base(h, R, false);
    hypBien(F, h, B, {});
    F.sousTitre("Fiscalité"); F.hyp("tmi", "Tranche marginale d'imposition", pc(h.tmi), PCT1);
    F.hyp("autres", "Avez-vous d'autres revenus fonciers ?", h.autresFonciers ? 1 : 0, NB, "1 = oui : les intérêts de la période démembrée s'y déduisent");
    F.sousTitre("L'usufruit temporaire");
    F.hyp("D", "Durée de l'usufruit (ans)", Math.max(1, Math.min(Math.round(+h.usufruitDuree || 1), N)), NB, "au plus la durée de détention");
    F.hyp("tAct", "Taux d'actualisation (valeur économique)", pc(h.usufruitTaux), PCT);
    F.hyp("manuel", "Fixer moi-même la valeur de l'usufruit ?", h.usufruitManuel ? 1 : 0, NB, "1 = oui (valeur ci-dessous) ; 0 = valeur économique");
    F.hyp("usPct", "Valeur fixée de l'usufruit (en % du prix)", pc(h.usufruitPct), PCT1);
    if (!coacq) {
      F.hyp("fUs", "Frais d'achat de l'usufruit par la société (% de son prix)", pc(h.fraisUsufruit), PCT1);
      F.hyp("rembA", "Le prix rembourse le prêt par anticipation ?", h.usufruitRembourser ? 1 : 0, NB, "1 = oui, à la fin de l'année 1");
    }
    F.hyp("isSoc", "Taux d'IS de votre société (marginal)", pc(h.isSociete), PCT1);
    hypRevente(F, h, N);
    hypReglages(F, R, ["psFoncier", "deficitGlobal", "irPV", "psPV", "forfaitFrais", "forfaitTravaux"]);
    F.saut();
    blocResultats(F, { societe: true, cout: coacq ? "={prixNP}+{fraisNP}+{travaux}+{miseS}" : null });
    F.saut();
    F.section("Calculs de départ");
    F.calc("valEco", "Valeur économique de l'usufruit", "=SUMPRODUCT(({plage:a}<={D})*({plage:loyer}-{plage:chP}-{plage:gest})/(1+{tAct})^{plage:a})", EUR, "loyers nets des années d'usufruit, actualisés");
    F.calc("prixUs", "Prix de l'usufruit retenu", "=IF({manuel}=1,{prix}*{usPct},MAX(0,{valEco}))");
    if (coacq) {
      F.calc("u", "Part de l'usufruit dans le prix", "=MIN(0.9,IF({prix}=0,0,{prixUs}/{prix}))", PCT1);
      F.calc("prixNP", "Prix de la nue-propriété (vous)", "={prix}*(1-{u})");
      F.calc("fraisNP", "Frais d'achat de la nue-propriété", "={frais}*(1-{u})");
      F.calc("miseS", "Ce que paie votre société (usufruit + ses frais)", "={prixUs}+{frais}*{u}");
      F.calc("cout0", "Votre coût (nue-propriété, frais, travaux)", "={prixNP}+{fraisNP}+{travaux}");
      F.calc("apportR", "Apport retenu", "=MIN({apport},{cout0})");
      calcPret(F, "", "=MAX(0,{cout0}-{apportR})", "{taux}", "{duree}", "{assurance}");
    } else {
      F.calc("miseS", "Ce que paie votre société (usufruit + frais)", "={prixUs}*(1+{fUs})");
      F.calc("cout0", "Coût de l'opération", "={prix}+{frais}+{travaux}");
      F.calc("apportR", "Apport retenu", "=MIN({apport},{cout0})");
      calcPret(F, "", "=MAX(0,{cout0}-{apport})", "{taux}", "{duree}", "{assurance}");
      F.calc("impEst", "Impôt estimé sur le prix (pour le remboursement anticipé)", "=MAX(0,{prixUs}-{an1:int}-{an1:assu}-{travaux}*{entretien})*({tmi}+{psFoncier})");
      F.calc("anticipe", "Remboursement anticipé prévu", "=IF({rembA}=1,MAX(0,{prixUs}-{impEst}),0)");
    }
    F.saut();
    F.section("Année par année", coacq ? "Pendant l'usufruit, vous n'avez ni loyers ni charges : c'est la société qui loue." : "Année 1 : le prix de l'usufruit est un revenu foncier (art. 13, 5 du CGI). Ensuite la société loue jusqu'à la fin de l'usufruit.");
    const dem = "[a]<={D}", actif = coacq ? `NOT(${dem})` : `OR([a]=1,NOT(${dem}))`;
    let cols = [{ n: "a", t: "Année" }, COL_LOYER, COL_CHP, COL_GEST,
      { n: "dem", t: "Usufruit chez la société ?", f: `=IF(${dem},1,0)`, fmt: NB },
      { n: "loyV", t: coacq ? "Vos loyers" : "Vos recettes (loyers, prix de l'usufruit)", f: coacq ? "=IF([dem]=1,0,[loyer])" : "=IF([dem]=1,0,[loyer])+IF([a]=1,{prixUs},0)", tot: true },
      { n: "chV", t: "Vos charges", f: coacq ? "=IF([dem]=1,0,[chP]+[gest])" : "=IF([dem]=1,IF([a]=1,{travaux}*{entretien},0),[chP]+[gest])", tot: true },
      { n: "intAss", t: "Intérêts et assurance", f: "=[int]+[assu]", tot: true },
      { n: "res", t: "Résultat foncier", f: coacq ? "=IF([dem]=1,IF({autres}=1,-[intAss],0),[loyer]-[chV]-[intAss])" : "=IF([dem]=1,IF([a]=1,{prixUs}-[chV]-[intAss],IF({autres}=1,-[intAss],0)),[loyer]-[chV]-[intAss])", tot: true },
      { n: "act", t: "Déclaré sur ce bien ?", f: `=IF(${actif},1,0)`, fmt: NB },
      { n: "glob", t: "Déficit sur le revenu global", f: "=IF(AND([act]=1,[res]<0),MIN(MAX(0,-[res]-MIN(-[res],[intAss])),{deficitGlobal}),0)" },
      ...colsReports("", "", "=IF(AND([act]=1,[res]>=0),MIN([dispo],[res]),0)", "=IF(AND([act]=1,[res]<0),-[res]-[glob],0)"),
      { n: "impos", t: "Imposable", f: "=IF(AND([act]=1,[res]>=0),[res]-[imput],0)", tot: true },
      { n: "eco", t: "Économie d'impôt", f: "=IF([act]=1,[glob]*{tmi},IF({autres}=1,[intAss]*({tmi}+{psFoncier}),0))", tot: true },
      { n: "imp", t: "Impôts (IR + PS − économie)", f: "=[impos]*({tmi}+{psFoncier})-[eco]", tot: true },
      { n: "cash", t: "Cash-flow après impôts", f: coacq ? "=IF([dem]=1,0,[loyer]-[chV])-([int]+[assu]+[cap])-[imp]" : "=IF([dem]=1,0,[loyer]-[chV])-([int]+[assu]+[cap])-[imp]+IF([a]=1,{prixUs}-{anticipe},0)", tot: true },
      { n: "recS", t: "Société : loyers", f: "=IF([dem]=1,[loyer],0)", tot: true },
      { n: "chS", t: "Société : charges", f: "=IF([dem]=1,[chP]+[gest],0)", tot: true },
      { n: "amS", t: "Société : amortissement de l'usufruit", f: "=IF([dem]=1,{miseS}/{D},0)", tot: true },
      { n: "resS", t: "Société : résultat", f: "=[recS]-[chS]-[amS]", tot: true },
      { n: "sdD", t: "Société : déficits reportés (début)", f1: "=0", f: "=[sdF^]" },
      { n: "bS", t: "Société : base de l'IS", f: "=IF([resS]>0,[resS]-MIN([sdD],[resS]),0)" },
      { n: "sdF", t: "Société : déficits reportés (fin)", f: "=IF([resS]>0,[sdD]-MIN([sdD],[resS]),[sdD]-[resS])" },
      { n: "isS", t: "Société : IS", f: "=[bS]*{isSoc}", tot: true },
      { n: "fluxS", t: "Société : trésorerie", f0: "=-{miseS}", f: "=[recS]-[chS]-[isS]", tot: true }];
    cols = cols.concat(colsFin({ societe: true }), prets("", !coacq), [{ n: "crdT", t: "Capital restant dû", f: "=[crdF]" }]);
    F.tableau(cols, N);
    F.saut();
    blocPlusValue(F, coacq
      ? { prix: "{prixNP}", frais: "{fraisNP}", travauxReels: "={travaux}", libPrix: "Prix de revient (celui de la nue-propriété)" }
      : { prix: "{prix}", frais: "{frais}", travauxReels: "={travaux}*(1-{entretien})" });
  }

  // ---------------------------------------------------------------- le classeur
  //  ctx : { h, R, ids, Moteur, noms: {id: {nom, court}}, couleurs: {id: "RRGGBB"}, info: {client, date, nom}, cabinet, logo, hypotheses: [[lib, texte]], vigilance: [[t, texte]], limites }
  function construire(ExcelJS, ctx) {
    const { h, ids, Moteur: M } = ctx;
    const R = Object.assign({}, M.REGLAGES_DEFAUT, ctx.R || {});
    const N = Math.max(1, Math.round(+h.horizon || 1));
    const wb = new ExcelJS.Workbook();
    wb.creator = ctx.cabinet || "Investissement immobilier"; wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const syn = wb.addWorksheet("Synthèse");
    const feuilles = {};
    for (const id of ids) {
      const nomF = String(ctx.noms[id].court).replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
      const ws = wb.addWorksheet(nomF, { properties: { tabColor: { argb: "FF" + ctx.couleurs[id] } } });
      const F = creerFeuille(ws, "FF" + ctx.couleurs[id]);
      ESTIMATION_TRI = ctx.tri ? ctx.tri[id] : null;
      F.titre(ctx.noms[id].nom, "Formules vivantes : modifiez les cellules jaunes. " + (ctx.info.client ? "Pour " + ctx.info.client + " · " : "") + ctx.info.date);
      if (id === "nuMicro" || id === "nuReel" || id === "lmnpMicro" || id === "lmnpReel") nuOuLmnp(F, id, h, R, M, N);
      else if (id === "sciIR" || id === "sciIRInegal" || id === "sciIRHolding") sci(F, id, h, R, M, N);
      else if (id === "sciIS") sciIS(F, h, R, M, N);
      else usufruit(F, id, h, R, M, N);
      F.saut();
      F.texte(ctx.limites || "", true);
      F.resoudre();
      ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
      ws.headerFooter = { oddFooter: "&L" + (ctx.cabinet || "").replace(/&/g, "&&") + "&C&A&RPage &P / &N" };
      ws.getColumn(1).width = 46; ws.getColumn(2).width = 17; ws.getColumn(3).width = 17;
      for (let i = 4; i <= ws.columnCount; i++) ws.getColumn(i).width = 15;
      feuilles[id] = { nom: nomF, noms: F.noms };
    }
    // ---- la synthèse : renvoie aux résultats de chaque onglet
    let r = 1;
    if (ctx.logo && /^data:image\/(png|jpe?g);base64,/.test(ctx.logo)) {
      try { const ext = /png/.test(ctx.logo) ? "png" : "jpeg"; const im = wb.addImage({ base64: ctx.logo, extension: ext }); syn.addImage(im, { tl: { col: 4.2, row: 0.2 }, ext: { width: 130, height: 52 } }); } catch (e) {}
    }
    const c = (x, y) => syn.getCell(x, y);
    c(r, 1).value = "Investissement immobilier — comparatif des montages"; c(r, 1).font = { bold: true, size: 15, color: { argb: BLEU } }; r++;
    c(r, 1).value = [ctx.cabinet, ctx.info.client ? "Pour " + ctx.info.client : "", ctx.info.date].filter(Boolean).join(" · "); c(r, 1).font = { color: { argb: GRIS } }; r += 2;
    c(r, 1).value = "Chaque montage a son onglet, avec ses propres hypothèses (cellules jaunes) et toutes ses formules. Ce tableau reprend leurs résultats : il suit les modifications faites dans les onglets.";
    c(r, 1).font = { italic: true, size: 10, color: { argb: GRIS } }; r += 2;
    const tete = syn.getRow(r);
    c(r, 1).value = "Sur " + N + " ans";
    ids.forEach((id, i) => { c(r, i + 2).value = ctx.noms[id].court; c(r, i + 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + ctx.couleurs[id] } }; c(r, i + 2).alignment = { horizontal: "center", wrapText: true }; });
    c(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU } };
    tete.font = { bold: true, color: { argb: "FFFFFFFF" } }; tete.height = 32; r++;
    const LIG = [["Coût total de l'opération", "cout"], ["Montant emprunté", "emprunt"], ["Mensualité (prêt + assurance)", "mensTot"], ["Effort d'épargne moyen, par mois", "effort"],
      ["Impôts pendant la détention", "impDet"], ["Impôts à la revente", "impRevR"], ["Net en poche à la revente", "netR"], ["Mise de fonds de votre société", "mise", 1], ["Gain de votre société (après IS)", "gain", 1],
      ["Enrichissement net", "enrich", 0, 1], ["Rendement de l'apport (TRI)", "tri", 0, 1]];
    const avecSoc = ids.some((id) => feuilles[id].noms.mise);
    for (const [lib, cle, soc, fort] of LIG) {
      if (soc && !avecSoc) continue;
      c(r, 1).value = lib;
      ids.forEach((id, i) => {
        const a = feuilles[id].noms[cle], x = c(r, i + 2);
        x.value = a ? { formula: nomOnglet(feuilles[id].nom) + "!" + a } : null;
        x.numFmt = cle === "tri" ? PCT : EUR; x.alignment = { horizontal: "right" };
      });
      if (fort) { syn.getRow(r).font = { bold: true }; for (let i = 1; i <= ids.length + 1; i++) c(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND } }; }
      r++;
    }
    r++;
    if (ctx.hypotheses) {
      c(r, 1).value = "Hypothèses de départ (au moment de l'export)"; c(r, 1).font = { bold: true, color: { argb: BLEU } }; r++;
      ctx.hypotheses.forEach(([a, b]) => { c(r, 1).value = a; c(r, 2).value = b; r++; });
      r++;
    }
    if (ctx.vigilance) {
      c(r, 1).value = "Points de vigilance"; c(r, 1).font = { bold: true, color: { argb: BLEU } }; r++;
      ctx.vigilance.forEach(([a, b]) => { c(r, 1).value = a; c(r, 2).value = b; c(r, 2).alignment = { wrapText: true, vertical: "top" }; syn.mergeCells(r, 2, r, Math.max(6, ids.length + 1)); syn.getRow(r).height = Math.min(90, 15 * Math.ceil(String(b).length / 110)); r++; });
      r++;
    }
    c(r, 1).value = ctx.limites || ""; c(r, 1).font = { italic: true, size: 9, color: { argb: GRIS } };
    syn.getColumn(1).width = 40; for (let i = 2; i <= ids.length + 1; i++) syn.getColumn(i).width = 17;
    syn.views = [{ state: "frozen", xSplit: 1 }];
    syn.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return wb;
  }

  const ExcelImmo = { construire, formuleSurtaxe };
  if (typeof module !== "undefined" && module.exports) module.exports = ExcelImmo; else racine.ExcelImmo = ExcelImmo;
})(typeof window !== "undefined" ? window : globalThis);
