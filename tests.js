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
const wand = [schicht('Gipsputz', 1.5), schicht('Kalksandstein KS 1800', 17.5), schicht('EPS (Styropor) 035', 14), schicht('Kalkzementputz', 1)];
pruefe('R Gipsputz = 0,015/0,51', fmtR(schichtR(wand[0], 'horizontal')), '0,029');
pruefe('R EPS = 0,14/0,035', fmtR(schichtR(wand[2], 'horizontal')), '4,000');
const Rw = summeR(wand, 'horizontal');
pruefe('ΣR Außenwand', fmtR(Rw), '4,216');
const RTw = RSI_RSE.horizontal.rsi + Rw + RSI_RSE.horizontal.rse;
pruefe('R_T Außenwand = 0,13 + ΣR + 0,04', fmtR(RTw), '4,386');
pruefe('U Außenwand', fmtU(1 / RTw), '0,23');

// Temperaturverlauf
const tv = temperaturverlauf(wand.map(s => ({ ...s, R: schichtR(s, 'horizontal') })), 0.13, 0.04, RTw, 20, -5);
pruefe('q = 25 / R_T', fmtQ(tv.q), '5,70');
pruefe('θ_si = 20 − q·0,13', fmtT(tv.punkte[1].theta), '19,3');
pruefe('Kontrolle: letzter Punkt = θ_e', Math.abs(tv.punkte[tv.punkte.length - 1].theta - (-5)) < 1e-9, true);
pruefe('Punkte: θ_i, θ_si, 4 Schichten, θ_e', tv.punkte.length, 7);
pruefe('Letzte Schicht ist θ_se', tv.punkte[5].stelle.includes('θ_se'), true);

// Mindestwärmeschutz und Schimmel
const minW = pruefeMin('aussenwand', 'normal', Rw, '2013-02');
pruefe('R_min Außenwand normal = 1,20', fmtR(minW.rmin), '1,200');
pruefe('Außenwand erfüllt R_min', minW.ok, true);
const schW = pruefeSchimmel(Rw);
pruefe('f_Rsi Außenwand = 1 − 0,25/4,506', fmtR(schW.fRsi), '0,945');
pruefe('θ_si (Norm) Außenwand', fmtT(schW.thetaSi), '18,6');

// Korrekturwerte
const dg = deltaUg(1, wand, RTw, 'horizontal', 3);
pruefe('ΔU_g Stufe 1 = 0,01·(4,000/4,386)²', fmtDU(dg.wert), '0,0083');
pruefe('ΔU_g Stufe 0 = 0', deltaUg(0, wand, RTw, 'horizontal', 3).wert, 0);
const df = deltaUf({ nf: 4, durchmesser: 6, lambdaF: 50, daemmNr: 3 }, wand, 'horizontal');
pruefe('ΔU_f = 0,8·50·4·(π/4·0,006²)/0,14', fmtDU(df.wert), '0,0323');

// ── Altbau Vollziegel: Kalkputz 1,5 / VMz 1800 24 / KZ-Putz 2 ──
const alt = [schicht('Kalkputz', 1.5), schicht('Vollziegel VMz 1800', 24), schicht('Kalkzementputz', 2)];
const Ra = summeR(alt, 'horizontal');
pruefe('ΣR Altbau', fmtR(Ra), '0,334');
pruefe('Altbau verfehlt R_min', pruefeMin('aussenwand', 'normal', Ra, '2013-02').ok, false);
const schA = pruefeSchimmel(Ra);
pruefe('f_Rsi Altbau', fmtR(schA.fRsi), '0,599');
pruefe('Altbau: Schimmelnachweis nicht erfüllt', schA.ok, false);
pruefe('θ_si (Norm) Altbau', fmtT(schA.thetaSi), '10,0');
pruefe('Grenzfall f_Rsi = 0,70 gilt als erfüllt', pruefeSchimmel(0.25 / 0.3 - 0.29).ok, true);

// ── Luftschichten ──
pruefe('Luft 25 mm horizontal', fmtR(luftR(25, 'horizontal')), '0,180');
pruefe('Luft 12 mm horizontal (interpoliert)', fmtR(luftR(12, 'horizontal')), '0,158');
pruefe('Luft 75 mm abwärts (interpoliert)', fmtR(luftR(75, 'abwaerts')), '0,215');
pruefe('Luft über 300 mm = Endwert', fmtR(luftR(400, 'abwaerts')), '0,230');
pruefe('Luftschicht-Schicht 2,5 cm aufwärts', fmtR(schichtR({ typ: 'luft_ruhend', d: 2.5 }, 'aufwaerts')), '0,160');

// ── Steildach inhomogen: GKB 1,25 / Luft 2,5 / MW 035 20 + KVH 12 % / WF 045 6 ──
const dach = [schicht('Gipskartonplatte (GKB)', 1.25), { typ: 'luft_ruhend', name: 'Luft', d: 2.5 },
  schicht('Mineralwolle (MW) 035', 20), schicht('Holzfaserdämmplatte (WF) 045', 6)];
