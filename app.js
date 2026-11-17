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
  $('ergebnis').addEventListener('click', e => {
    const b = e.target.closest('[data-massstab]');
    if (b) setzeMassstab(b.dataset.massstab);
    const g = e.target.closest('[data-glaser]');
    if (g) setzeGlaserMassstab(g.dataset.glaser);
  });

  // Aufgabe: Beispiele, Link, Drucken
  BEISPIELE.forEach((b, i) => { const o = document.createElement('option'); o.value = i; o.textContent = b.titel; $('beispiel').appendChild(o); });
  $('beispiel').addEventListener('change', e => {
    if (e.target.value === '') return;
    ladeZustand(beispielZustand(BEISPIELE[e.target.value]));
    berechnen();
    e.target.value = '';
  });
  $('btn-link').addEventListener('click', kopiereLink);
  $('btn-druck').addEventListener('click', () => { if ($('ergebnis').hidden) berechnen(); window.print(); });

  // Startzustand: aus Link oder 3 leere Zeilen
  const z = leseLink();
  if (z) { ladeZustand(z); berechnen(); }
  else { addSchicht(); addSchicht(); addSchicht(); }
  window.addEventListener('hashchange', () => { const z = leseLink(); if (z) { ladeZustand(z); berechnen(); } });

  // Service Worker
  if ('serviceWorker' in navigator) {
    const hatteSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hatteSW) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
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
      h += `<option value="${esc(s.name)}" data-lambda="${s.lambda}" data-mu="${s.mu}" data-d="${s.d || ''}">${esc(s.name)} · λ ${lf} · μ ${s.mu.toLocaleString('de-DE')}</option>`;
    });
    h += '</optgroup>';
  });
  return (_stoffHtml = h);
}

