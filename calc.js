'use strict';
/* Wärmeschutz-Rechner – Berechnungskern */

// ── Formatierung (Komma als Dezimaltrennzeichen) ──────────────
function fmtR(v)  { return v.toFixed(3).replace('.',','); }
function fmtU(v)  { return v.toFixed(2).replace('.',','); }
function fmtT(v)  { return v.toFixed(1).replace('.',','); }
function fmtDU(v) { return v.toFixed(4).replace('.',','); }
function fmtQ(v)  { return v.toFixed(2).replace('.',','); }
function fmtEta(v){ return v.toFixed(2).replace('.',','); }

// ── Luftschicht-R (lineare Interpolation) ─────────────────────
function luftR(dMm, richtung) {
  const tab = LUFT_R[richtung];
  if (!tab || dMm <= 0) return 0;
  if (dMm >= tab[tab.length-1][0]) return tab[tab.length-1][1];
  for (let i = 0; i < tab.length-1; i++) {
    if (dMm >= tab[i][0] && dMm <= tab[i+1][0]) {
      const [d0,r0] = tab[i], [d1,r1] = tab[i+1];
      return d0 === d1 ? r0 : r0 + (r1-r0)*(dMm-d0)/(d1-d0);
    }
  }
  return 0;
}

// ── R einer Schicht ───────────────────────────────────────────
function schichtR(s, richtung) {
  if (s.typ === 'luft_ruhend') return luftR(s.d * 10, richtung);
  if (!(s.d > 0) || !(s.lambda > 0)) return 0;   // Folien ohne λ: R vernachlässigbar
  return (s.d / 100) / s.lambda;
}

// ── Inhomogene Schicht (Ober-/Untergrenze DIN EN ISO 6946 §6.2) ─
function inhomogenRT(schichten, rsi, rse, richtung, inh) {
  const idx = inh.schichtNr - 1;
  if (idx < 0 || idx >= schichten.length) return null;

  const dM = schichten[idx].d / 100;
  const Ra = dM / schichten[idx].lambda;
  const Rb = dM / inh.lambdaB;

  let RHom = 0;
  for (let i = 0; i < schichten.length; i++) {
    if (i !== idx) RHom += schichtR(schichten[i], richtung);
  }

  // Oberer Grenzwert: 1/R'_T = f_a/R_T,a + f_b/R_T,b
  const RTa = rsi + RHom + Ra + rse;
  const RTb = rsi + RHom + Rb + rse;
  const RTOben = 1 / (inh.fa/RTa + inh.fb/RTb);

  // Unterer Grenzwert: äquivalenter R der inhomogenen Schicht
  const RjEq = 1 / (inh.fa/Ra + inh.fb/Rb);
  const RTUnten = rsi + RHom + RjEq + rse;

  const RT = (RTOben + RTUnten) / 2;
  const verh = RTOben / RTUnten;

  return { RTOben, RTUnten, RT, verh, gueltig: verh <= 1.5, Ra, Rb, RjEq, RHom };
}

// ── ΔU_g (Luftspalte in Dämmung) ─────────────────────────────
function deltaUg(stufe, schichten, RT, richtung, daemmNr) {
  if (stufe === 0 || !daemmNr) return { wert:0, text:'ΔU_g = 0 (Stufe 0)' };
  const idx = daemmNr - 1;
  if (idx < 0 || idx >= schichten.length) return { wert:0, text:'ΔU_g = 0 (Schicht nicht gefunden)' };

  const RD = schichtR(schichten[idx], richtung);
  const dU = DELTA_UG[stufe] || 0;
  const v = RD / RT;
  const wert = dU * v * v;
  return {
    wert,
    text: `ΔU_g = ΔU″ × (R_Dämmung / R_T)²\n     = ${fmtDU(dU)} × (${fmtR(RD)} / ${fmtR(RT)})²\n     = ${fmtDU(wert)} W/(m²K)`
  };
}