const ih = inhomogenRT(dach, 0.10, 0.04, 'aufwaerts', { schichtNr: 3, lambdaB: 0.13, fa: 0.88, fb: 0.12 });
pruefe('Inhomogen: R_j,eq = 1/(0,88/5,714 + 0,12/1,538)', fmtR(ih.RjEq), '4,310');
pruefe("Inhomogen: unterer Grenzwert R''_T", fmtR(ih.RTUnten), '5,994');
pruefe("Inhomogen: oberer Grenzwert R'_T", fmtU(ih.RTOben), '6,40');
pruefe('Inhomogen: Verhältnis ≤ 1,5', ih.gueltig, true);
pruefe('Inhomogen: U Steildach', fmtU(1 / ih.RT), '0,16');

// ── Glaser (DIN 4108-3) ──
pruefe('p_sat(20 °C) = 2337 Pa', Math.round(psat(20)), 2337);
pruefe('p_sat(−5 °C) = 401 Pa', Math.round(psat(-5)), 401);
pruefe('p_sat(0 °C) = 610,5 Pa', psat(0), 610.5);
pruefe('p_sat(12 °C) = 1402 Pa', Math.round(psat(12)), 1402);

const gW = glaser(wand, 'horizontal', false);
pruefe('KS + WDVS: S_d = 0,15 + 3,5 + 7 + 0,2', fmtR(gW.Sd), '10,850');
pruefe('KS + WDVS: kein Tauwasser', gW.tauwasser, false);
pruefe('KS + WDVS: Nachweis erfüllt', gW.ok, true);

// Steildach ohne Dampfbremse (Gefach): Hand: θ_c = −0,45 °C, p_c = 588 Pa,
// m_c = 2,0e-10·7 776 000·[(1168,5−588,2)/0,325 − (588,2−320,9)/0,3] = 1,391 kg/m²
dach[1].mu = 1;
const gD = glaser(dach, 'aufwaerts', true);
pruefe('Steildach ohne DB: eine Tauwasserebene', gD.ebenen.length, 1);
pruefe('Steildach ohne DB: Ebene zwischen MW und WF (Grenzfläche 3)', gD.ebenen[0].k, 3);
pruefe('Steildach ohne DB: θ_c', gD.ebenen[0].theta.toFixed(2), '-0.45');
pruefe('Steildach ohne DB: p_c', Math.round(gD.ebenen[0].p), 588);
pruefe('Steildach ohne DB: m_c', fmtR(gD.mc), '1,391');
pruefe('Steildach ohne DB: m_c > 1,0 → nicht zulässig', gD.ok, false);
pruefe('Massenbilanz: m_c = Summe der Ebenen', Math.abs(gD.mc - gD.ebenen.reduce((a, e) => a + e.mc, 0)) < 1e-12, true);

const mitDB = [dach[0], dach[1], schicht('Dampfbremse (s_d ≈ 2 m)', 0.02), dach[2], dach[3]];
const gDB = glaser(mitDB, 'aufwaerts', true);
pruefe('Dampfbremse: s_d = 10000 · 0,0002 m = 2 m', fmtR(gDB.sd[2]), '2,000');
pruefe('Steildach mit Dampfbremse: kein Tauwasser', gDB.tauwasser, false);

// Innendämmung ohne Dampfbremse: Tauwasser hinter der Mineralwolle, Verdunstung reicht nicht
const innen = [schicht('Gipskartonplatte (GKB)', 1.25), schicht('Mineralwolle (MW) 035', 6), schicht('Vollziegel VMz 1800', 24), schicht('Kalkzementputz', 2)];
const gI = glaser(innen, 'horizontal', false);
pruefe('Innendämmung: Tauwasser zwischen MW und Ziegel', gI.ebenen.map(e => e.k).join(), '2');
pruefe('Innendämmung: nicht zulässig', gI.ok, false);
pruefe('Innendämmung: m_ev < m_c', gI.okEv, false);

// ── Daten ──
const namen = BAUSTOFFE.flatMap(g => g.stoffe.map(s => s.name));
pruefe('Baustoffnamen eindeutig', new Set(namen).size, namen.length);
pruefe('Alle λ > 0', BAUSTOFFE.every(g => g.stoffe.every(s => s.lambda > 0)), true);
pruefe('Alle μ > 0', BAUSTOFFE.every(g => g.stoffe.every(s => s.mu > 0)), true);
pruefe('Beispiele nutzen nur vorhandene Baustoffe',
  BEISPIELE.every(b => b.s.every(([typ, stoff]) => typ === 'luft_ruhend' || namen.includes(stoff))), true);
pruefe('Beispiele nutzen nur vorhandene Bauteile', BEISPIELE.every(b => BAUTEILE.some(x => x.id === b.f.bauteil)), true);

console.log(`\n${ok} bestanden, ${fehler} fehlgeschlagen`);
process.exitCode = fehler ? 1 : 0;
