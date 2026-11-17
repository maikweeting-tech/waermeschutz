'use strict';
/* Wärmeschutz-Rechner – UI-Logik */

// ── Hilfsfunktionen ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
function nr(el) { return parseFloat((typeof el === 'string' ? el : el.value).replace(',','.')); }

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('zeigen');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('zeigen'), 3500);
}

// ── Initialisierung ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Bauteil-Select befüllen
  const sel = $('bauteil');
  BAUTEILE.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.label; sel.appendChild(o); });
  sel.addEventListener('change', () => {
    const bt = BAUTEILE.find(b => b.id === sel.value);
    if (bt) $('richtung').value = bt.richtung;
  });

  // Toggle-Felder
  $('bef-aktiv').addEventListener('change', e => $('bef-felder').hidden = !e.target.checked);
  $('inhom-aktiv').addEventListener('change', e => $('inhom-felder').hidden = !e.target.checked);

  // Schichten-Buttons
  $('btn-add').addEventListener('click', () => addSchicht());
  $('schichten').addEventListener('click', e => {
    if (e.target.closest('.btn-del')) {
      const tr = e.target.closest('tr');
      if ($('schichten').rows.length > 1) { tr.remove(); nummeriere(); }
    }
  });
  $('schichten').addEventListener('change', e => {
    if (e.target.classList.contains('typ-sel')) onTyp(e.target);
    if (e.target.classList.contains('s-stoff')) onStoff(e.target);
  });

  // Berechnen
  $('btn-calc').addEventListener('click', berechnen);

  // 3 Startzeilen
  addSchicht(); addSchicht(); addSchicht();

  // Service Worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

// ── Schichtenverwaltung ───────────────────────────────────────
let _stoffHtml = '';
function stoffOptionen() {
  if (_stoffHtml) return _stoffHtml;
  let h = '<option value="">— Baustoff wählen —</option>';
  BAUSTOFFE.forEach(g => {
    h += `<optgroup label="${esc(g.gruppe)}">`;
    g.stoffe.forEach(s => {
      const lf = (s.lambda < 0.1 ? s.lambda.toFixed(3) : s.lambda.toFixed(2)).replace('.', ',');
      h += `<option value="${esc(s.name)}" data-lambda="${s.lambda}">${esc(s.name)} · λ ${lf}</option>`;
    });
    h += '</optgroup>';
  });
  return (_stoffHtml = h);
}

function onStoff(sel) {
  const tr = sel.closest('tr');
  const name = tr.querySelector('.s-name');
  if (!sel.value) { name.hidden = false; name.value = ''; return; }
  name.hidden = true;
  name.value = sel.value;
  tr.querySelector('.s-lambda').value = sel.selectedOptions[0].dataset.lambda;
  tr.querySelector('.s-quelle').value = 'Schneider 26';
}