// ── ΔU_f (Befestigungselemente), Näherungsverfahren Schneider 26, Tafel 4.6a ─
// ΔU_f = α·λ_f·n_f·A_f/d₀ · (R₁/R_T,h)²  mit α = 0,8·d₁/d₀ (volle Durchdringung: d₁ = d₀)
function deltaUf(bef, schichten, richtung, RT) {
  if (!bef || !bef.nf || !bef.durchmesser || !bef.lambdaF) return { wert:0, text:'ΔU_f = 0 (keine Befestigungselemente)' };
  const idx = (bef.daemmNr || 1) - 1;
  const s = idx >= 0 && idx < schichten.length ? schichten[idx] : null;
  const d0 = s ? s.d / 100 : 0;
  if (d0 <= 0) return { wert:0, text:'ΔU_f = 0 (Dämmdicke ≤ 0)' };

  const d1 = bef.volleDurchdringung || !(bef.d1 > 0) ? d0 : Math.min(bef.d1 / 100, d0);
  const alpha = ALPHA_BEF * d1 / d0;
  const Af = Math.PI / 4 * Math.pow(bef.durchmesser / 1000, 2);
  const R1 = schichtR(s, richtung);
  const v = R1 / RT;
  const wert = alpha * bef.lambdaF * bef.nf * Af / d0 * v * v;
  return {
    wert,
    text: `α = 0,8 · d₁/d₀ = 0,8 · ${fmtR(d1)} / ${fmtR(d0)} = ${fmtR(alpha)}\n` +
          `ΔU_f = α · λ_f · n_f · A_f / d₀ · (R₁ / R_T,h)²\n` +
          `     = ${fmtR(alpha)} · ${fmtR(bef.lambdaF)} · ${fmtR(bef.nf)} · ${fmtDU(Af)} / ${fmtR(d0)} · (${fmtR(R1)} / ${fmtR(RT)})²\n` +
          `     = ${fmtDU(wert)} W/(m²K)`
  };
}

// ── ΔU_r (Umkehrdach) nach DIN 4108-2, Schneider 26, Tafel 4.6b ─
// Anteil (R_T − R_i)/R_T: < 10 % → 0,05; 10 bis 50 % → 0,03; > 50 % → 0,00
function deltaUrTafel(Ri, RT) {
  const anteil = (RT - Ri) / RT * 100;
  const wert = anteil < 10 ? 0.05 : anteil <= 50 ? 0.03 : 0;
  return {
    wert, anteil,
    text: `ΔU_r nach Tafel 4.6b: (R_T − R_i) / R_T = (${fmtR(RT)} − ${fmtR(Ri)}) / ${fmtR(RT)} = ${anteil.toFixed(1).replace('.', ',')} %\n` +
          `     → ΔU_r = ${fmtDU(wert)} W/(m²K)`
  };
}

// ── Temperaturverlauf ─────────────────────────────────────────
function temperaturverlauf(schichtenR, rsi, rse, RT, ti, te) {
  const q = (ti - te) / RT;
  const p = [];
  let sR = 0;

  p.push({ stelle:'Innenluft θ_i',          sR:0,  theta:ti });
  sR += rsi;
  p.push({ stelle:'Innere Oberfläche θ_si', sR,    theta: ti - q*sR });

  const n = schichtenR.length;
  for (let i = 0; i < n; i++) {
    sR += schichtenR[i].R;
    const nach = 'nach ' + (schichtenR[i].name || 'Schicht '+(i+1));
    p.push({ stelle: i === n-1 ? nach + ' = äußere Oberfläche θ_se' : nach, sR, theta: ti - q*sR });
  }

  sR += rse;
  p.push({ stelle:'Außenluft θ_e (Kontrolle)', sR, theta: ti - q*sR, kontrolle:true });

  return { q, punkte:p };
}