function onStoff(sel) {
  const tr = sel.closest('tr');
  const name = tr.querySelector('.s-name');
  if (!sel.value) { name.hidden = false; name.value = ''; return; }
  const o = sel.selectedOptions[0].dataset;
  name.hidden = true;
  name.value = sel.value;
  tr.querySelector('.s-lambda').value = o.lambda;
  tr.querySelector('.s-mu').value = o.mu;
  if (o.d) tr.querySelector('.s-d').value = o.d;
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
    <td><input type="number" class="s-mu" step="any" min="0" placeholder="–"></td>
    <td><input type="text" class="s-quelle" placeholder="Schneider …"></td>
    <td><button type="button" class="btn-del btn-icon no-print" title="Entfernen">&times;</button></td>`;
  tb.appendChild(tr);
  nummeriere();
  return tr;
}

// ── Zustand speichern / laden (Beispiele, Teilen-Link) ────────
const FELDER = ['bauteil','raum','richtung','theta-i','theta-e','din-ausgabe','lu-stufe','lu-schicht',
  'bef-aktiv','bef-nf','bef-dm','bef-lambda','bef-voll','bef-schicht','delta-ur',
  'inhom-aktiv','inhom-nr','inhom-name','inhom-lambda','inhom-fa','inhom-fb'];
const STANDARD = { raum:'normal', 'theta-i':'20', 'theta-e':'-5', 'din-ausgabe':'2013-02', 'lu-stufe':'0', 'lu-schicht':'',
  'bef-aktiv':false, 'bef-nf':'', 'bef-dm':'', 'bef-lambda':'', 'bef-voll':true, 'bef-schicht':'', 'delta-ur':'0',
  'inhom-aktiv':false, 'inhom-nr':'', 'inhom-name':'', 'inhom-lambda':'', 'inhom-fa':'', 'inhom-fb':'' };

function zustand() {
  const f = {};
  FELDER.forEach(id => { const el = $(id); f[id] = el.type === 'checkbox' ? el.checked : el.value; });
  const s = [...$('schichten').rows].map(r => ['.typ-sel','.s-stoff','.s-name','.s-d','.s-lambda','.s-quelle','.s-mu'].map(k => r.querySelector(k).value));
  return { f, s };
}

function ladeZustand(z) {
  FELDER.forEach(id => {
    if (!(id in z.f)) return;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!z.f[id]; else el.value = z.f[id];
  });
  $('bef-felder').hidden = !$('bef-aktiv').checked;
  $('inhom-felder').hidden = !$('inhom-aktiv').checked;
  $('det-korr').open = $('lu-stufe').value !== '0' || $('bef-aktiv').checked || (nr($('delta-ur')) || 0) !== 0;
  $('det-inhom').open = $('inhom-aktiv').checked;
  $('schichten').innerHTML = '';
  z.s.forEach(([typ, stoff, name, d, lam, quelle, mu]) => {
    const tr = addSchicht();
    const ts = tr.querySelector('.typ-sel');
    ts.value = typ === 'luft_ruhend' ? 'luft_ruhend' : 'baustoff';
    onTyp(ts);
    const ss = tr.querySelector('.s-stoff');
    ss.value = stoff || '';
    if (ss.value !== (stoff || '')) ss.value = '';
    tr.querySelector('.s-name').hidden = !!ss.value;
    tr.querySelector('.s-name').value = ss.value || name || '';
    tr.querySelector('.s-d').value = d;
    if (ts.value === 'baustoff') tr.querySelector('.s-lambda').value = lam;
    tr.querySelector('.s-quelle').value = quelle || '';
    if (mu !== undefined) tr.querySelector('.s-mu').value = mu;
  });
  if (!z.s.length) addSchicht();
}

function beispielZustand(b) {
  const bt = BAUTEILE.find(x => x.id === b.f.bauteil);
  const f = { ...STANDARD, richtung: bt ? bt.richtung : 'horizontal', ...b.f };
  const s = b.s.map(([typ, stoff, name, d]) => {
    const st = BAUSTOFFE.flatMap(g => g.stoffe).find(x => x.name === stoff);
    return [typ, stoff, name, String(d), st ? String(st.lambda) : '', st ? 'Schneider 26' : '', st ? String(st.mu) : (typ === 'luft_ruhend' ? '1' : '')];
  });
  return { f, s };
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function vonB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function leseLink() {
  const m = location.hash.match(/^#a=([\w-]+)$/);
  if (!m) return null;
  try {
    const z = JSON.parse(vonB64url(m[1]));
    return z && z.f && Array.isArray(z.s) ? z : null;
  } catch { toast('Link konnte nicht gelesen werden.'); return null; }
}

function kopiereLink() {
  const url = location.origin + location.pathname + '#a=' + b64url(JSON.stringify(zustand()));
  history.replaceState(null, '', url);
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
    .then(() => toast('Link kopiert – enthält alle Eingaben.'))
    .catch(() => window.prompt('Link kopieren:', url));
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
    tr.querySelector('.s-mu').value = '1';
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
    const mu = nr(r.querySelector('.s-mu'));
    return { typ, name, d, lambda, quelle, mu };
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
        // aus R_T rückgerechnet, damit Temperaturverlauf und R_T zusammenpassen
        sR[idx].R = inhomErg.RT - rsi - rse - inhomErg.RHom;
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
  const schimmel = pruefeSchimmel(Rvorh);
  const plaus = plausChecks(U, bauteilId, sR);
  const bt = BAUTEILE.find(b => b.id === bauteilId);
  const muFehlt = schichten.filter(s => !(s.mu > 0)).map(s => s.name || '?');
  const feuchte = muFehlt.length ? { muFehlt } : { ...glaser(schichten, richtung, bt && bt.rminKey === 'dach'), schichten };

  zeigeErgebnis({ sR, rsi, rse, RT, U0, dg, df, dUr, dU, U, Rvorh, temp, minErg, schimmel, feuchte, plaus, ti, te, richtung, bauteilId, raum, din, inhomErg });
}

// ── Ergebnisanzeige ───────────────────────────────────────────
let _erg = null, _massstab = 'd';
function zeigeErgebnis(e) {
  _erg = e;
  const c = $('ergebnis');
  c.hidden = false;
  c.innerHTML =
    htmlKopf(e) +
    htmlSchichttabelle(e) +
    htmlRechenweg(e) +
    htmlTemperatur(e) +
    htmlNachweis(e) +
    htmlSchimmel(e) +
    htmlGlaser(e) +
    htmlPlaus(e) +
    htmlZusammenfassung(e);
  c.scrollIntoView({ behavior: 'smooth' });
}

// ── Grafik Temperaturverlauf (SVG) ────────────────────────────
const GRUPPE_FARBE = {
  'Dämmstoffe': '#f2c94c', 'Mauerwerk': '#c0573e', 'Beton': '#9aa0a6', 'Holz / Holzwerkstoffe': '#b07d48',
  'Putze / Mörtel / Estriche': '#e3d7c1', 'Platten / Bekleidungen': '#d0d0d0', 'Folien / Bahnen': '#6f6fb8'
};
function schichtFarbe(s) {
  if (s.typ === 'luft_ruhend') return '#bfe3f5';
  const g = BAUSTOFFE.find(g => g.stoffe.some(x => x.name === s.name));
  return g ? GRUPPE_FARBE[g.gruppe] : '#cfc6b8';
}

function grafikSVG(e, massstab) {
  const W = 640, H = 340, x0 = 58, x1 = 610, y0 = 26, y1 = 280;
  const P = e.temp.punkte, n = e.sR.length;
  const sRges = P[P.length-1].sR;
  let xs;
  if (massstab === 'R') {
    xs = P.map(p => x0 + p.sR / sRges * (x1 - x0));
  } else {
    const luft = 44, breite = x1 - x0 - 2*luft, minB = 14;
    const dGes = e.sR.reduce((a, s) => a + s.d, 0);
    let b = e.sR.map(s => Math.max(minB, s.d / dGes * breite));
    const k = breite / b.reduce((a, v) => a + v, 0);
    b = b.map(v => v * k);
    xs = [x0, x0 + luft];
    b.forEach(v => xs.push(xs[xs.length-1] + v));
    xs.push(x1);
  }
  const th = P.map(p => p.theta);
  const tMax = Math.ceil((Math.max(...th, e.ti) + 1) / 5) * 5, tMin = Math.floor((Math.min(...th, e.te) - 1) / 5) * 5;
  const y = t => y0 + (tMax - t) / ((tMax - tMin) || 1) * (y1 - y0);
  const f1 = v => v.toFixed(1);

  let s = `<svg class="grafik" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperaturverlauf im Bauteil">`;
  // Luftbereiche innen/außen
  s += `<rect x="${x0}" y="${y0}" width="${f1(xs[1]-x0)}" height="${y1-y0}" class="g-luft-i"/>`;
  s += `<rect x="${f1(xs[n+1])}" y="${y0}" width="${f1(x1-xs[n+1])}" height="${y1-y0}" class="g-luft-a"/>`;
  // Schichten
  e.sR.forEach((sch, i) => {
    const xa = xs[i+1], xb = xs[i+2];
    s += `<rect x="${f1(xa)}" y="${y0}" width="${f1(xb-xa)}" height="${y1-y0}" fill="${schichtFarbe(sch)}" fill-opacity=".55" class="g-schicht"><title>${esc(sch.name || 'Schicht '+(i+1))}: d = ${fmtR(sch.d/100)} m, R = ${fmtR(sch.R)} m²K/W</title></rect>`;
    if (xb - xa >= 9) s += `<text x="${f1((xa+xb)/2)}" y="${y1+16}" class="g-nr">${i+1}</text>`;
  });
  // Achse und Raster
  for (let t = tMin; t <= tMax; t += 5) {
    s += `<line x1="${x0}" x2="${x1}" y1="${f1(y(t))}" y2="${f1(y(t))}" class="${t === 0 ? 'g-null' : 'g-raster'}"/>`;
    s += `<text x="${x0-6}" y="${f1(y(t)+4)}" class="g-achse">${t}</text>`;
  }
  s += `<text x="${x0}" y="${y0-10}" class="g-achse" text-anchor="start" style="text-anchor:start">θ [°C]</text>`;
  s += `<text x="${x0}" y="${y1+31}" class="g-seite" style="text-anchor:start">← innen</text>`;
  s += `<text x="${x1}" y="${y1+31}" class="g-seite" style="text-anchor:end">außen →</text>`;
  // Temperaturlinie
  s += `<polyline points="${xs.map((x, i) => f1(x) + ',' + f1(y(th[i]))).join(' ')}" class="g-linie"/>`;
  let letztX = -99;
  const xEnde = xs[xs.length-1];
  xs.forEach((x, i) => {
    s += `<circle cx="${f1(x)}" cy="${f1(y(th[i]))}" r="3.5" class="g-punkt"/>`;
    if (i === xs.length-1 || (x - letztX >= 34 && xEnde - x >= 34)) {
      const oben = i % 2 === 0 ? -9 : 17;
      s += `<text x="${f1(x)}" y="${f1(y(th[i]) + oben)}" class="g-wert">${fmtT(th[i])}</text>`;
      letztX = x;
    }
  });
  s += `<text x="${(x0+x1)/2}" y="${H-6}" class="g-seite">Maßstab: ${massstab === 'R' ? 'Wärmedurchlasswiderstand R (Temperaturlinie wird zur Geraden)' : 'Schichtdicke d (Luftbereiche schematisch)'}</text>`;
  return s + '</svg>';
}