function addSchicht() {
  const tb = $('schichten');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="zahl nr-zelle"></td>
    <td><select class="typ-sel"><option value="baustoff">Baustoff</option><option value="luft_ruhend">Luftschicht</option></select></td>
    <td><select class="s-stoff">${stoffOptionen()}</select><input type="text" class="s-name" placeholder="oder eigener Baustoff"></td>
    <td><input type="number" class="s-d" step="any" min="0" placeholder="cm"></td>
    <td><input type="number" class="s-lambda" step="any" min="0" placeholder="W/(mK)"></td>
    <td><input type="text" class="s-quelle" placeholder="Schneider …"></td>
    <td><button type="button" class="btn-del btn-icon no-print" title="Entfernen">&times;</button></td>`;
  tb.appendChild(tr);
  nummeriere();
}

function nummeriere() {
  [...$('schichten').rows].forEach((r, i) => r.querySelector('.nr-zelle').textContent = i + 1);
}

function onTyp(sel) {
  const tr = sel.closest('tr');
  const lam = tr.querySelector('.s-lambda');
  const stoff = tr.querySelector('.s-stoff');
  const name = tr.querySelector('.s-name');
  if (sel.value === 'luft_ruhend') {
    lam.disabled = true; lam.value = ''; lam.placeholder = '(Tabelle)';
    stoff.hidden = true; stoff.value = '';
    name.hidden = false; name.value = 'ruhende Luftschicht';
  } else {
    lam.disabled = false; lam.placeholder = 'W/(mK)';
    stoff.hidden = false;
    if (name.value === 'ruhende Luftschicht') name.value = '';
  }
}

// ── Eingaben lesen ────────────────────────────────────────────
function leseSchichten() {
  return [...$('schichten').rows].map(r => {
    const typ = r.querySelector('.typ-sel').value;
    const name = r.querySelector('.s-name').value.trim();
    const d = nr(r.querySelector('.s-d'));
    const lambda = nr(r.querySelector('.s-lambda'));
    const quelle = r.querySelector('.s-quelle').value.trim();
    return { typ, name, d, lambda, quelle };
  }).filter(s => !isNaN(s.d) && s.d > 0 && (s.typ !== 'baustoff' || (!isNaN(s.lambda) && s.lambda > 0)));
}

function leseInhom() {
  if (!$('inhom-aktiv').checked) return null;
  return {
    schichtNr: parseInt($('inhom-nr').value) || 0,
    materialB: $('inhom-name').value.trim(),
    lambdaB: nr($('inhom-lambda')),
    fa: nr($('inhom-fa')),
    fb: nr($('inhom-fb'))
  };
}

function leseBef() {
  if (!$('bef-aktiv').checked) return null;
  return {
    nf: nr($('bef-nf')),
    durchmesser: nr($('bef-dm')),
    lambdaF: nr($('bef-lambda')),
    volleDurchdringung: $('bef-voll').checked,
    daemmNr: parseInt($('bef-schicht').value) || 1
  };
}

// ── Hauptberechnung ───────────────────────────────────────────
function berechnen() {
  const bauteilId = $('bauteil').value;
  const raum = $('raum').value;
  const richtung = $('richtung').value;
  const ti = nr($('theta-i'));
  const te = nr($('theta-e'));
  const din = $('din-ausgabe').value;
  const luSt = parseInt($('lu-stufe').value);
  const luNr = parseInt($('lu-schicht').value) || 0;
  const dUr = nr($('delta-ur')) || 0;

  const schichten = leseSchichten();
  if (!schichten.length) { toast('Mindestens eine Schicht mit d und λ eingeben.'); return; }
  if (isNaN(ti) || isNaN(te)) { toast('θ_i und θ_e eingeben.'); return; }

  const { rsi, rse } = RSI_RSE[richtung];
  const sR = schichten.map(s => ({ ...s, R: schichtR(s, richtung) }));

  // Inhomogene Schicht?
  const inh = leseInhom();
  let RT, inhomErg = null;
  if (inh && inh.schichtNr > 0 && !isNaN(inh.lambdaB) && inh.lambdaB > 0 && !isNaN(inh.fa) && !isNaN(inh.fb)) {
    inhomErg = inhomogenRT(schichten, rsi, rse, richtung, inh);
    if (inhomErg) {
      RT = inhomErg.RT;
      const idx = inh.schichtNr - 1;
      if (idx >= 0 && idx < sR.length) {
        sR[idx].R = inhomErg.RjEq;
        sR[idx].nameB = inh.materialB;
        sR[idx].inhomogen = true;
      }
    }
  }
  if (!RT) {
    RT = rsi + sR.reduce((a, s) => a + s.R, 0) + rse;
  }

  const U0 = 1 / RT;
  const dg = deltaUg(luSt, schichten, RT, richtung, luNr);
  const df = deltaUf(leseBef(), schichten, richtung);
  const dU = dg.wert + df.wert + dUr;
  const U = U0 + dU;

  const Rvorh = RT - rsi - rse;
  const temp = temperaturverlauf(sR, rsi, rse, RT, ti, te);
  const minErg = pruefeMin(bauteilId, raum, Rvorh, din);
  const plaus = plausChecks(U, bauteilId, sR);

  zeigeErgebnis({ sR, rsi, rse, RT, U0, dg, df, dUr, dU, U, Rvorh, temp, minErg, plaus, ti, te, richtung, bauteilId, raum, din, inhomErg });
}

// ── Ergebnisanzeige ───────────────────────────────────────────
function zeigeErgebnis(e) {
  const c = $('ergebnis');
  c.hidden = false;
  c.innerHTML =
    htmlKopf(e) +
    htmlSchichttabelle(e) +
    htmlRechenweg(e) +
    htmlTemperatur(e) +
    htmlNachweis(e) +
    htmlPlaus(e) +
    htmlZusammenfassung(e);
  c.scrollIntoView({ behavior: 'smooth' });
}

// 0 – Bauteilkopf
function htmlKopf(e) {
  const bt = BAUTEILE.find(b => b.id === e.bauteilId);
  const rl = RICHTUNG_LABEL[e.richtung] || e.richtung;
  return `<div class="karte" style="border-left:4px solid var(--rost)">
    <p class="erg-titel">Bauteil</p>
    <p><strong>${esc(bt ? bt.label : e.bauteilId)}</strong>, Wärmestrom ${rl},
       θ<sub>i</sub> = ${fmtT(e.ti)} °C, θ<sub>e</sub> = ${fmtT(e.te)} °C,
       R<sub>si</sub> = ${fmtR(e.rsi)}, R<sub>se</sub> = ${fmtR(e.rse)} m²K/W</p>
  </div>`;
}

// 1 – Schichttabelle
function htmlSchichttabelle(e) {
  let rows = '';
  e.sR.forEach((s, i) => {
    const dM = fmtR(s.d / 100);
    const lam = s.typ === 'luft_ruhend' ? '—' : fmtR(s.lambda);
    const name = s.inhomogen ? `${esc(s.name)} / ${esc(s.nameB)} (äquiv.)` : esc(s.name);
    rows += `<tr><td class="zahl">${i+1}</td><td>${name}</td><td class="zahl mono">${dM}</td><td class="zahl mono">${lam}</td><td class="zahl mono">${fmtR(s.R)}</td><td class="klein">${esc(s.quelle)}</td></tr>`;
  });
  return `<div class="karte">
    <p class="erg-titel">1 – Schichttabelle</p>
    <div class="tabwrap"><table class="tab">
      <thead><tr><th class="zahl">Nr.</th><th>Baustoff</th><th class="zahl">d [m]</th><th class="zahl">λ [W/(mK)]</th><th class="zahl">R [m²K/W]</th><th>Quelle λ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// 2 – Rechenweg U
function htmlRechenweg(e) {
  let rw = '<div class="rechenweg">';

  // Schritt 1: R je Schicht
  rw += '<div style="margin-bottom:8px"><strong>Schritt 1 – R je Schicht</strong></div>';
  e.sR.forEach((s, i) => {
    if (s.typ === 'luft_ruhend') {
      rw += `R<sub>${i+1}</sub> = ${fmtR(s.R)} m²K/W (Luftschicht, Tabelle)\n`;
    } else if (s.inhomogen) {
      rw += `R<sub>${i+1,eq}</sub> = ${fmtR(s.R)} m²K/W (äquivalent, inhomogen)\n`;
    } else {
      rw += `R<sub>${i+1}</sub> = d/λ = ${fmtR(s.d/100)} / ${fmtR(s.lambda)} = ${fmtR(s.R)} m²K/W\n`;
    }
  });

  // Inhomogene Berechnung
  if (e.inhomErg) {
    const h = e.inhomErg;
    rw += `\n<div style="margin:8px 0"><strong>Inhomogene Schicht (Ober-/Untergrenze)</strong></div>`;
    rw += `R'<sub>T</sub> (oberer Grenzwert)  = ${fmtR(h.RTOben)} m²K/W\n`;
    rw += `R''<sub>T</sub> (unterer Grenzwert) = ${fmtR(h.RTUnten)} m²K/W\n`;
    rw += `R<sub>T</sub> = (R'<sub>T</sub> + R''<sub>T</sub>) / 2 = (${fmtR(h.RTOben)} + ${fmtR(h.RTUnten)}) / 2 = <span class="erg">${fmtR(h.RT)} m²K/W</span>\n`;
    rw += `Verhältnis R'<sub>T</sub>/R''<sub>T</sub> = ${fmtEta(h.verh)}`;
    rw += h.gueltig ? ' ≤ 1,5 ✓\n' : ' <strong style="color:var(--rot)"> > 1,5 – Verfahren ggf. ungenau!</strong>\n';
  }

  // Schritt 2: R_T
  const sumR = e.sR.reduce((a, s) => a + s.R, 0);
  rw += `\n<div style="margin:8px 0"><strong>Schritt 2 – R<sub>T</sub></strong></div>`;
  if (!e.inhomErg) {
    rw += `R<sub>T</sub> = R<sub>si</sub> + ΣR<sub>i</sub> + R<sub>se</sub>\n`;
    rw += `R<sub>T</sub> = ${fmtR(e.rsi)} + ${fmtR(sumR)} + ${fmtR(e.rse)} = <span class="erg">${fmtR(e.RT)} m²K/W</span>\n`;
  } else {
    rw += `R<sub>T</sub> = ${fmtR(e.RT)} m²K/W (aus Ober-/Untergrenze, s. o.)\n`;
  }

  // Schritt 3: U₀
  rw += `\n<div style="margin:8px 0"><strong>Schritt 3 – U<sub>0</sub> (ohne Korrektur)</strong></div>`;
  rw += `U<sub>0</sub> = 1 / R<sub>T</sub> = 1 / ${fmtR(e.RT)} = <span class="erg">${fmtU(e.U0)} W/(m²K)</span>\n`;

  // Schritt 4: Korrekturwerte
  rw += `\n<div style="margin:8px 0"><strong>Schritt 4 – Korrekturwerte ΔU</strong></div>`;
  rw += e.dg.text + '\n';
  rw += e.df.text + '\n';
  rw += `ΔU<sub>r</sub> = ${fmtDU(e.dUr)} W/(m²K)\n`;
  rw += `ΔU = ΔU<sub>g</sub> + ΔU<sub>f</sub> + ΔU<sub>r</sub> = ${fmtDU(e.dg.wert)} + ${fmtDU(e.df.wert)} + ${fmtDU(e.dUr)} = <span class="erg">${fmtDU(e.dU)} W/(m²K)</span>\n`;

  // Schritt 5: U korrigiert
  rw += `\n<div style="margin:8px 0"><strong>Schritt 5 – U korrigiert</strong></div>`;
  rw += `U = U<sub>0</sub> + ΔU = ${fmtU(e.U0)} + ${fmtDU(e.dU)} = <span class="erg">${fmtU(e.U)} W/(m²K)</span>\n`;

  rw += '</div>';

  // Großes Ergebnis
  rw += `<div class="ergebnis-gross">${fmtU(e.U)} <small>W/(m²K)</small></div>`;
  return `<div class="karte"><p class="erg-titel">2 – Rechenweg U-Wert</p>${rw}</div>`;
}

// 3 – Temperaturtabelle
function htmlTemperatur(e) {
  const q = e.temp.q;
  let rows = '';
  e.temp.punkte.forEach(p => {
    const cls = p.kontrolle ? ' class="kontrolle"' : '';
    rows += `<tr${cls}><td>${esc(p.stelle)}</td><td class="zahl mono">${fmtR(p.sR)}</td><td class="zahl mono">${fmtT(p.theta)}</td></tr>`;
  });
  return `<div class="karte">
    <p class="erg-titel">3 – Temperaturverlauf</p>
    <p>Wärmestromdichte q = (θ<sub>i</sub> − θ<sub>e</sub>) / R<sub>T</sub> = (${fmtT(e.ti)} − (${fmtT(e.te)})) / ${fmtR(e.RT)} = <strong>${fmtQ(q)} W/m²</strong></p>
    <div class="tabwrap"><table class="tab">
      <thead><tr><th>Stelle</th><th class="zahl">ΣR [m²K/W]</th><th class="zahl">θ [°C]</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// 4 – Nachweistabelle Mindestwärmeschutz
function htmlNachweis(e) {
  if (!e.minErg) return `<div class="karte"><p class="erg-titel">4 – Mindestwärmeschutz</p><p class="hinweis">Kein R<sub>min</sub>-Wert für diesen Bauteiltyp hinterlegt.</p></div>`;

  const m = e.minErg;
  const cls = m.ok ? 'ok' : 'nok';
  const sym = m.ok ? '✓' : '✗';

  return `<div class="karte">
    <p class="erg-titel">4 – Mindestwärmeschutz nach DIN 4108-2:${esc(m.din)}</p>
    <div class="tabwrap"><table class="tab">
      <thead><tr><th>Nachweis</th><th class="zahl">E<sub>d</sub> (R<sub>min</sub>)</th><th class="zahl">R<sub>d</sub> (R<sub>vorh</sub>)</th><th class="zahl">η</th><th>erfüllt</th></tr></thead>
      <tbody><tr>
        <td>${esc(m.text)}<br><span class="klein hinweis">Zeile ${esc(m.zeile)}</span></td>
        <td class="zahl mono">${fmtR(m.rmin)}</td>
        <td class="zahl mono">${fmtR(m.Rvorh)}</td>
        <td class="zahl mono">${fmtEta(m.eta)}</td>
        <td><span class="badge ${cls}">${sym}</span></td>
      </tr></tbody>
    </table></div>
    <div class="ampel ${cls}" style="margin-top:12px">
      <div class="licht">${sym}</div>
      <div>Mindestwärmeschutz ${m.ok ? 'erfüllt' : 'NICHT erfüllt'}<br>
        <small>R<sub>vorh</sub> = ${fmtR(m.Rvorh)} ${m.ok ? '≥' : '<'} R<sub>min</sub> = ${fmtR(m.rmin)} m²K/W, η = ${fmtEta(m.eta)} ${m.ok ? '≤' : '>'} 1,0</small>
      </div>
    </div>
    <p class="pruefen" style="margin-top:8px">R<sub>min</sub>-Wert aus dem Gedächtnis – gegen DIN 4108-2:${esc(m.din)}, Tabelle 3 prüfen!</p>
  </div>`;
}

// 5 – Plausibilitätscheck
function htmlPlaus(e) {
  let items = '';
  e.plaus.forEach(p => {
    items += `<div class="check-item"><div class="check-dot ${p.ok ? 'ok' : 'warn'}"></div><div>${esc(p.text)}<br><span class="klein hinweis">${esc(p.hinweis)}</span></div></div>`;
  });
  return `<div class="karte"><p class="erg-titel">5 – Plausibilitätscheck</p>${items}</div>`;
}

// 6 – Zusammenfassung
function htmlZusammenfassung(e) {
  const bt = BAUTEILE.find(b => b.id === e.bauteilId);
  const minOk = e.minErg ? (e.minErg.ok ? 'erfüllt' : 'NICHT erfüllt') : 'nicht geprüft';
  return `<div class="karte" style="border-left:4px solid var(--gruen)">
    <p class="erg-titel">Zusammenfassung</p>
    <p>Das Bauteil <strong>${esc(bt ? bt.label : '')}</strong> erreicht einen Wärmedurchgangskoeffizienten von
       <strong>U = ${fmtU(e.U)} W/(m²K)</strong>.
       Der winterliche Mindestwärmeschutz nach DIN 4108-2 ist <strong>${minOk}</strong>.</p>
    <div class="hinweis-box">
      <strong>Annahmen und offene Punkte:</strong>
      <ul style="margin:4px 0 0;padding-left:1.2em">
        <li>R<sub>si</sub> / R<sub>se</sub> nach DIN EN ISO 6946 für Wärmeschutz (nicht Feuchteschutz)</li>
        <li>θ<sub>i</sub> = ${fmtT(e.ti)} °C, θ<sub>e</sub> = ${fmtT(e.te)} °C</li>
        ${e.dU > 0 ? `<li>Korrekturwerte ΔU = ${fmtDU(e.dU)} W/(m²K) berücksichtigt</li>` : ''}
        <li>Tabellenwerte aus Schneider Bautabellen, 26. Auflage (soweit Quelle angegeben)</li>
        <li>Mit <span class="pruefen" style="display:inline">G</span> gekennzeichnete Normwerte gegen das Original prüfen</li>
      </ul>
      <p style="margin:10px 0 0"><strong>Hinweis:</strong> Diese Berechnung ersetzt keinen Nachweis durch einen Fachplaner.</p>
    </div>
  </div>`;
}