// ── Mindestwärmeschutz ────────────────────────────────────────
function pruefeMin(bauteilId, raum, Rvorh, din) {
  const bt = BAUTEILE.find(b => b.id === bauteilId);
  if (!bt) return null;
  const tab = (R_MIN[din] || {})[raum === 'niedrig' ? 'niedrig' : 'normal'];
  if (!tab) return null;
  const ref = tab[bt.rminKey];
  if (!ref) return null;
  const eta = ref.rmin / Rvorh;
  return { rmin:ref.rmin, Rvorh, eta, ok: Rvorh >= ref.rmin, text:ref.text, zeile:ref.zeile, din, geprueft: ref.geprueft || '' };
}

// ── GModG: § 36 / Anlage 7 (Bestand) bzw. Referenzgebäude Anlage 1 (Neubau) ─
function pruefeGModG(fall, bauteilId, zeileId, raum, U) {
  if (fall === 'keine') return null;
  const bt = BAUTEILE.find(b => b.id === bauteilId);
  if (!bt) return null;
  const Ur = Math.round(U * 100) / 100;   // Vergleich mit dem auf 2 Stellen gerundeten U-Wert
  if (fall === 'neubau') {
    const r = GMODG.ref[bt.refKey];
    return { fall, U, Ur, umax: r.u, text: r.text, ok: Ur <= r.u };
  }
  const z = GMODG.anl7.find(x => x.id === zeileId && bt.anl7.includes(x.id)) || GMODG.anl7.find(x => x.id === bt.anl7[0]);
  const umax = raum === 'niedrig' ? z.niedrig : z.hoch;
  return { fall, U, Ur, umax, zeile: z, zone: raum === 'niedrig' ? '12 bis < 19 °C' : '≥ 19 °C',
           keineAnforderung: umax === null, ok: umax === null || Ur <= umax };
}

// ── Taupunkttemperatur, Näherungsgleichung Schneider 26, Tafel 4.24 ─
// θ_s = (φ·0,01)^0,1247 · (109,8 + θ) − 109,8   (φ in %)
function taupunkt(theta, phi) {
  return Math.pow(phi * 0.01, 0.1247) * (109.8 + theta) - 109.8;
}

// ── Schimmelnachweis (Schneider 26, S. 4.24): Schimmelpilzschwelle ─
// θ_si,min = Taupunkt bei φ_i,O = φ_i / 0,8 = 1,25·φ_i; 20 °C / 50 % → 62,5 % → 12,6 °C
function pruefeSchimmel(R) {
  const S = SCHIMMEL;
  const RT = S.rsi + R + S.rse;
  const fRsi = 1 - S.rsi / RT;
  const thetaSi = S.ti - (S.ti - S.te) * S.rsi / RT;
  const phiO = S.phi / S.phiKapillar;
  const thetaMin = Math.round(taupunkt(S.ti, phiO) * 10) / 10;
  const erfR = S.rsi * (S.ti - S.te) / (S.ti - thetaMin) - (S.rsi + S.rse);
  const erfU = (1 / S.rsi) * (S.ti - thetaMin) / (S.ti - S.te);
  return { ...S, R, RT, fRsi, thetaSi, phiO, thetaMin, erfR, erfU, ok: Math.round(thetaSi * 10) / 10 >= thetaMin };
}

// ── Feuchteschutz: Glaser-Verfahren (DIN 4108-3) ──────────────
// Sättigungsdampfdruck [Pa] (Magnus-Formel, DIN 4108-3)
function psat(theta) {
  return theta >= 0 ? 610.5 * Math.exp(17.269 * theta / (237.3 + theta))
                    : 610.5 * Math.exp(21.875 * theta / (265.5 + theta));
}