function setzeMassstab(m) {
  _massstab = m;
  $('grafik-box').innerHTML = grafikSVG(_erg, m);
  document.querySelectorAll('[data-massstab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.massstab === m));
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
      rw += `R<sub>${i+1},eq</sub> = R<sub>T</sub> − R<sub>si</sub> − R<sub>se</sub> − ΣR<sub>übrige</sub> = ${fmtR(s.R)} m²K/W (inhomogen, aus R<sub>T</sub> unten rückgerechnet)\n`;
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
    <div class="massstab no-print" role="group" aria-label="Maßstab der Grafik">
      <button type="button" class="btn btn-klein" data-massstab="d" aria-pressed="${_massstab === 'd'}">Maßstab Dicke d</button>
      <button type="button" class="btn btn-klein" data-massstab="R" aria-pressed="${_massstab === 'R'}">Maßstab R</button>
    </div>
    <div id="grafik-box">${grafikSVG(e, _massstab)}</div>
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

// 5 – Schimmelnachweis f_Rsi
function htmlSchimmel(e) {
  const m = e.schimmel;
  const cls = m.ok ? 'ok' : 'nok', sym = m.ok ? '✓' : '✗';
  const rw = `R'<sub>T</sub> = R<sub>si</sub> + R + R<sub>se</sub> = ${fmtR(m.rsi)} + ${fmtR(m.R)} + ${fmtR(m.rse)} = ${fmtR(m.RT)} m²K/W
f<sub>Rsi</sub> = 1 − R<sub>si</sub> / R'<sub>T</sub> = 1 − ${fmtR(m.rsi)} / ${fmtR(m.RT)} = <span class="erg">${fmtR(m.fRsi)}</span> ${m.ok ? '≥' : '<'} ${fmtEta(m.fmin)}
θ<sub>si</sub> = θ<sub>e</sub> + f<sub>Rsi</sub> · (θ<sub>i</sub> − θ<sub>e</sub>) = ${fmtT(m.te)} + ${fmtR(m.fRsi)} · (${fmtT(m.ti)} − (${fmtT(m.te)})) = <span class="erg">${fmtT(m.thetaSi)} °C</span> ${m.thetaSi >= m.thetaMin ? '≥' : '<'} ${fmtT(m.thetaMin)} °C`;
  return `<div class="karte">
    <p class="erg-titel">5 – Schimmelnachweis (Temperaturfaktor f<sub>Rsi</sub>)</p>
    <p class="hinweis">Norm-Randbedingungen nach DIN 4108-2: θ<sub>i</sub> = ${fmtT(m.ti)} °C, φ<sub>i</sub> = ${m.phi} %, θ<sub>e</sub> = ${fmtT(m.te)} °C, erhöhter R<sub>si</sub> = ${fmtR(m.rsi)} m²K/W. Unabhängig von θ<sub>i</sub>/θ<sub>e</sub> oben.</p>
    <div class="rechenweg">${rw}</div>
    <div class="ampel ${cls}" style="margin-top:12px">
      <div class="licht">${sym}</div>
      <div>Schimmelfreiheit in der Fläche ${m.ok ? 'gegeben' : 'NICHT gegeben'}<br>
        <small>f<sub>Rsi</sub> = ${fmtR(m.fRsi)} ${m.ok ? '≥' : '<'} 0,70</small></div>
    </div>
    <p class="hinweis klein" style="margin-top:8px">Gilt für die ungestörte Fläche. Maßgebend sind meist Wärmebrücken (Ecken, Anschlüsse) – dort f<sub>Rsi</sub> gesondert nachweisen.</p>
    <p class="pruefen">Randbedingungen aus dem Gedächtnis – gegen DIN 4108-2, Abschnitt 6.2 prüfen!</p>
  </div>`;
}

// 6 – Plausibilitätscheck
function htmlPlaus(e) {
  let items = '';
  e.plaus.forEach(p => {
    items += `<div class="check-item"><div class="check-dot ${p.ok ? 'ok' : 'warn'}"></div><div>${esc(p.text)}<br><span class="klein hinweis">${esc(p.hinweis)}</span></div></div>`;
  });
  return `<div class="karte"><p class="erg-titel">7 – Plausibilitätscheck</p>${items}</div>`;
}

// 6 – Feuchteschutz: Glaser-Verfahren
const fmtP = v => Math.round(v).toLocaleString('de-DE');
const fmtM = v => v > 0 && v < 0.0005 ? '< 0,001' : v.toFixed(3).replace('.', ',');
const fmtSd = v => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace('.', ',');
const fmtG = v => (v * 3600 * 1000).toFixed(3).replace('.', ',');   // kg/(m²s) → g/(m²h)

function htmlGlaser(e) {
  const F = e.feuchte, G = GLASER, T = G.tau, V = G.verd;
  const titel = '<p class="erg-titel">6 – Feuchteschutz: Tauwasser im Bauteil (Glaser-Verfahren, DIN 4108-3)</p>';
  if (F.muFehlt) return `<div class="karte">${titel}<p class="hinweis">Für den Tauwassernachweis fehlt μ bei: ${F.muFehlt.map(esc).join(', ')}.</p></div>`;

  const name = k => esc(F.schichten[k].name || 'Schicht ' + (k+1));
  const grenze = k => k === 0 ? 'innere Oberfläche' : k === F.n ? 'äußere Oberfläche' : `zwischen ${k} und ${k+1}`;
  let zeilen = `<tr><td></td><td>innere Oberfläche</td><td></td><td></td><td></td><td class="zahl mono">0,000</td><td class="zahl mono">${fmtT(F.theta[0])}</td><td class="zahl mono">${fmtP(F.ps[0])}</td></tr>`;
  F.schichten.forEach((s, i) => {
    const tw = F.ebenen.some(eb => eb.k === i+1);
    zeilen += `<tr${tw ? ' class="markiert"' : ''}><td class="zahl">${i+1}</td><td>${name(i)}${tw ? ' <span class="badge nok">Tauwasser dahinter</span>' : ''}</td>
      <td class="zahl mono">${fmtR(s.d/100)}</td><td class="zahl mono">${s.mu.toLocaleString('de-DE')}</td><td class="zahl mono">${fmtSd(F.sd[i])}</td>
      <td class="zahl mono">${fmtSd(F.x[i+1])}</td><td class="zahl mono">${fmtT(F.theta[i+1])}</td><td class="zahl mono">${fmtP(F.ps[i+1])}</td></tr>`;
  });

  let rw = `p<sub>i</sub> = φ<sub>i</sub> · p<sub>sat</sub>(θ<sub>i</sub>) = ${fmtEta(T.phiI)} · ${fmtP(psat(T.ti))} = ${fmtP(F.pi)} Pa
p<sub>e</sub> = φ<sub>e</sub> · p<sub>sat</sub>(θ<sub>e</sub>) = ${fmtEta(T.phiE)} · ${fmtP(psat(T.te))} = ${fmtP(F.pe)} Pa
S<sub>d</sub> = Σ μ·d = ${fmtSd(F.Sd)} m\n`;
  if (!F.tauwasser) {
    rw += `\nDie Gerade von p<sub>i</sub> nach p<sub>e</sub> liegt an allen Grenzflächen unter p<sub>sat</sub> → <span class="erg">kein Tauwasser</span>.
g = δ<sub>0</sub> · (p<sub>i</sub> − p<sub>e</sub>) / S<sub>d</sub> = ${fmtG(F.g[0])} g/(m²h)`;
  } else {
    rw += `\n<strong>Tauperiode</strong> (${T.stunden} h, gespannter Faden unter p<sub>sat</sub>)\n`;
    F.huelle.slice(1).forEach((b, j) => {
      const a = F.huelle[j];
      const von = a.k < 0 ? 'p<sub>i</sub>' : `p<sub>c</sub>(${grenze(a.k)})`, bis = b.k > F.n ? 'p<sub>e</sub>' : `p<sub>c</sub>(${grenze(b.k)})`;
      rw += `g<sub>${j+1}</sub> = δ<sub>0</sub> · (${von} − ${bis}) / s<sub>d</sub> = 2,0·10⁻¹⁰ · (${fmtP(a.p)} − ${fmtP(b.p)}) / ${fmtSd(b.x - a.x)} = ${fmtG(F.g[j])} g/(m²h)\n`;
    });
    F.ebenen.forEach((eb, j) => {
      rw += `Ebene ${grenze(eb.k)}: θ<sub>c</sub> = ${fmtT(eb.theta)} °C, p<sub>c</sub> = ${fmtP(eb.p)} Pa
  m<sub>c</sub> = t<sub>c</sub> · (g<sub>${j+1}</sub> − g<sub>${j+2}</sub>) = ${T.stunden} h · (${fmtG(F.g[j])} − ${fmtG(F.g[j+1])}) g/(m²h) = <span class="erg">${fmtM(eb.mc)} kg/m²</span>\n`;
    });
    const v = F.verd;
    rw += `\n<strong>Verdunstungsperiode</strong> (${V.stunden} h, innen ${fmtT(V.ti)} °C / ${Math.round(V.phiI*100)} %, außen ${fmtT(V.te)} °C / ${Math.round(V.phiE*100)} %${v.dach ? ', Dach: Außenoberfläche ' + fmtT(V.teDach) + ' °C' : ''})
p<sub>i</sub> = ${fmtP(v.piV)} Pa, p<sub>e</sub> = ${fmtP(v.peV)} Pa, in der Tauwasserzone: θ = ${fmtT(v.thetaA)} °C → p<sub>c</sub> = ${fmtP(v.pcA)} Pa${v.xA !== v.xB ? ` bzw. θ = ${fmtT(v.thetaB)} °C → ${fmtP(v.pcB)} Pa` : ''}
g<sub>i</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>i</sub>) / s<sub>d,i</sub> = 2,0·10⁻¹⁰ · (${fmtP(v.pcA)} − ${fmtP(v.piV)}) / ${fmtSd(v.xA)} = ${fmtG(v.gI)} g/(m²h)
g<sub>e</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>e</sub>) / s<sub>d,e</sub> = 2,0·10⁻¹⁰ · (${fmtP(v.pcB)} − ${fmtP(v.peV)}) / ${fmtSd(F.Sd - v.xB)} = ${fmtG(v.gE)} g/(m²h)
m<sub>ev</sub> = t<sub>ev</sub> · (g<sub>i</sub> + g<sub>e</sub>) = <span class="erg">${fmtM(F.mev)} kg/m²</span>`;
  }

  const cls = F.ok ? 'ok' : 'nok', sym = F.ok ? '✓' : '✗';
  const urteil = !F.tauwasser ? 'Kein Tauwasser im Bauteil'
    : `Tauwasser m<sub>c</sub> = ${fmtM(F.mc)} kg/m² – ${F.ok ? 'zulässig' : 'NICHT zulässig'}`;
  const detail = !F.tauwasser ? 'Nachweis erfüllt'
    : `m<sub>c</sub> ${F.okMc ? '≤' : '>'} ${fmtM(G.mcMax)} kg/m², m<sub>ev</sub> = ${fmtM(F.mev)} kg/m² ${F.okEv ? '≥' : '<'} m<sub>c</sub>`;

  return `<div class="karte">${titel}
    <p class="hinweis">Tauperiode ${T.stunden} h: innen ${fmtT(T.ti)} °C / ${Math.round(T.phiI*100)} %, außen ${fmtT(T.te)} °C / ${Math.round(T.phiE*100)} %; R<sub>si</sub> = ${fmtR(G.rsi)}, R<sub>se</sub> = ${fmtR(G.rse)} m²K/W; δ<sub>0</sub> = 2,0·10⁻¹⁰ kg/(m·s·Pa). Unabhängig von θ<sub>i</sub>/θ<sub>e</sub> oben.</p>
    <div class="massstab no-print" role="group" aria-label="Maßstab des Glaser-Diagramms">
      <button type="button" class="btn btn-klein" data-glaser="sd" aria-pressed="${_glaserMassstab === 'sd'}"><span>Maßstab s<sub>d</sub></span></button>
      <button type="button" class="btn btn-klein" data-glaser="d" aria-pressed="${_glaserMassstab === 'd'}">Maßstab Dicke d</button>
    </div>
    <div id="glaser-box">${glaserSVG(F, _glaserMassstab)}</div>
    <div class="tabwrap"><table class="tab">
      <thead><tr><th class="zahl">Nr.</th><th>Schicht</th><th class="zahl">d [m]</th><th class="zahl">μ [–]</th><th class="zahl">s<sub>d</sub> [m]</th><th class="zahl">Σs<sub>d</sub> [m]</th><th class="zahl">θ [°C]</th><th class="zahl">p<sub>sat</sub> [Pa]</th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table></div>
    <p class="hinweis klein">θ und p<sub>sat</sub> jeweils an der äußeren Grenzfläche der Schicht (Tauperiode).</p>
    <div class="rechenweg">${rw}</div>
    <div class="ampel ${cls}" style="margin-top:12px"><div class="licht">${sym}</div><div>${urteil}<br><small>${detail}</small></div></div>
    ${F.tauwasser ? `<p class="hinweis klein" style="margin-top:8px">Grenzwert 0,5 kg/m², wenn die Tauwasserebene an einer nicht kapillar wasseraufnahmefähigen Schicht liegt (z.B. Folie, Mineralwolle). Bei Holz zusätzlich Massezunahme ≤ 5 % (Holzwerkstoffe ≤ 3 %) prüfen.</p>` : ''}
    ${e.inhomErg ? '<p class="hinweis klein">Inhomogene Schicht: Nachweis im Gefachbereich (Baustoff aus der Schichttabelle).</p>' : ''}
    <p class="pruefen">μ-Werte und Randbedingungen aus dem Gedächtnis – gegen Schneider 26 / DIN 4108-3 prüfen!</p>
  </div>`;
}

let _glaserMassstab = 'sd';
function glaserSVG(F, massstab) {
  const W = 640, H = 330, x0 = 62, x1 = 610, y0 = 26, y1 = 270, n = F.n;
  const dk = [0]; F.schichten.forEach(s => dk.push(dk[dk.length-1] + s.d));
  const pos = massstab === 'd' ? dk : F.x, ges = pos[n] || 1;
  const X = k => x0 + pos[k] / ges * (x1 - x0);
  // p an jeder Grenzfläche aus dem gespannten Faden (linear in s_d)
  const pAn = xs => { const h = F.huelle; for (let j = 1; j < h.length; j++) if (xs <= h[j].x + 1e-12) return h[j-1].p + (h[j].p - h[j-1].p) * (xs - h[j-1].x) / ((h[j].x - h[j-1].x) || 1); return h[h.length-1].p; };
  const p = F.x.map(pAn);
  const pMax = Math.ceil(Math.max(F.pi, ...F.ps) * 1.05 / 500) * 500;
  const Y = v => y1 - v / pMax * (y1 - y0);
  const f1 = v => v.toFixed(1);

  let s = `<svg class="grafik" viewBox="0 0 ${W} ${H}" role="img" aria-label="Glaser-Diagramm">`;
  F.schichten.forEach((sch, i) => {
    const xa = X(i), xb = X(i+1);
    s += `<rect x="${f1(xa)}" y="${y0}" width="${f1(Math.max(xb-xa, .5))}" height="${y1-y0}" fill="${schichtFarbe(sch)}" fill-opacity=".45" class="g-schicht"><title>${esc(sch.name || 'Schicht '+(i+1))}: s_d = ${fmtSd(F.sd[i])} m</title></rect>`;
    if (xb - xa >= 9) s += `<text x="${f1((xa+xb)/2)}" y="${y1+16}" class="g-nr">${i+1}</text>`;
  });
  for (let v = 0; v <= pMax; v += 500) {
    s += `<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="g-raster"/>`;
    s += `<text x="${x0-6}" y="${f1(Y(v)+4)}" class="g-achse">${v.toLocaleString('de-DE')}</text>`;
  }
  s += `<text x="${x0}" y="${y0-10}" class="g-achse" style="text-anchor:start">p [Pa]</text>`;
  // p_sat innerhalb der Schichten gekrümmt: je Schicht 12 Stützstellen
  const sat = [];
  for (let i = 0; i < n; i++) for (let t = 0; t <= 12; t++) {
    const u = t / 12, th = F.theta[i] + (F.theta[i+1] - F.theta[i]) * u;
    sat.push(f1(X(i) + (X(i+1) - X(i)) * u) + ',' + f1(Y(psat(th))));
  }
  s += `<polyline points="${sat.join(' ')}" class="g-psat"/>`;
  s += `<polyline points="${p.map((v, k) => f1(X(k)) + ',' + f1(Y(v))).join(' ')}" class="g-linie"/>`;
  F.ebenen.forEach(eb => {
    s += `<circle cx="${f1(X(eb.k))}" cy="${f1(Y(eb.p))}" r="6" class="g-tau"/>`;
    s += `<text x="${f1(X(eb.k))}" y="${f1(Y(eb.p) - 12)}" class="g-wert">Tauwasser</text>`;
  });
  s += `<text x="${x0}" y="${y1+31}" class="g-seite" style="text-anchor:start">← innen</text>`;
  s += `<text x="${x1}" y="${y1+31}" class="g-seite" style="text-anchor:end">außen →</text>`;
  s += `<line x1="${W/2-150}" x2="${W/2-128}" y1="${H-10}" y2="${H-10}" class="g-psat"/><text x="${W/2-124}" y="${H-6}" class="g-seite" style="text-anchor:start">Sättigungsdampfdruck p<tspan baseline-shift="sub" font-size="8">sat</tspan></text>`;
  s += `<line x1="${W/2+40}" x2="${W/2+62}" y1="${H-10}" y2="${H-10}" class="g-linie"/><text x="${W/2+66}" y="${H-6}" class="g-seite" style="text-anchor:start">Dampfdruck p (${massstab === 'd' ? 'Maßstab d' : 'Gerade im Maßstab s_d'})</text>`;
  return s + '</svg>';
}

function setzeGlaserMassstab(m) {
  _glaserMassstab = m;
  $('glaser-box').innerHTML = glaserSVG(_erg.feuchte, m);
  document.querySelectorAll('[data-glaser]').forEach(b => b.setAttribute('aria-pressed', b.dataset.glaser === m));
}

// 6 – Zusammenfassung
function htmlZusammenfassung(e) {
  const bt = BAUTEILE.find(b => b.id === e.bauteilId);
  const minOk = e.minErg ? (e.minErg.ok ? 'erfüllt' : 'NICHT erfüllt') : 'nicht geprüft';
  return `<div class="karte" style="border-left:4px solid var(--gruen)">
    <p class="erg-titel">Zusammenfassung</p>
    <p>Das Bauteil <strong>${esc(bt ? bt.label : '')}</strong> erreicht einen Wärmedurchgangskoeffizienten von
       <strong>U = ${fmtU(e.U)} W/(m²K)</strong>.
       Der winterliche Mindestwärmeschutz nach DIN 4108-2 ist <strong>${minOk}</strong>,
       der Schimmelnachweis in der Fläche ist <strong>${e.schimmel.ok ? 'erfüllt' : 'NICHT erfüllt'}</strong> (f<sub>Rsi</sub> = ${fmtR(e.schimmel.fRsi)}).
       ${e.feuchte.muFehlt ? 'Der Tauwassernachweis wurde nicht geführt (μ fehlt).'
         : !e.feuchte.tauwasser ? 'Im Bauteil fällt nach Glaser <strong>kein Tauwasser</strong> aus.'
         : `Im Bauteil fallen nach Glaser <strong>${fmtM(e.feuchte.mc)} kg/m² Tauwasser</strong> aus – das ist <strong>${e.feuchte.ok ? 'zulässig' : 'NICHT zulässig'}</strong>.`}</p>
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
