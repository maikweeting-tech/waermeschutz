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
  if (s.d <= 0 || s.lambda <= 0) return 0;
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

// ── ΔU_f (Befestigungselemente) ───────────────────────────────
function deltaUf(bef, schichten, richtung) {
  if (!bef || !bef.nf || !bef.durchmesser || !bef.lambdaF) return { wert:0, text:'ΔU_f = 0 (keine Befestigungselemente)' };
  const idx = (bef.daemmNr || 1) - 1;
  const dD = idx >= 0 && idx < schichten.length ? schichten[idx].d / 100 : 0;
  if (dD <= 0) return { wert:0, text:'ΔU_f = 0 (Dämmdicke ≤ 0)' };

  const alpha = ALPHA_BEF;
  const Af = Math.PI / 4 * Math.pow(bef.durchmesser / 1000, 2);
  const wert = alpha * bef.lambdaF * bef.nf * Af / dD;
  return {
    wert,
    text: `ΔU_f = α × λ_f × n_f × A_f / d₁\n     = ${fmtR(alpha)} × ${fmtR(bef.lambdaF)} × ${fmtR(bef.nf)} × ${fmtDU(Af)} / ${fmtR(dD)}\n     = ${fmtDU(wert)} W/(m²K)`
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
  return { rmin:ref.rmin, Rvorh, eta, ok: Rvorh >= ref.rmin, text:ref.text, zeile:ref.zeile, din };
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

// ── Schimmelnachweis f_Rsi (Norm-Randbedingungen, R_si = 0,25) ─
function pruefeSchimmel(R) {
  const S = SCHIMMEL;
  const RT = S.rsi + R + S.rse;
  const fRsi = 1 - S.rsi / RT;
  const thetaSi = S.te + fRsi * (S.ti - S.te);
  return { ...S, R, RT, fRsi, thetaSi, ok: fRsi >= S.fmin };
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

  // Verdunstungsperiode (Tauwasserzone von erster bis letzter Ebene)
  let verd = null, mev = 0;
  if (ebenen.length) {
    const V = G.verd;
    const thetaV = temp(V.ti, dach ? V.teDach : V.te);
    const piV = V.phiI * psat(V.ti), peV = V.phiE * psat(V.te);
    const a = ebenen[0], b = ebenen[ebenen.length-1];
    const pcA = psat(thetaV[a.k]), pcB = psat(thetaV[b.k]);
    const gI = Math.max(0, G.delta0 * (pcA - piV) / a.x);
    const gE = Math.max(0, G.delta0 * (pcB - peV) / (Sd - b.x));
    mev = (gI + gE) * sek(V.stunden);
    verd = { thetaA: thetaV[a.k], thetaB: thetaV[b.k], pcA, pcB, piV, peV, gI, gE, xA: a.x, xB: b.x, dach };
  }

  const okMc = mc <= G.mcMax, okEv = mev >= mc;
  return { n, sd, x, Sd, R, RT, theta, ps, pi, pe, huelle, g, ebenen, mc, mev, verd,
           tauwasser: ebenen.length > 0, okMc, okEv, ok: !ebenen.length || (okMc && okEv) };
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