// schichten: { d [cm], lambda, mu, typ }, Grenzfläche k = 0 (innen) … n (außen)
function glaser(schichten, richtung, dach) {
  const G = GLASER, n = schichten.length;
  const R = schichten.map(s => schichtR(s, richtung));
  const sd = schichten.map(s => s.mu * s.d / 100);
  const x = [0]; sd.forEach(v => x.push(x[x.length-1] + v));
  const Sd = x[n];
  const RT = G.rsi + R.reduce((a, v) => a + v, 0) + G.rse;
  const Rk = [G.rsi]; R.forEach(v => Rk.push(Rk[Rk.length-1] + v));
  const temp = (ti, te) => Rk.map(r => ti - (ti - te) * r / RT);
  const sek = h => h * 3600;

  // Tauperiode
  const T = G.tau;
  const theta = temp(T.ti, T.te), ps = theta.map(psat);
  const pi = T.phiI * psat(T.ti), pe = T.phiE * psat(T.te);

  // Gespannter Faden = untere konvexe Hülle von (0|p_i), p_sat der inneren Grenzflächen, (S_d|p_e)
  const pkt = [{ x: 0, p: pi, k: -1 }];
  for (let k = 1; k < n; k++) pkt.push({ x: x[k], p: ps[k], k });
  pkt.push({ x: Sd, p: pe, k: n + 1 });
  const huelle = [];
  for (const q of pkt) {
    while (huelle.length >= 2) {
      const a = huelle[huelle.length-2], b = huelle[huelle.length-1];
      if ((b.x - a.x) * (q.p - a.p) - (b.p - a.p) * (q.x - a.x) <= 0) huelle.pop(); else break;
    }
    huelle.push(q);
  }
  const g = huelle.slice(1).map((b, j) => G.delta0 * (huelle[j].p - b.p) / (b.x - huelle[j].x));
  const ebenen = huelle.slice(1, -1).map((h, j) => ({ ...h, theta: theta[h.k], mc: (g[j] - g[j+1]) * sek(T.stunden) }));
  const mc = ebenen.reduce((a, e) => a + e.mc, 0);

  // Verdunstungsperiode mit festen Dampfdrücken (Tafel 4.29b), Fälle nach Tafel 4.30
  let verd = null, mev = 0;
  if (ebenen.length) {
    const V = G.verd, d0 = G.delta0, tev = sek(V.stunden);
    const pc = dach ? V.psDach : V.psWand;
    const a = ebenen[0], b = ebenen[ebenen.length-1];
    verd = { pc, piV: V.pI, peV: V.pE, dach, tev };
    if (ebenen.length === 1) {                       // Fall 2: eine Tauwasserebene
      verd.fall = 2;
      verd.gI = d0 * (pc - V.pI) / a.x;
      verd.gE = d0 * (pc - V.pE) / (Sd - a.x);
      verd.xA = verd.xB = a.x;
      mev = (verd.gI + verd.gE) * tev;
    } else if (ebenen.length === 2) {                // Fall 3: zwei Tauwasserebenen
      verd.fall = 3;
      const g1 = d0 * (pc - V.pI) / a.x, g2 = d0 * (pc - V.pE) / (Sd - b.x);
      const t1 = a.mc / g1, t2 = b.mc / g2;
      Object.assign(verd, { gI: g1, gE: g2, t1, t2, xA: a.x, xB: b.x });
      if (t1 > tev && t2 > tev) { verd.variante = 'beide'; mev = (g1 + g2) * tev; }
      else if (t1 < t2) {   // Ebene 1 trocknet zuerst, danach verdunstet Ebene 2 auch nach innen
        verd.variante = 't1'; verd.g2i = d0 * (pc - V.pI) / b.x;
        mev = g1 * t1 + g2 * t1 + (verd.g2i + g2) * (tev - t1);
      } else {
        verd.variante = 't2'; verd.g1e = d0 * (pc - V.pE) / (Sd - a.x);
        mev = g2 * t2 + g1 * t2 + (g1 + verd.g1e) * (tev - t2);
      }
    } else {                                         // Fall 4: Tauwasserbereich
      verd.fall = 4;
      const xm = a.x + 0.5 * (b.x - a.x);
      Object.assign(verd, { xA: a.x, xB: b.x, xm });
      verd.gI = d0 * (pc - V.pI) / xm;
      verd.gE = d0 * (pc - V.pE) / (Sd - xm);
      mev = (verd.gI + verd.gE) * tev;
    }
  }

  // Grenze M_c: 1,0 kg/m²; Holz ≤ 5 %, Holzwerkstoffe ≤ 3 % der flächenbezogenen Masse
  // der an die Tauwasserebene grenzenden Schicht (Schneider 26, Abschn. 3.5.1 und Beispiel S. 4.31)
  const holz = [];
  ebenen.forEach(e => [schichten[e.k-1], schichten[e.k]].forEach(s => {
    if (s && s.holz && s.rho && !holz.some(h => h.s === s))
      holz.push({ s, name: s.name, anteil: s.holz, rho: s.rho, d: s.d / 100, grenze: s.holz * s.d / 100 * s.rho });
  }));
  const mcGrenze = Math.min(G.mcMax, ...holz.map(h => h.grenze));
  const okMc = mc <= mcGrenze, okEv = mev >= mc;
  return { n, sd, x, Sd, R, RT, theta, ps, pi, pe, huelle, g, ebenen, mc, mev, verd, holz, mcGrenze,
           mus: schichten.map(s => s.mu),
           tauwasser: ebenen.length > 0, okMc, okEv, ok: !ebenen.length || (okMc && okEv) };
}

