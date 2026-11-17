/* Prüfungen des Rechenkerns – Sollwerte von Hand gerechnet. Aufruf: node tests.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['data.js', 'calc.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });

let ok = 0, fehler = 0;
function pruefe(name, ist, soll) {
  if (ist === soll) { ok++; return; }
  fehler++; console.log(`✗ ${name}\n    ist: ${ist}\n   soll: ${soll}`);
}
const st = name => BAUSTOFFE.flatMap(g => g.stoffe).find(s => s.name === name);
const schicht = (name, dCm) => ({ typ: 'baustoff', name, d: dCm, lambda: st(name).lambda, mu: st(name).mu });
const summeR = (sch, ri) => sch.reduce((a, s) => a + schichtR(s, ri), 0);

// ── Außenwand KS + WDVS: Gipsputz 1,5 / KS 1800 17,5 / EPS 035 14 / KZ-Putz 1 ──
const wand = [schicht('Gipsputz (1400)', 1.5), schicht('Kalksandstein (1800)', 17.5), schicht('EPS (Styropor) 035', 14), schicht('Kalk-/Kalkzementputz (1800)', 1)];
pruefe('R Gipsputz = 0,015/0,51', fmtR(schichtR(wand[0], 'horizontal')), '0,029');
pruefe('R EPS = 0,14/λ_B 0,036', fmtR(schichtR(wand[2], 'horizontal')), '3,889');
const Rw = summeR(wand, 'horizontal');
pruefe('ΣR Außenwand = 0,029 + 0,177 + 3,889 + 0,010', fmtR(Rw), '4,105');
const RTw = RSI_RSE.horizontal.rsi + Rw + RSI_RSE.horizontal.rse;
pruefe('R_T Außenwand = 0,13 + ΣR + 0,04', fmtR(RTw), '4,275');
pruefe('U Außenwand', fmtU(1 / RTw), '0,23');

// Temperaturverlauf
const tv = temperaturverlauf(wand.map(s => ({ ...s, R: schichtR(s, 'horizontal') })), 0.13, 0.04, RTw, 20, -5);
pruefe('q = 25 / 4,275', fmtQ(tv.q), '5,85');
pruefe('θ_si = 20 − q·0,13', fmtT(tv.punkte[1].theta), '19,2');
pruefe('Kontrolle: letzter Punkt = θ_e', Math.abs(tv.punkte[tv.punkte.length - 1].theta - (-5)) < 1e-9, true);
pruefe('Punkte: θ_i, θ_si, 4 Schichten, θ_e', tv.punkte.length, 7);
pruefe('Letzte Schicht ist θ_se', tv.punkte[5].stelle.includes('θ_se'), true);

// Mindestwärmeschutz und Schimmel
const minW = pruefeMin('aussenwand', 'normal', Rw, '2013-02');
pruefe('R_min Außenwand normal = 1,20', fmtR(minW.rmin), '1,200');
pruefe('Außenwand erfüllt R_min', minW.ok, true);
const schW = pruefeSchimmel(Rw);
pruefe('f_Rsi Außenwand = 1 − 0,25/4,395', fmtR(schW.fRsi), '0,943');
pruefe('θ_si (Norm) Außenwand', fmtT(schW.thetaSi), '18,6');

// Korrekturwerte
const dg = deltaUg(1, wand, RTw, 'horizontal', 3);
pruefe('ΔU_g Stufe 1 = 0,01·(3,889/4,275)²', fmtDU(dg.wert), '0,0083');
pruefe('ΔU_g Stufe 0 = 0', deltaUg(0, wand, RTw, 'horizontal', 3).wert, 0);
// Tafel 4.6a: ΔU_f = 0,8·50·4·(π/4·0,006²)/0,14 · (3,889/4,275)² = 0,03231 · 0,8275 = 0,0267
const df = deltaUf({ nf: 4, durchmesser: 6, lambdaF: 50, daemmNr: 3, volleDurchdringung: true }, wand, 'horizontal', RTw);
pruefe('ΔU_f nach Tafel 4.6a (volle Durchdringung)', fmtDU(df.wert), '0,0267');
const dfHalb = deltaUf({ nf: 4, durchmesser: 6, lambdaF: 50, daemmNr: 3, volleDurchdringung: false, d1: 7 }, wand, 'horizontal', RTw);
pruefe('ΔU_f: halbe Eindringtiefe → α = 0,4 → halber Wert', fmtDU(dfHalb.wert), fmtDU(df.wert / 2));

// Tafel 4.6b: ΔU_r für Umkehrdächer
pruefe('ΔU_r: Anteil 5 % → 0,05', deltaUrTafel(3.8, 4).wert, 0.05);
pruefe('ΔU_r: Anteil 30 % → 0,03', deltaUrTafel(2.8, 4).wert, 0.03);
pruefe('ΔU_r: Anteil 60 % → 0', deltaUrTafel(1.6, 4).wert, 0);

// ── Altbau Vollziegel: Kalkputz 1,5 / Vollziegel 1800 24 / Kalkzementputz 2 ──
// Hand: R = 0,015/1,0 + 0,24/0,81 + 0,02/1,0 = 0,3313; f_Rsi = 1 − 0,25/0,6213 = 0,5976; θ_si = −5 + 0,5976·25 = 9,94
const alt = [schicht('Kalk-/Kalkzementputz (1800)', 1.5), schicht('Vollziegel (1800)', 24), schicht('Kalk-/Kalkzementputz (1800)', 2)];
const Ra = summeR(alt, 'horizontal');
pruefe('ΣR Altbau', fmtR(Ra), '0,331');
pruefe('Altbau verfehlt R_min', pruefeMin('aussenwand', 'normal', Ra, '2013-02').ok, false);
const schA = pruefeSchimmel(Ra);
pruefe('f_Rsi Altbau', fmtR(schA.fRsi), '0,598');
pruefe('Altbau: Schimmelnachweis nicht erfüllt', schA.ok, false);
pruefe('θ_si (Norm) Altbau', fmtT(schA.thetaSi), '9,9');
// Schimmelpilzschwelle (Schneider 26, S. 4.24): φ_i,O = 1,25·50 = 62,5 % → θ_si,min = 12,6 °C
pruefe('Taupunkt-Näherung 20 °C / 62,5 % = 12,6 °C', fmtT(taupunkt(20, 62.5)), '12,6');
pruefe('Taupunkt-Näherung 20 °C / 50 % = 9,3 °C (Tafel 4.24)', fmtT(taupunkt(20, 50)), '9,3');
pruefe('Taupunkt-Näherung 10 °C / 80 % = 6,7 °C (Tafel 4.24)', fmtT(taupunkt(10, 80)), '6,7');
pruefe('Schimmelpilzschwelle θ_si,min', pruefeSchimmel(1).thetaMin, 12.6);
// θ_si = 12,6 °C ↔ R_T = 0,25·25/7,4 = 0,8446 → R = 0,5546 (= erf R); θ_si = 12,5 °C ↔ R = 0,5433
pruefe('erf R = 0,25·25/7,4 − 0,29', fmtR(pruefeSchimmel(1).erfR), '0,555');
pruefe('θ_si = 12,6 °C → erfüllt', pruefeSchimmel(0.25 * 25 / 7.4 - 0.29).ok, true);
pruefe('θ_si = 12,5 °C (f_Rsi = 0,70) → nicht erfüllt', pruefeSchimmel(0.25 * 25 / 7.5 - 0.29).ok, false);

// ── Luftschichten ──
pruefe('Luft 25 mm horizontal', fmtR(luftR(25, 'horizontal')), '0,180');
pruefe('Luft 12 mm horizontal (interpoliert)', fmtR(luftR(12, 'horizontal')), '0,158');
pruefe('Luft 75 mm abwärts (interpoliert)', fmtR(luftR(75, 'abwaerts')), '0,215');
pruefe('Luft über 300 mm = Endwert', fmtR(luftR(400, 'abwaerts')), '0,230');
pruefe('Luftschicht-Schicht 2,5 cm aufwärts', fmtR(schichtR({ typ: 'luft_ruhend', d: 2.5 }, 'aufwaerts')), '0,160');

// ── Steildach inhomogen: GKB 1,25 / Luft 2,5 / MW 035 20 + KVH 12 % / WF 045 6 ──
const dach = [schicht('Gipskartonplatte (900)', 1.25), { typ: 'luft_ruhend', name: 'Luft', d: 2.5 },
  schicht('Mineralwolle (MW) 035', 20), schicht('Holzfaserdämmplatte (WF) 045', 6)];
const ih = inhomogenRT(dach, 0.10, 0.04, 'aufwaerts', { schichtNr: 3, lambdaB: 0.13, fa: 0.88, fb: 0.12 });
pruefe('Inhomogen: R_j,eq = 1/(0,88/5,556 + 0,12/1,538)', fmtR(ih.RjEq), '4,230');
pruefe("Inhomogen: unterer Grenzwert R''_T", fmtR(ih.RTUnten), '5,857');
pruefe("Inhomogen: oberer Grenzwert R'_T", fmtU(ih.RTOben), '6,23');
pruefe('Inhomogen: Verhältnis ≤ 1,5', ih.gueltig, true);
pruefe('Inhomogen: U Steildach', fmtU(1 / ih.RT), '0,17');

// ── Glaser (DIN 4108-3) ──
pruefe('p_sat(20 °C) = 2337 Pa', Math.round(psat(20)), 2337);
pruefe('p_sat(−5 °C) = 401 Pa', Math.round(psat(-5)), 401);
pruefe('p_sat(0 °C) = 610,5 Pa', psat(0), 610.5);
pruefe('p_sat(12 °C) = 1402 Pa', Math.round(psat(12)), 1402);

const gW = glaser(wand, 'horizontal', false);
pruefe('KS + WDVS: S_d = 4·0,015 + 15·0,175 + 20·0,14 + 15·0,01', fmtR(gW.Sd), '5,635');
pruefe('KS + WDVS: kein Tauwasser', gW.tauwasser, false);
pruefe('KS + WDVS: Nachweis erfüllt', gW.ok, true);

// Steildach ohne Dampfbremse (Gefach): Hand: θ_c = −0,45 °C, p_c = 588 Pa,
// WF außen mit dem ungünstigeren μ = 5. θ_c = 20 − 25·6,016/7,332 = −0,51 °C, p_c = 585 Pa;
// s_d innen = 4·0,0125 + 0,025 + 0,2 = 0,275 m, außen 5·0,06 = 0,3 m
// m_c = 2,0e-10·7 776 000·[(1168,5−585,3)/0,275 − (585,3−320,9)/0,3] = 1,93 kg/m²
dach[1].mu = 1;
dach[3].mu = 5;
const gD = glaser(dach, 'aufwaerts', true);
pruefe('Steildach ohne DB: eine Tauwasserebene', gD.ebenen.length, 1);
pruefe('Steildach ohne DB: Ebene zwischen MW und WF (Grenzfläche 3)', gD.ebenen[0].k, 3);
pruefe('Steildach ohne DB: θ_c', gD.ebenen[0].theta.toFixed(2), '-0.51');
pruefe('Steildach ohne DB: p_c', Math.round(gD.ebenen[0].p), 585);
pruefe('Steildach ohne DB: m_c', fmtU(gD.mc), '1,93');
pruefe('Steildach ohne DB: m_c > 1,0 → nicht zulässig', gD.ok, false);
// Verdunstung nach Tafel 4.29b: Dach p_s = 2000 Pa, p_i = p_e = 1200 Pa
// M_ev = 2,0e-10·7 776 000·(800/0,275 + 800/0,3) = 8,67 kg/m²
pruefe('Steildach ohne DB: M_ev (Dach, p_s 2000 Pa)', fmtU(gD.mev), '8,67');
pruefe('Steildach ohne DB: M_ev ≥ M_c', gD.okEv, true);

// μ-Wahl nach Tafel 4.29a: GKB innen 4/10 → 4, WF außen 3/5 → 5 → gleiches Ergebnis wie oben
const dachBereich = dach.map(s => s.name === 'Gipskartonplatte (900)' ? { ...s, mu: 4, muMin: 4, muMax: 10 }
  : s.name === 'Holzfaserdämmplatte (WF) 045' ? { ...s, mu: 3, muMin: 3, muMax: 5 } : s);
const gU = glaserUnguenstig(dachBereich, 'aufwaerts', true);
pruefe('Tafel 4.29a: μ vor Taupunkt min, dahinter max', gU.mus.join(), '4,1,1,5');
pruefe('Tafel 4.29a: M_c wie von Hand', fmtU(gU.mc), '1,93');
const nurMin = glaser(dachBereich.map(s => ({ ...s, mu: s.muMin ?? s.mu })), 'aufwaerts', true);
const nurMax = glaser(dachBereich.map(s => ({ ...s, mu: s.muMax ?? s.mu })), 'aufwaerts', true);
pruefe('Tafel 4.29a: M_c ≥ alle min und ≥ alle max', gU.mc >= nurMin.mc && gU.mc >= nurMax.mc, true);
pruefe('Massenbilanz: m_c = Summe der Ebenen', Math.abs(gD.mc - gD.ebenen.reduce((a, e) => a + e.mc, 0)) < 1e-12, true);

const mitDB = [dach[0], dach[1], schicht('PE-Folie 0,15 mm (s_d = 50 m)', 0.015), dach[2], dach[3]];
const gDB = glaser(mitDB, 'aufwaerts', true);
pruefe('PE-Folie 0,15 mm: s_d = 50 m (Tafel 4.33)', fmtR(gDB.sd[2]), '50,000');
pruefe('PE-Folie ohne λ: R = 0', schichtR(mitDB[2], 'aufwaerts'), 0);
pruefe('Steildach mit PE-Dampfbremse: kein Tauwasser', gDB.tauwasser, false);

// Innendämmung ohne Dampfbremse: Tauwasser hinter der Mineralwolle, Verdunstung reicht nicht
const innen = [schicht('Gipskartonplatte (900)', 1.25), schicht('Mineralwolle (MW) 035', 6), schicht('Vollziegel (1800)', 24), schicht('Kalk-/Kalkzementputz (1800)', 2)];
const gI = glaser(innen, 'horizontal', false);
pruefe('Innendämmung: Tauwasser zwischen MW und Ziegel', gI.ebenen.map(e => e.k).join(), '2');
pruefe('Innendämmung: nicht zulässig', gI.ok, false);
pruefe('Innendämmung: m_ev < m_c', gI.okEv, false);
// Wand p_s = 1700 Pa: M_ev = 2,0e-10·7 776 000·(500/0,11 + 500/1,5) = 7,59 kg/m²
pruefe('Innendämmung: M_ev (Wand, p_s 1700 Pa)', fmtU(gI.mev), '7,59');

// ── PFLICHT-TESTFALL: Beispiel nach DIN 4108-3, Schneider 26, S. 4.31 ──
// OSB 19 mm (μ 30/50) / Dampfbremse s_d 2,00 m / MW 040 160 mm (λ 0,040) / OSB 19 mm
// Buch: R_T = 4,582; θ 18,6 | 17,8 | 17,8 | −4,0 | −4,8; p_sat 2147 | 2042 | 2042 | 437 | 409;
// s_T = 3,68 m; M_c = 0,226 kg/m²; M_ev = 1,1 kg/m²; zul. M_c = 0,03·0,019·650 = 0,37 kg/m²
const osb = () => ({ typ: 'baustoff', name: 'OSB-Platte (650)', d: 1.9, lambda: 0.13, mu: 30, muMin: 30, muMax: 50, rho: 650, holz: 0.03 });
const bsp = [osb(), { typ: 'baustoff', name: 'Dampfbremse', d: 0.005, lambda: NaN, mu: 40000 },
  { typ: 'baustoff', name: 'MW 040', d: 16, lambda: 0.040, mu: 1 }, osb()];
const gB = glaserUnguenstig(bsp, 'horizontal', false);
pruefe('S. 4.31: μ automatisch innen 30, außen 50 (Tafel 4.29a)', [gB.mus[0], gB.mus[3]].join(), '30,50');
pruefe('S. 4.31: R_T = 4,582', fmtR(gB.RT), '4,582');
pruefe('S. 4.31: Temperaturen', gB.theta.map(fmtT).join(' | '), '18,6 | 17,8 | 17,8 | -4,0 | -4,8');
pruefe('S. 4.31: p_sat (±2 Pa)', gB.ps.map((p, i) => Math.abs(p - [2147, 2042, 2042, 437, 409][i]) <= 2).every(Boolean), true);
pruefe('S. 4.31: s_T = 3,68 m', fmtR(gB.Sd), '3,680');
pruefe('S. 4.31: eine Tauwasserebene zwischen MW und OSB außen', gB.ebenen.map(e => e.k).join(), '3');
pruefe('S. 4.31: M_c = 0,226 → 0,23 kg/m²', fmtU(gB.mc), '0,23');
pruefe('S. 4.31: M_ev = 1,1 kg/m²', fmtU(gB.mev), '1,10');
pruefe('S. 4.31: zul. M_c = 0,03·0,019·650 = 0,37 kg/m²', fmtU(gB.mcGrenze), '0,37');
pruefe('S. 4.31: Nachweis erfüllt', gB.ok, true);

// ── Tafel 4.30 Fall 3 (zwei Tauwasserebenen) ──
// s_d: Putz 0,15 | MW 0,08 | Beton 5,0 | MW 0,08 | Folie 100 → Ebenen bei 0,23 m und 5,31 m
// g_ev1 = 2e-10·500/0,23 = 4,348e-7; g_ev2 = 2e-10·500/100 = 1e-9; t_ev1 = M_c1/g_ev1 < t_ev2
// M_ev = M_c1 + g_ev2·t_ev1 + (2e-10·500/5,31 + g_ev2)·(t_ev − t_ev1) = 0,972 + 0,002 + 0,110 = 1,08
const L3 = (name, d, lambda, mu) => ({ typ: 'baustoff', name, d, lambda, mu });
const g3 = glaser([L3('Putz', 1.5, 0.7, 10), L3('MW', 8, 0.036, 1), L3('Beton', 5, 2.3, 100), L3('MW', 8, 0.036, 1), L3('Folie', 0.02, NaN, 500000)], 'horizontal', false);
pruefe('Fall 3: zwei Ebenen', g3.ebenen.map(e => e.k).join(), '2,4');
pruefe('Fall 3: Ebene 1 trocknet zuerst', g3.verd.variante, 't1');
pruefe('Fall 3: M_ev', fmtU(g3.mev), '1,08');

// ── GModG (§ 36 / Anlage 7, Anlage 1) ──
pruefe('GModG: KS + WDVS U = 0,23 ≤ 0,24 (Nr. 1b)', pruefeGModG('bestand', 'aussenwand', '1b', 'normal', 1 / RTw).ok, true);
pruefe('GModG: Vorauswahl Außenwand ist Nr. 1b', pruefeGModG('bestand', 'aussenwand', '', 'normal', 0.3).zeile.id, '1b');
pruefe('GModG: Altbau U = 1,99 > 0,24', pruefeGModG('bestand', 'aussenwand', '1a', 'normal', 1.99).ok, false);
pruefe('GModG: Flachdach Nr. 5c U_max = 0,20', pruefeGModG('bestand', 'flachdach', '5c', 'normal', 0.2).umax, 0.20);
pruefe('GModG: Grenzfall 0,2449 → gerundet 0,24 ≤ 0,24', pruefeGModG('bestand', 'aussenwand', '1b', 'normal', 0.2449).ok, true);
pruefe('GModG: 0,2451 → gerundet 0,25 > 0,24', pruefeGModG('bestand', 'aussenwand', '1b', 'normal', 0.2451).ok, false);
pruefe('GModG: Zone 12–19 °C Außenwand U_max = 0,35', pruefeGModG('bestand', 'aussenwand', '1b', 'niedrig', 0.3).umax, 0.35);
pruefe('GModG: Kellerdecke Zone 12–19 °C → keine Anforderung', pruefeGModG('bestand', 'kellerdecke', '6b', 'niedrig', 2).keineAnforderung, true);
pruefe('GModG: Kellerdecke Nr. 6c (Fußbodenaufbau warm) U_max = 0,50', pruefeGModG('bestand', 'kellerdecke', '6c', 'normal', 0.4).umax, 0.50);
pruefe('GModG: fremde Zeile wird durch Vorauswahl ersetzt', pruefeGModG('bestand', 'steildach', '1a', 'normal', 0.2).zeile.id, '5b');
pruefe('GModG Neubau: Referenz Außenwand 0,28', pruefeGModG('neubau', 'aussenwand', '', 'normal', 0.23).umax, 0.28);
pruefe('GModG Neubau: Referenz Dach 0,20, U 0,16 besser', pruefeGModG('neubau', 'steildach', '', 'normal', 0.16).ok, true);
pruefe('GModG: keine Prüfung → null', pruefeGModG('keine', 'aussenwand', '', 'normal', 0.2), null);
pruefe('Jedes Bauteil hat gültige Anlage-7-Zeilen und Referenz',
  BAUTEILE.every(b => b.anl7.length && b.anl7.every(id => GMODG.anl7.some(z => z.id === id)) && GMODG.ref[b.refKey]), true);

// ── Daten ──
const namen = BAUSTOFFE.flatMap(g => g.stoffe.map(s => s.name));
pruefe('Baustoffnamen eindeutig', new Set(namen).size, namen.length);
pruefe('Alle λ > 0 (oder Folie mit s_d)', BAUSTOFFE.every(g => g.stoffe.every(s => s.lambda > 0 || (s.lambda === null && s.sd > 0))), true);
pruefe('Alle μ > 0, μ ≤ μ_max', BAUSTOFFE.every(g => g.stoffe.every(s => s.mu > 0 && (!s.muMax || s.mu <= s.muMax))), true);
// Stichproben gegen Schneider 26, Tafel 4.33
pruefe('Taf. 4.33: Kalksandstein 1800 λ 0,99, μ 15/25', [st('Kalksandstein (1800)').lambda, st('Kalksandstein (1800)').mu, st('Kalksandstein (1800)').muMax].join(), '0.99,15,25');
pruefe('Taf. 4.33: Stahlbeton 1 % Stahl λ 2,3, μ 80/130', [st('Stahlbeton (2300, 1 % Stahl)').lambda, st('Stahlbeton (2300, 1 % Stahl)').mu, st('Stahlbeton (2300, 1 % Stahl)').muMax].join(), '2.3,80,130');
pruefe('Taf. 4.33: Gipskartonplatte 900 λ 0,25, μ 4/10', [st('Gipskartonplatte (900)').lambda, st('Gipskartonplatte (900)').mu, st('Gipskartonplatte (900)').muMax].join(), '0.25,4,10');
pruefe('Taf. 4.33: Porenbeton-Planstein 350 λ 0,11', st('Porenbeton-Planstein PP (350)').lambda, 0.11);
pruefe('Taf. 4.43: MW 035 → λ_B 0,036, μ 1', [st('Mineralwolle (MW) 035').lambda, st('Mineralwolle (MW) 035').mu].join(), '0.036,1');
pruefe('Taf. 4.43: WF 045 → λ_B 0,047, μ 3/5', [st('Holzfaserdämmplatte (WF) 045').lambda, st('Holzfaserdämmplatte (WF) 045').mu, st('Holzfaserdämmplatte (WF) 045').muMax].join(), '0.047,3,5');
pruefe('Taf. 4.43: XPS 035 → λ_B 0,036, μ 80/250', [st('XPS 035').lambda, st('XPS 035').mu, st('XPS 035').muMax].join(), '0.036,80,250');
pruefe('Dämmstoffe mit λ_D: λ_B > λ_D', BAUSTOFFE.flatMap(g => g.stoffe).filter(s => s.lambdaD).every(s => s.lambda > s.lambdaD), true);
pruefe('Taf. 4.33: Aluminiumfolie s_d = 1500 m', Math.round(st('Aluminiumfolie 0,05 mm (s_d = 1500 m)').mu * 0.005 / 100), 1500);
pruefe('Anlage 7: Fußnote 1 gilt für Nr. 1a, 1b, 5a–5c, 6a–6e', GMODG.anl7.every(z => z.fn.includes(1)), true);
pruefe('Beispiele nutzen nur vorhandene Baustoffe',
  BEISPIELE.every(b => b.s.every(([typ, stoff]) => typ === 'luft_ruhend' || stoff === '' || namen.includes(stoff))), true);
pruefe('Beispiele nutzen nur vorhandene Bauteile', BEISPIELE.every(b => BAUTEILE.some(x => x.id === b.f.bauteil)), true);

console.log(`\n${ok} bestanden, ${fehler} fehlgeschlagen`);
process.exitCode = fehler ? 1 : 0;
