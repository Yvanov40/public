// =====================================================================================
//  moteur.js — le calcul de l'investissement immobilier, montage par montage
// -------------------------------------------------------------------------------------
//  Entrée : le projet (h = hypothèses) et les réglages fiscaux (R).
//  Sortie : pour chaque montage, un tableau année par année, la revente et les indicateurs.
//  Pas d'affichage ici : seulement des nombres. L'interface (index.html) s'en sert,
//  les exports aussi. Le même fichier tourne dans Node pour les tests (module.exports).
//
//  Simplifications assumées (rappelées dans l'appli) :
//   • l'impôt sur le revenu est calculé à la tranche marginale (TMI) saisie, sans recalcul du barème ;
//   • l'achat a lieu au 1er janvier de l'année 1, la revente au 31 décembre de la dernière année ;
//   • le prêt est remboursé à la revente, sans indemnité de remboursement anticipé ;
//   • les loyers et charges évoluent chaque année d'un taux constant.
// =====================================================================================
(function (racine) {
  "use strict";

  // ---------------------------------------------------------------- réglages fiscaux 2026 (modifiables)
  const REGLAGES_DEFAUT = {
    psFoncier: 17.2,        // prélèvements sociaux sur revenus fonciers (%)
    psBIC: 18.6,            // prélèvements sociaux sur BIC du LMNP (%) — hausse de la CSG au 1er janvier 2026
    psPV: 17.2,             // prélèvements sociaux sur plus-values immobilières des particuliers (%)
    pfu: 31.4,              // flat tax sur les dividendes et le boni de liquidation (12,8 % + 18,6 %)
    irPV: 19,               // impôt sur le revenu des plus-values immobilières (%)
    isReduit: 15, isSeuil: 42500, isNormal: 25,
    microFoncierAbat: 30, microFoncierPlafond: 15000,
    microBICAbat: 50, microBICPlafond: 83600,
    deficitGlobal: 10700,   // déficit foncier imputable sur le revenu global, par an et par foyer
    seuilLMP: 23000,        // au-delà (et si > autres revenus d'activité), le loueur devient professionnel
    dureeBati: 30, dureeTravaux: 15, dureeMobilier: 7,   // durées d'amortissement (ans)
    forfaitFrais: 7.5, forfaitTravaux: 15,               // forfaits de la plus-value (en % du prix d'achat)
    droitPartage: 2.5       // droit de partage sur le boni de liquidation de la SCI à l'IS (%)
  };

  // ---------------------------------------------------------------- outils
  const arrondi = (x) => Math.round(x * 100) / 100;
  const pos = (x) => Math.max(0, x);

  // abattements pour durée de détention (plus-values immobilières des particuliers)
  function abatIR(ans) { if (ans < 6) return 0; if (ans >= 22) return 1; return 0.06 * (ans - 5); }
  function abatPS(ans) { if (ans < 6) return 0; if (ans >= 30) return 1; if (ans < 22) return 0.0165 * (ans - 5); return 0.28 + 0.09 * (ans - 22); }
  // surtaxe sur les plus-values immobilières élevées (art. 1609 nonies G du CGI), par cédant
  const SURTAXE = [[60000, .02, 1 / 20], [100000, .02, 0], [110000, .03, 1 / 10], [150000, .03, 0], [160000, .04, .15], [200000, .04, 0], [210000, .05, .2], [250000, .05, 0], [260000, .06, .25]];
  function surtaxe(pv) { if (pv <= 50000) return 0; for (const [hi, r, l] of SURTAXE) if (pv <= hi) return Math.max(0, r * pv - (hi - pv) * l); return .06 * pv; }

  // IS : taux réduit jusqu'au seuil, puis taux normal
  function impotSocietes(base, R) { if (base <= 0) return 0; const a = Math.min(base, R.isSeuil); return a * R.isReduit / 100 + (base - a) * R.isNormal / 100; }

  // taux de rendement interne de flux annuels (flux[0] = aujourd'hui) ; null s'il n'existe pas
  function tri(flux) {
    const van = (t) => flux.reduce((s, f, i) => s + f / Math.pow(1 + t, i), 0);
    let bas = -0.99, haut = 1;
    if (van(bas) * van(haut) > 0) { haut = 10; if (van(bas) * van(haut) > 0) return null; }
    for (let i = 0; i < 200; i++) { const m = (bas + haut) / 2; if (van(bas) * van(m) <= 0) haut = m; else bas = m; }
    return (bas + haut) / 2;
  }

  // ---------------------------------------------------------------- le prêt, année par année
  //  remb (facultatif) : { an, montant } = remboursement anticipé à la fin de l'année « an » ;
  //  la durée ne change pas, la mensualité (et l'assurance) baissent d'autant.
  function pret(capital, tauxAnnuel, dureeAns, assurancePct, remb) {
    const n = Math.round(dureeAns * 12), t = tauxAnnuel / 100 / 12;
    const mens = (c, k) => c <= 0 || k <= 0 ? 0 : (t === 0 ? c / k : c * t / (1 - Math.pow(1 + t, -k)));
    let mensualite = mens(capital, n);
    let assuranceMois = capital * (assurancePct / 100) / 12;
    const mensualite0 = mensualite, assurance0 = assuranceMois;
    const annees = [];
    let crd = capital, mois = 0;
    for (let a = 1; a <= Math.ceil(n / 12) + 60; a++) {
      let interets = 0, amort = 0, assu = 0, anticipe = 0;
      for (let m = 0; m < 12; m++) {
        if (crd <= 0.005) break;
        const i = crd * t, c = Math.min(crd, mensualite - i);
        interets += i; amort += c; assu += assuranceMois; crd -= c; mois++;
      }
      if (remb && remb.an === a && crd > 0) {
        anticipe = Math.min(crd, Math.max(0, remb.montant));
        const avant = crd; crd -= anticipe;
        mensualite = mens(crd, n - mois); assuranceMois = avant > 0 ? assuranceMois * crd / avant : 0;
      }
      annees.push({ interets, capital: amort, assurance: assu, crd: Math.max(0, crd), anticipe });
      if (crd <= 0.005 && a >= dureeAns) break;
      if (crd <= 0.005 && anticipe) break;
    }
    return { mensualite: mensualite0, assuranceMois: assurance0, annees, an: (a) => annees[a - 1] || { interets: 0, capital: 0, assurance: 0, crd: 0, anticipe: 0 } };
  }
  // plusieurs prêts additionnés (banque + holding)
  function prets(liste) {
    return { mensualite: liste.reduce((s, p) => s + p.mensualite, 0), assuranceMois: liste.reduce((s, p) => s + p.assuranceMois, 0),
      annees: liste.reduce((m, p) => p.annees.length > m.length ? p.annees : m, []),
      an: (a) => liste.map((p) => p.an(a)).reduce((s, x) => ({ interets: s.interets + x.interets, capital: s.capital + x.capital, assurance: s.assurance + x.assurance, crd: s.crd + x.crd, anticipe: s.anticipe + (x.anticipe || 0) }), { interets: 0, capital: 0, assurance: 0, crd: 0, anticipe: 0 }) };
  }
  // impôt sur le revenu foncier d'un foyer, année par année, avec ses déficits reportables (10 ans)
  function creerFoncier(R, tmi) {
    const reports = [];
    return {
      an(a, resultat, interets) {
        let imposable = 0, economie = 0;
        if (resultat >= 0) {
          imposable = resultat;
          for (const r of reports) { if (imposable <= 0) break; if (a - r.an > 10) continue; const u = Math.min(r.montant, imposable); r.montant -= u; imposable -= u; }
        } else {
          const deficit = -resultat, partInterets = Math.min(deficit, interets), surGlobal = Math.min(deficit - partInterets, R.deficitGlobal);
          economie = surGlobal * tmi; reports.push({ montant: deficit - surGlobal, an: a });
        }
        const impotIR = imposable * tmi, impotPS = imposable * R.psFoncier / 100;
        return { imposable, economie, impotIR, impotPS, impot: impotIR + impotPS - economie };
      }
    };
  }
  // l'IS d'une société qui a déjà d'autres bénéfices (holding) : taux marginal, déficits reportés
  function creerSocieteIS(taux) {
    let deficit = 0;
    return { an(resultat) { let b = resultat; if (b > 0 && deficit > 0) { const u = Math.min(deficit, b); deficit -= u; b -= u; } else if (b < 0) { deficit += -b; b = 0; } return { base: b, is: b * taux }; } };
  }
  // valeur économique d'un usufruit temporaire : les loyers nets qu'il rapporte, actualisés
  function valeurUsufruit(B, h, duree, R) {
    const r = (+h.usufruitTaux || 0) / 100;
    let v = 0;
    for (let a = 1; a <= duree; a++) {
      const y = B.ans[a - 1] || B.ans[B.ans.length - 1];
      v += (y.loyerNu - y.charges - y.loyerNu * B.gestion) / Math.pow(1 + r, a);
    }
    return Math.max(0, v);
  }

  // ---------------------------------------------------------------- les éléments communs à tous les montages
  function base(h, R, meuble, opts) {
    opts = opts || {};
    const prix = +h.prix || 0;
    const frais = h.fraisAuto ? prix * (h.neuf ? 0.025 : 0.08) : (+h.frais || 0);
    const travaux = +h.travaux || 0, mobilier = meuble ? (+h.mobilier || 0) : 0;   // le mobilier ne s'achète qu'en meublé
    const coutSansMobilier = prix + frais + travaux;
    const emprunt = Math.max(0, coutSansMobilier + mobilier - (+h.apport || 0));
    const P = opts.pret || pret(emprunt, +h.taux || 0, +h.duree || 0, +h.assurance || 0);
    const N = Math.max(1, Math.round(+h.horizon || 1));
    const g = (+h.revalLoyer || 0) / 100, gc = (+h.revalCharges || 0) / 100;
    const vacance = Math.min(12, Math.max(0, +h.vacance || 0)) / 12;
    const ans = [];
    for (let a = 1; a <= N; a++) {
      const kL = Math.pow(1 + g, a - 1), kC = Math.pow(1 + gc, a - 1);
      const pa = P.an(a);
      ans.push({
        a,
        loyerNu: (+h.loyerNu || 0) * 12 * (1 - vacance) * kL,
        loyerMeuble: (+h.loyerMeuble || 0) * 12 * (1 - vacance) * kL,
        // charges du propriétaire (non récupérables), hors gestion (proportionnelle aux loyers)
        charges: ((+h.copro || 0) + (+h.taxeFonciere || 0) + (+h.pno || 0)) * kC,
        cfe: (+h.cfe || 0) * kC,
        interets: pa.interets, assurance: pa.assurance, capitalRembourse: pa.capital, crd: pa.crd
      });
    }
    const prixRevente = prix * Math.pow(1 + (+h.revalPrix || 0) / 100, N);
    const fraisCession = prixRevente * (+h.fraisCession || 0) / 100;
    return { prix, frais, travaux, mobilier, emprunt, apport: Math.min(+h.apport || 0, coutSansMobilier + mobilier), P, N, ans, prixRevente, fraisCession,
      gestion: (+h.gestion || 0) / 100, terrain: (+h.terrain || 0) / 100, travauxEntretien: h.natureTravaux !== "amelioration" };
  }

  // ---------------------------------------------------------------- plus-value des particuliers (détention directe, LMNP, SCI à l'IR)
  //  amortReintegres : amortissements du LMNP déduits (réintégrés depuis 2025) ; travauxDeduits : déjà passés en charges
  function plusValueParticuliers(B, R, opts) {
    const N = B.N, quote = opts.quote ?? 1;
    const fraisRetenus = Math.max(B.frais, B.prix * R.forfaitFrais / 100);
    const travauxReels = opts.travauxDeduits ? 0 : B.travaux;
    const travauxRetenus = N > 5 ? Math.max(travauxReels, B.prix * R.forfaitTravaux / 100) : travauxReels;
    const prixRevient = B.prix + fraisRetenus + travauxRetenus;
    const brute = (B.prixRevente - B.fraisCession - prixRevient + (opts.amortReintegres || 0)) * quote;
    const pv = pos(brute);
    const baseIR = pv * (1 - abatIR(N)), basePS = pv * (1 - abatPS(N));
    const ir = baseIR * R.irPV / 100, ps = basePS * R.psPV / 100, st = surtaxe(baseIR);
    return { prixRevient, brute, baseIR, basePS, ir, ps, surtaxe: st, total: ir + ps + st, abatIR: abatIR(N), abatPS: abatPS(N) };
  }

  // ---------------------------------------------------------------- les montages
  // Chaque montage renvoie : { lignes: [ {a, loyers, charges, interets, amort, resultat, impot, cashflow, …} ], revente: {…}, flux: […] }
  // cashflow = ce qui sort (négatif) ou rentre (positif) dans la poche de l'investisseur cette année-là, après impôts.

  // 1-2. location nue en direct (micro-foncier ou réel)
  function nuDirect(h, R, regime) {
    const B = base(h, R, false), tmi = (+h.tmi || 0) / 100;
    const reports = [];   // déficits fonciers reportables : { montant, an }
    const lignes = [];
    for (const y of B.ans) {
      const loyers = y.loyerNu, gestion = loyers * B.gestion;
      const travauxAn = y.a === 1 && B.travauxEntretien ? B.travaux : 0;
      const sortie = y.charges + gestion + y.interets + y.assurance + y.capitalRembourse;
      let resultat, imposable, impotIR = 0, impotPS = 0, economie = 0, note = "";
      if (regime === "micro") {
        resultat = loyers * (1 - R.microFoncierAbat / 100); imposable = resultat;
        if (loyers > R.microFoncierPlafond) note = "au-delà du plafond du micro-foncier : régime réel obligatoire";
      } else {
        const interets = y.interets + y.assurance;
        resultat = loyers - y.charges - gestion - travauxAn - interets;
        if (resultat >= 0) {
          imposable = resultat;
          // on impute d'abord les déficits des 10 années précédentes, les plus anciens d'abord
          for (const r of reports) { if (imposable <= 0) break; if (y.a - r.an > 10) continue; const u = Math.min(r.montant, imposable); r.montant -= u; imposable -= u; }
        } else {
          imposable = 0;
          const deficit = -resultat;
          const partInterets = Math.min(deficit, interets);           // la part due aux intérêts ne s'impute que sur les revenus fonciers
          const horsInterets = deficit - partInterets;
          const surGlobal = Math.min(horsInterets, R.deficitGlobal);   // le reste, sur le revenu global, dans la limite annuelle
          economie = surGlobal * tmi;
          reports.push({ montant: deficit - surGlobal, an: y.a });
        }
      }
      impotIR = imposable * tmi; impotPS = imposable * R.psFoncier / 100;
      const impot = impotIR + impotPS - economie;
      const cash = loyers - sortie - impot;
      lignes.push({ a: y.a, loyers, charges: y.charges + gestion + travauxAn, interets: y.interets + y.assurance, amort: 0, resultat, imposable, impotIR, impotPS, economie, impot, mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, note });
    }
    const pv = plusValueParticuliers(B, R, { travauxDeduits: regime !== "micro" && B.travauxEntretien });
    return terminer(B, lignes, pv, { reportRestant: reports.reduce((s, r) => s + r.montant, 0) });
  }

  // 3-4. location meublée non professionnelle (micro-BIC ou réel)
  function lmnp(h, R, regime) {
    const B = base(h, R, true), tmi = (+h.tmi || 0) / 100;
    const amortBati = (B.prix * (1 - B.terrain) + B.frais) / R.dureeBati;   // frais d'achat amortis avec le bâti
    const amortTravaux = B.travauxEntretien ? 0 : B.travaux / R.dureeTravaux;
    const amortMobilier = B.mobilier / R.dureeMobilier;
    const compta = +h.comptaLMNP || 0;
    let stockAmort = 0, amortImmeubleUtilise = 0;
    const deficits = [];
    const lignes = [];
    for (const y of B.ans) {
      const loyers = y.loyerMeuble, gestion = loyers * B.gestion;
      const travauxAn = y.a === 1 && B.travauxEntretien ? B.travaux : 0;
      let resultat, imposable, amortDeduit = 0, note = "";
      if (regime === "micro") {
        resultat = loyers * (1 - R.microBICAbat / 100); imposable = resultat;
        if (loyers > R.microBICPlafond) note = "au-delà du plafond du micro-BIC : régime réel obligatoire";
      } else {
        // amortissements de l'année (chacun sur sa durée)
        const aBati = y.a <= R.dureeBati ? amortBati : 0, aTrav = y.a <= R.dureeTravaux ? amortTravaux : 0, aMob = y.a <= R.dureeMobilier ? amortMobilier : 0;
        const amortAn = aBati + aTrav + aMob;
        const avant = loyers - y.charges - y.cfe - gestion - compta - travauxAn - y.interets - y.assurance;
        imposable = avant;
        if (avant < 0) { deficits.push({ montant: -avant, an: y.a }); imposable = 0; stockAmort += amortAn; }
        else {
          for (const d of deficits) { if (imposable <= 0) break; if (y.a - d.an > 10) continue; const u = Math.min(d.montant, imposable); d.montant -= u; imposable -= u; }
          // l'amortissement ne peut pas créer de déficit : l'excédent est mis en réserve, sans limite de durée
          const dispo = amortAn + stockAmort;
          amortDeduit = Math.min(dispo, imposable);
          stockAmort = dispo - amortDeduit; imposable -= amortDeduit;
          // part de l'immeuble (bâti + travaux) dans ce qui a été déduit : réintégrée dans la plus-value
          const partImmeuble = (amortBati + amortTravaux) / ((amortBati + amortTravaux + amortMobilier) || 1);
          amortImmeubleUtilise += amortDeduit * partImmeuble;
        }
        resultat = avant - amortDeduit;
      }
      const impotIR = imposable * tmi, impotPS = imposable * R.psBIC / 100, impot = impotIR + impotPS;
      if (loyers > R.seuilLMP && !note) note = "recettes au-delà de 23 000 € : vérifier le statut (LMP si elles dépassent aussi les autres revenus d'activité)";
      const sortie = y.charges + y.cfe + gestion + (regime === "micro" ? 0 : compta) + y.interets + y.assurance + y.capitalRembourse;
      const cash = loyers - sortie - impot;
      lignes.push({ a: y.a, loyers, charges: y.charges + y.cfe + gestion + (regime === "micro" ? 0 : compta) + travauxAn, interets: y.interets + y.assurance, amort: amortDeduit, resultat, imposable, impotIR, impotPS, economie: 0, impot, mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, note });
    }
    const pv = plusValueParticuliers(B, R, { travauxDeduits: B.travauxEntretien && regime !== "micro", amortReintegres: regime === "micro" ? 0 : amortImmeubleUtilise });
    pv.amortReintegres = regime === "micro" ? 0 : amortImmeubleUtilise;
    return terminer(B, lignes, pv, { stockAmort });
  }

  // 5. SCI à l'IR (location nue, régime réel) : le résultat est imposé chez chaque associé, selon ses parts
  //    opts.inegal  : le résultat se partage selon la clause des statuts (« part des résultats »), le capital selon les parts
  //    opts.holding : une partie du financement est prêtée par votre holding à l'IS (intérêts déductibles dans la SCI,
  //                   imposés à l'IS dans la holding)
  function sciIR(h, R, opts) {
    opts = opts || {};
    let B = base(h, R, false), societe = null;
    if (opts.holding) {
      const montant = Math.min(Math.max(0, +h.holdingMontant || 0), B.emprunt);
      const banque = pret(B.emprunt - montant, +h.taux || 0, +h.duree || 0, +h.assurance || 0);
      const parHolding = pret(montant, +h.holdingTaux || 0, +h.holdingDuree || 0, 0);
      B = base(h, R, false, { pret: prets([banque, parHolding]) });
      // la holding : elle prête (sortie de trésorerie), reçoit intérêts et capital, et le solde à la revente
      const tauxIS = (+h.isSociete || 0) / 100, flux = [-montant], lignesS = [];
      let impots = 0;
      for (let a = 1; a <= B.N; a++) {
        const x = parHolding.an(a), is = x.interets * tauxIS;
        impots += is;
        lignesS.push({ a, recettes: x.interets, is, cash: x.interets - is + x.capital });
        flux.push(x.interets - is + x.capital + (a === B.N ? x.crd : 0));
      }
      societe = { nom: "holding prêteuse", montant, flux, impots, lignes: lignesS, gain: flux.reduce((s, f) => s + f, 0) };
    }
    const associes = (h.associes && h.associes.length ? h.associes : [{ nom: "Associé", parts: 100, tmi: h.tmi }]).map((x) => ({ ...x,
      q: (+x.parts || 0) / 100, qr: (opts.inegal ? (x.resultat ?? x.parts) : x.parts) / 100, tmi: (+x.tmi || 0) / 100, reports: [] }));
    const totalParts = associes.reduce((s, x) => s + x.q, 0) || 1, totalRes = associes.reduce((s, x) => s + x.qr, 0) || 1;
    associes.forEach((x) => { x.q = x.q / totalParts; x.qr = x.qr / totalRes; });
    const compta = +h.comptaSCI || 0, constitution = +h.constitution || 0;
    const lignes = [];
    for (const y of B.ans) {
      const loyers = y.loyerNu, gestion = loyers * B.gestion;
      const travauxAn = y.a === 1 && B.travauxEntretien ? B.travaux : 0;
      const fraisSCI = compta + (y.a === 1 ? constitution : 0);
      const interets = y.interets + y.assurance;
      const resultat = loyers - y.charges - gestion - travauxAn - fraisSCI - interets;
      let impotIR = 0, impotPS = 0, economie = 0, imposableTotal = 0;
      for (const x of associes) {
        const r = resultat * x.qr, int = interets * x.qr;
        if (r >= 0) {
          let imp = r;
          for (const d of x.reports) { if (imp <= 0) break; if (y.a - d.an > 10) continue; const u = Math.min(d.montant, imp); d.montant -= u; imp -= u; }
          impotIR += imp * x.tmi; impotPS += imp * R.psFoncier / 100; imposableTotal += imp;
        } else {
          const def = -r, pI = Math.min(def, int), hors = def - pI, g = Math.min(hors, R.deficitGlobal);
          economie += g * x.tmi; x.reports.push({ montant: def - g, an: y.a });
        }
      }
      const impot = impotIR + impotPS - economie;
      const sortie = y.charges + gestion + fraisSCI + y.interets + y.assurance + y.capitalRembourse;
      const cash = loyers - sortie - impot;
      lignes.push({ a: y.a, loyers, charges: y.charges + gestion + fraisSCI + travauxAn, interets, amort: 0, resultat, imposable: imposableTotal, impotIR, impotPS, economie, impot, mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, note: "" });
    }
    // plus-value : régime des particuliers, chez chaque associé (abattements et surtaxe par associé)
    const parAssocie = associes.map((x) => ({ nom: x.nom, q: x.q, ...plusValueParticuliers(B, R, { travauxDeduits: B.travauxEntretien, quote: x.q }) }));
    const pv = parAssocie.reduce((s, x) => ({ brute: s.brute + x.brute, ir: s.ir + x.ir, ps: s.ps + x.ps, surtaxe: s.surtaxe + x.surtaxe, total: s.total + x.total }), { brute: 0, ir: 0, ps: 0, surtaxe: 0, total: 0 });
    Object.assign(pv, { prixRevient: parAssocie[0] ? parAssocie[0].prixRevient : 0, abatIR: abatIR(B.N), abatPS: abatPS(B.N), parAssocie });
    // ce que chaque associé a déclaré sur la durée (utile pour la répartition inégale)
    const declare = associes.map((x) => ({ nom: x.nom, partCapital: x.q, partResultats: x.qr }));
    return terminer(B, lignes, pv, { societe, associes: declare });
  }

  // 7. cession temporaire d'usufruit : vous achetez le bien, puis cédez l'usufruit pour quelques années à votre société à l'IS.
  //    Le prix (valeur économique) est imposé chez vous comme un revenu foncier (art. 13, 5 du CGI) et peut rembourser
  //    le prêt par anticipation ; la société encaisse les loyers et amortit l'usufruit ; à la fin, vous retrouvez la
  //    pleine propriété sans impôt, puis louez jusqu'à la revente.
  function cessionUsufruit(h, R) {
    const B0 = base(h, R, false), tmi = (+h.tmi || 0) / 100;
    const D = Math.max(1, Math.min(Math.round(+h.usufruitDuree || 1), B0.N));
    const prixUs = h.usufruitManuel ? B0.prix * (+h.usufruitPct || 0) / 100 : valeurUsufruit(B0, h, D, R);
    const fraisUs = prixUs * (+h.fraisUsufruit || 0) / 100;   // droits et frais payés par la société
    // impôt estimé sur le prix (année 1), pour savoir ce qui reste à rembourser au prêt
    const impotPrixEstime = pos(prixUs - B0.ans[0].interets - B0.ans[0].assurance - (B0.travauxEntretien ? B0.travaux : 0)) * (tmi + R.psFoncier / 100);
    const anticipe = h.usufruitRembourser ? Math.max(0, prixUs - impotPrixEstime) : 0;
    const P = pret(B0.emprunt, +h.taux || 0, +h.duree || 0, +h.assurance || 0, anticipe ? { an: 1, montant: anticipe } : null);
    const B = base(h, R, false, { pret: P });
    const F = creerFoncier(R, tmi), lignes = [];
    for (const y of B.ans) {
      const demembre = y.a <= D;
      const interets = y.interets + y.assurance;
      let loyers = 0, charges = 0, resultat, f;
      if (demembre) {
        // pendant l'usufruit : pas de loyers ni de charges courantes ; le prix est un revenu foncier de l'année 1
        if (y.a === 1) {
          charges = B.travauxEntretien ? B.travaux : 0;
          resultat = prixUs - charges - interets;
          f = F.an(1, resultat, interets);
        } else {
          // ensuite, les intérêts ne se déduisent que de vos autres revenus fonciers (option)
          resultat = h.autresFonciers ? -interets : 0;
          const eco = h.autresFonciers ? interets * (tmi + R.psFoncier / 100) : 0;
          f = { imposable: 0, impotIR: 0, impotPS: 0, economie: eco, impot: -eco };
        }
      } else {
        loyers = y.loyerNu; const gestion = loyers * B.gestion;
        charges = y.charges + gestion;
        resultat = loyers - charges - interets;
        f = F.an(y.a, resultat, interets);
      }
      const prixRecu = y.a === 1 ? prixUs - anticipe : 0;
      const cash = loyers - (demembre ? 0 : charges) - (y.interets + y.assurance + y.capitalRembourse) - f.impot + prixRecu;
      lignes.push({ a: y.a, loyers: loyers + (y.a === 1 ? prixUs : 0), charges, interets, amort: 0, resultat, imposable: f.imposable, impotIR: f.impotIR, impotPS: f.impotPS, economie: f.economie, impot: f.impot,
        mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, note: demembre ? (y.a === 1 ? "prix de l'usufruit encaissé" + (anticipe ? ", " + Math.round(anticipe).toLocaleString("fr-FR") + " € remboursés au prêt" : "") : "usufruit chez la société") : "" });
    }
    const societe = societeUsufruitiere(B0, h, R, D, prixUs + fraisUs, "société usufruitière");
    societe.prix = prixUs; societe.frais = fraisUs; societe.duree = D;
    const pv = plusValueParticuliers(B0, R, { travauxDeduits: B0.travauxEntretien });
    return terminer(B, lignes, pv, { societe, usufruit: { prix: prixUs, duree: D, anticipe, part: prixUs / (B0.prix || 1) } });
  }

  // la société à l'IS qui détient l'usufruit temporaire : elle paie le prix, encaisse les loyers, amortit l'usufruit
  function societeUsufruitiere(B0, h, R, D, cout, nom) {
    const S = creerSocieteIS((+h.isSociete || 0) / 100), flux = [-cout], lignesS = [];
    let impots = 0;
    for (let a = 1; a <= B0.N; a++) {
      if (a > D) { flux.push(0); continue; }
      const y = B0.ans[a - 1], loyers = y.loyerNu, charges = y.charges + loyers * B0.gestion + (+h.comptaHolding || 0);
      const amort = cout / D, x = S.an(loyers - charges - amort);
      impots += x.is;
      lignesS.push({ a, recettes: loyers, charges, amort, is: x.is, cash: loyers - charges - x.is });
      flux.push(loyers - charges - x.is);
    }
    return { nom, montant: cout, flux, impots, lignes: lignesS, gain: flux.reduce((s, f) => s + f, 0) };
  }

  // 8. coacquisition démembrée : vous achetez la nue-propriété, votre société à l'IS l'usufruit temporaire.
  //    Pendant le démembrement, vous n'avez ni loyers ni charges courantes (et rien à déclarer) ; la société loue.
  //    À la fin, vous recevez la pleine propriété sans impôt ; à la revente, le prix d'achat retenu est celui de la nue-propriété.
  function coacquisition(h, R) {
    const B0 = base(h, R, false), tmi = (+h.tmi || 0) / 100;
    const D = Math.max(1, Math.min(Math.round(+h.usufruitDuree || 1), B0.N));
    const prixUs = h.usufruitManuel ? B0.prix * (+h.usufruitPct || 0) / 100 : valeurUsufruit(B0, h, D, R);
    const u = Math.min(0.9, prixUs / (B0.prix || 1));
    const prixNP = B0.prix * (1 - u), fraisNP = B0.frais * (1 - u), fraisUs = B0.frais * u;
    const cout = prixNP + fraisNP + B0.travaux;   // les travaux de l'achat sont à la charge du nu-propriétaire
    const apport = Math.min(+h.apport || 0, cout), emprunt = Math.max(0, cout - apport);
    const P = pret(emprunt, +h.taux || 0, +h.duree || 0, +h.assurance || 0);
    const B = Object.assign({}, base(h, R, false, { pret: P }), { prix: prixNP, frais: fraisNP, emprunt, apport, P });
    const F = creerFoncier(R, tmi), lignes = [];
    for (const y of B.ans) {
      const demembre = y.a <= D, interets = y.interets + y.assurance;
      let loyers = 0, charges = 0, resultat = 0, f;
      if (demembre) {
        // intérêts de l'achat de la nue-propriété : déductibles seulement de vos autres revenus fonciers (option)
        resultat = h.autresFonciers ? -interets : 0;
        f = { imposable: 0, impotIR: 0, impotPS: 0, economie: h.autresFonciers ? interets * (tmi + R.psFoncier / 100) : 0 };
        f.impot = -f.economie;
      } else {
        loyers = y.loyerNu; charges = y.charges + loyers * B.gestion;
        resultat = loyers - charges - interets;
        f = F.an(y.a, resultat, interets);
      }
      const cash = loyers - charges - (y.interets + y.assurance + y.capitalRembourse) - f.impot;
      lignes.push({ a: y.a, loyers, charges, interets, amort: 0, resultat, imposable: f.imposable, impotIR: f.impotIR, impotPS: f.impotPS, economie: f.economie, impot: f.impot,
        mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, note: demembre ? "usufruit chez la société" : "" });
    }
    const societe = societeUsufruitiere(B0, h, R, D, prixUs + fraisUs, "société usufruitière");
    societe.prix = prixUs; societe.frais = fraisUs; societe.duree = D;
    // plus-value : prix d'acquisition = celui de la nue-propriété (l'extinction de l'usufruit n'ajoute rien)
    const pv = plusValueParticuliers({ ...B0, prix: prixNP, frais: fraisNP }, R, { travauxDeduits: false });
    return terminer(B, lignes, pv, { societe, usufruit: { prix: prixUs, duree: D, part: u, prixNP } });
  }

  // 6. SCI à l'IS (location nue) : la société paie l'IS ; les associés financent par compte courant
  //    et récupèrent à la fin le compte courant (sans impôt) puis le boni de liquidation (flat tax)
  function sciIS(h, R) {
    const B = base(h, R, false);
    const compta = +h.comptaIS || 0, constitution = +h.constitution || 0;
    const amortBati = B.prix * (1 - B.terrain) / R.dureeBati;
    const amortTravaux = B.travauxEntretien ? 0 : B.travaux / R.dureeTravaux;
    const distribuer = !!h.distribuer;   // distribuer chaque année le bénéfice (sinon : remboursement du compte courant, puis réserve)
    let deficit = 0, cca = B.apport, treso = 0, amortCumul = 0, reserves = 0;
    const lignes = [];
    for (const y of B.ans) {
      const loyers = y.loyerNu, gestion = loyers * B.gestion;
      const travauxAn = y.a === 1 && B.travauxEntretien ? B.travaux : 0;
      const fraisAchat = y.a === 1 ? B.frais : 0;   // frais d'acquisition passés en charges la 1re année
      const fraisSCI = compta + (y.a === 1 ? constitution : 0);
      const aB = y.a <= R.dureeBati ? amortBati : 0, aT = y.a <= R.dureeTravaux ? amortTravaux : 0;
      const amort = aB + aT; amortCumul += amort;
      const resultat = loyers - y.charges - gestion - travauxAn - fraisAchat - fraisSCI - y.interets - y.assurance - amort;
      let baseIS = resultat;
      if (baseIS > 0 && deficit > 0) { const u = Math.min(deficit, baseIS); deficit -= u; baseIS -= u; }
      else if (baseIS < 0) { deficit += -baseIS; baseIS = 0; }
      const is = impotSocietes(baseIS, R);
      const benefice = Math.max(0, resultat - is);
      reserves += resultat - is;
      // trésorerie de la société
      const sortie = y.charges + gestion + fraisSCI + y.interets + y.assurance + y.capitalRembourse + is;
      let caisse = treso + loyers - sortie;
      let apportCCA = 0, rembCCA = 0, dividende = 0, pfu = 0;
      if (caisse < 0) { apportCCA = -caisse; cca += apportCCA; caisse = 0; }   // les associés comblent en compte courant
      else {
        rembCCA = Math.min(caisse, cca); cca -= rembCCA; caisse -= rembCCA;     // la société rembourse d'abord leur compte courant
        if (distribuer) {
          const distribuable = Math.min(caisse, pos(reserves));
          dividende = distribuable; caisse -= dividende; reserves -= dividende; pfu = dividende * R.pfu / 100;
        }
      }
      treso = caisse;
      const cash = -apportCCA + rembCCA + dividende - pfu;
      lignes.push({ a: y.a, loyers, charges: y.charges + gestion + travauxAn + fraisAchat + fraisSCI, interets: y.interets + y.assurance, amort, resultat, imposable: baseIS, impotIR: 0, impotPS: 0, is, economie: 0,
        impot: is + pfu, pfu, dividende, mensualites: y.interets + y.assurance + y.capitalRembourse, cashflow: cash, crd: y.crd, cca, treso, note: "" });
    }
    // revente par la société : plus-value professionnelle sur la valeur nette comptable
    const vnc = B.prix + (B.travauxEntretien ? 0 : B.travaux) - amortCumul;
    const pvCompta = B.prixRevente - B.fraisCession - vnc;
    let baseIS = pvCompta;
    if (baseIS > 0 && deficit > 0) { const u = Math.min(deficit, baseIS); deficit -= u; baseIS -= u; }
    const isPV = impotSocietes(pos(baseIS), R);
    const crd = B.ans[B.N - 1].crd;
    const actifNet = treso + B.prixRevente - B.fraisCession - crd - isPV;
    // liquidation : on rend d'abord les comptes courants (sans impôt), le reste est le boni
    const rendCCA = Math.min(pos(actifNet), cca);
    const boni = pos(actifNet - rendCCA);
    const droitPartage = boni * R.droitPartage / 100;
    const pfuBoni = (boni - droitPartage) * R.pfu / 100;
    const netRevente = rendCCA + boni - droitPartage - pfuBoni;
    const pv = { vnc, amortCumul, brute: pvCompta, is: isPV, boni, droitPartage, pfu: pfuBoni, rendCCA, total: isPV + droitPartage + pfuBoni, actifNet };
    return terminer(B, lignes, pv, { netRevente, sci: true });
  }

  // ---------------------------------------------------------------- les indicateurs communs
  function terminer(B, lignes, pv, extra) {
    const N = B.N, crd = B.ans[N - 1].crd;
    // ce qui revient à l'investisseur à la revente, une fois le prêt remboursé et les impôts payés
    const netRevente = extra.netRevente ?? (B.prixRevente - B.fraisCession - crd - pv.total);
    const apport = B.apport;   // (SCI à l'IS : l'apport est versé en compte courant)
    const flux = [-apport, ...lignes.map((l) => l.cashflow)];
    flux[N] += netRevente;
    const cashCumul = lignes.reduce((s, l) => s + l.cashflow, 0);
    const impotsDetention = lignes.reduce((s, l) => s + l.impot, 0);
    const effortMensuel = -cashCumul / N / 12;
    const enrichissement = netRevente + cashCumul - apport;
    const dureePret = Math.min(N, Math.ceil(B.P.annees.length));
    const effortPendantPret = -lignes.slice(0, dureePret).reduce((s, l) => s + l.cashflow, 0) / Math.max(1, dureePret) / 12;
    let cumul = -apport;
    const tresorerieCumulee = lignes.map((l) => (cumul += l.cashflow));
    // montages avec votre société à l'IS : on compte aussi ce qu'elle gagne (avant la flat tax d'une éventuelle sortie)
    const S = extra.societe;
    const fluxGroupe = S ? flux.map((f, i) => f + (S.flux[i] || 0)) : flux;
    return {
      lignes, pv, netRevente, flux: fluxGroupe, fluxFoyer: flux, tri: tri(fluxGroupe), triFoyer: tri(flux), cashCumul, impotsDetention: impotsDetention + (S ? S.impots : 0), impotsFoyer: impotsDetention,
      impotRevente: pv.total, effortMensuel, effortPendantPret,
      enrichissement: enrichissement + (S ? S.gain : 0), enrichissementFoyer: enrichissement, gainSociete: S ? S.gain : 0, miseSociete: S ? S.montant : 0,
      tresorerieCumulee, apport, emprunt: B.emprunt, mensualite: B.P.mensualite + B.P.assuranceMois, prixRevente: B.prixRevente, crdFin: crd,
      coutTotal: B.prix + B.frais + B.travaux + B.mobilier + (extra.usufruit && extra.usufruit.prixNP != null ? S.montant : 0), extra
    };
  }

  const MONTAGES = [
    { id: "nuMicro", nom: "Location nue · micro-foncier", court: "Nu micro", calc: (h, R) => nuDirect(h, R, "micro") },
    { id: "nuReel", nom: "Location nue · réel", court: "Nu réel", calc: (h, R) => nuDirect(h, R, "reel") },
    { id: "lmnpMicro", nom: "LMNP · micro-BIC", court: "LMNP micro", calc: (h, R) => lmnp(h, R, "micro") },
    { id: "lmnpReel", nom: "LMNP · réel", court: "LMNP réel", calc: (h, R) => lmnp(h, R, "reel") },
    { id: "sciIR", nom: "SCI à l'IR", court: "SCI IR", calc: sciIR },
    { id: "sciIS", nom: "SCI à l'IS", court: "SCI IS", calc: sciIS },
    // montages patrimoniaux
    { id: "sciIRInegal", nom: "SCI à l'IR · répartition inégale des résultats", court: "SCI IR inégale", patrimonial: true, calc: (h, R) => sciIR(h, R, { inegal: true }) },
    { id: "sciIRHolding", nom: "SCI à l'IR · financée par votre holding", court: "SCI IR + holding", patrimonial: true, societe: true, calc: (h, R) => sciIR(h, R, { holding: true }) },
    { id: "cessionUsufruit", nom: "Cession temporaire d'usufruit à votre société", court: "Cession d'usufruit", patrimonial: true, societe: true, calc: cessionUsufruit },
    { id: "coacquisition", nom: "Coacquisition démembrée (nue-propriété + usufruit de votre société)", court: "Coacquisition démembrée", patrimonial: true, societe: true, calc: coacquisition }
  ];

  function calculerTout(h, reglages) {
    const R = { ...REGLAGES_DEFAUT, ...(reglages || {}) };
    const res = {};
    for (const m of MONTAGES) if (!h.montages || h.montages.includes(m.id)) res[m.id] = m.calc(h, R);
    return res;
  }

  const Moteur = { REGLAGES_DEFAUT, MONTAGES, calculerTout, pret, prets, valeurUsufruit, tri, abatIR, abatPS, surtaxe, impotSocietes, plusValueParticuliers, base, arrondi };
  if (typeof module !== "undefined" && module.exports) module.exports = Moteur; else racine.Moteur = Moteur;
})(typeof window !== "undefined" ? window : globalThis);