// μ-Wahl nach Tafel 4.29a: bei zwei Werten den, der M_c maximiert – vor dem Taupunkt den
// kleineren, dahinter den größeren. Geprüft wird jede Trennstelle; dieselben μ gelten für
// Tau- und Verdunstungsperiode. schichten[j].muMin/muMax optional (sonst fest s.mu).
function glaserUnguenstig(schichten, richtung, dach) {
  const n = schichten.length;
  const lo = schichten.map(s => s.muMin !== undefined ? s.muMin : s.mu);
  const hi = schichten.map(s => s.muMax !== undefined ? s.muMax : s.mu);
  let best = null;
  for (let t = n; t >= 0; t--) {
    const mit = schichten.map((s, j) => ({ ...s, mu: j < t ? lo[j] : hi[j] }));
    const g = glaser(mit, richtung, dach);
    if (!best || g.mc > best.mc + 1e-12) best = { ...g, trennstelle: t };
  }
  best.bereich = schichten.map((s, j) => lo[j] !== hi[j]);
  return best;
}

// ── Plausibilitätschecks ──────────────────────────────────────
function plausChecks(U, bauteilId, schichtenR) {
  const out = [];
  const bt = BAUTEILE.find(b => b.id === bauteilId);
  const typK = bt ? bt.rminKey : null;
  const typ = typK ? U_TYPISCH[typK] : null;
  if (typ) {
    const ok = U >= typ.min && U <= typ.max;
    out.push({ ok, text:`U = ${fmtU(U)} W/(m²K) – typischer Bereich ${typ.text}: ${fmtU(typ.min)}…${fmtU(typ.max)} W/(m²K)`, hinweis: ok ? 'plausibel' : 'außerhalb – Eingaben prüfen!' });
  }
  if (schichtenR.length) {
    let mx = 0, mi = 0;
    schichtenR.forEach((s,i) => { if (s.R > mx) { mx = s.R; mi = i; } });
    const n = schichtenR[mi].name || 'Schicht '+(mi+1);
    out.push({ ok:true, text:`Größter R: ${n} mit R = ${fmtR(mx)} m²K/W → hier größter Temperaturabfall.`, hinweis:'Prüfmerkmal OK' });
  }
  return out;
}

