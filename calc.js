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

  for (let i = 0; i < schichtenR.length; i++) {
    sR += schichtenR[i].R;
    p.push({ stelle:'nach ' + (schichtenR[i].name || 'Schicht '+(i+1)), sR, theta: ti - q*sR });
  }

  sR += rse;
  p.push({ stelle:'Äußere Oberfläche θ_se', sR, theta: ti - q*sR });
  p.push({ stelle:'Kontrolle θ_e',          sR: RT, theta: te, kontrolle:true });

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