// ── Übergabe an die Heizlast-App (gemeinsames Format „fh21.bauteile“) ──
// Gleicher localStorage-Schlüssel in beiden Apps; funktioniert nur bei gleicher Herkunft
// (z. B. beide unter maikweeting-tech.github.io). Sonst JSON-Datei.
const FH21_BAUTEILE_KEY = 'fh21.bauteile';
function heizlastBauteil(e, name, artLabel, datumIso) {
  const U = Math.round(e.U * 1000) / 1000;
  const tag = datumIso.slice(0, 10).split('-').reverse().join('.');
  return {
    id: 'ws-' + datumIso.replace(/\D/g, '').slice(0, 14),
    name, art: artLabel, artId: e.bauteilId, U,
    quelle: `Wärmeschutz-App, Bauteil „${name}“, U nach DIN EN ISO 6946 inkl. ΔU (${tag})`,
    datum: datumIso,
    schichten: e.sR.map(s => ({ name: s.name, d: s.d, lambda: s.lambda, R: Math.round(s.R * 1000) / 1000, quelle: s.quelle || '' })),
    // Schichten ohne belegte Quelle (λ aus dem Gedächtnis „ungeprüft“, eigene Eingabe ohne Quelle, Luftschicht-Tabelle)
    ungeprueft: e.sR.filter(s => s.typ === 'luft_ruhend' || !s.quelle || s.quelle === 'ungeprüft')
      .map(s => (s.typ === 'luft_ruhend' ? 'Luftschicht (R aus Tabelle, ungeprüft)' : (s.name || 'Schicht ohne Namen'))),
    RT: Math.round(e.RT * 1000) / 1000, dU: Math.round(e.dU * 1000) / 1000,
    nachweis: nachweisKurz(e)
  };
}
// Kurzfassung der Nachweise für die Vorzeigeseite der Heizlast-App
function nachweisKurz(e) {
  const r3 = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const m = e.minErg, g = e.gmodg, s = e.schimmel, f = e.feuchte;
  return {
    rb: { ti: r3(e.ti), te: r3(e.te), raum: e.raum || '', richtung: e.richtung || '' },
    min: m ? { rmin: r3(m.rmin), Rvorh: r3(m.Rvorh), eta: r3(m.eta), ok: !!m.ok, zeile: String(m.zeile || ''), text: String(m.text || ''), din: String(m.din || ''), geprueft: String(m.geprueft || '') } : null,
    gmodg: g ? { fall: g.fall, Ur: r3(g.Ur), umax: r3(g.umax), ok: !!g.ok, keine: !!g.keineAnforderung,
      nr: g.zeile ? g.zeile.id : '', text: g.zeile ? g.zeile.text : (g.text || ''), zone: g.zone || '' } : null,
    schimmel: s ? { thetaSi: r3(s.thetaSi), thetaMin: r3(s.thetaMin), fRsi: r3(s.fRsi), ok: !!s.ok } : null,
    glaser: !f ? null : f.muFehlt ? { muFehlt: f.muFehlt.map(String) }
      : { tauwasser: !!f.tauwasser, mc: r3(f.mc), mev: r3(f.mev), mcGrenze: r3(f.mcGrenze), okMc: !!f.okMc, okEv: !!f.okEv, ok: !!f.ok, ebenen: (f.ebenen || []).length }
  };
}
// Fenster / Außentür ohne Schichten (U_w nach Herstellerangabe bzw. DIN EN ISO 10077)
function fensterBauteil(name, art, U, quelle, datumIso) {
  return {
    id: 'ws-' + datumIso.replace(/\D/g, '').slice(0, 14),
    name, art: art || 'Fenster', artId: art === 'Außentür' ? 'aussentuer' : 'fenster', U: Math.round(U * 1000) / 1000,
    quelle, datum: datumIso, schichten: [], ungeprueft: [], RT: null, dU: null
  };
}
// Liste ergänzen; gleicher Name ersetzt den alten Eintrag
function bauteilListeErgaenzen(liste, b) {
  return (Array.isArray(liste) ? liste.filter(x => x.name !== b.name) : []).concat([b]);
}
