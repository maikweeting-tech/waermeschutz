'use strict';
/* Wärmeschutz-Rechner – UI-Logik */

// ── Hilfsfunktionen ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
function nr(el) { return parseFloat((typeof el === 'string' ? el : el.value).replace(',','.')); }

// Eingebettet in die Heizlast-App (iframe)? Eigenständig ändert sich nichts.
const EINGEBETTET = (() => { try { return window.parent !== window; } catch (e) { return true; } })();
const WS_SPEICHER = 'fh21.heizlast.ws';
function toast(msg) {
  if (EINGEBETTET) { try { window.parent.postMessage({ typ: 'fh21.toast', text: msg }, '*'); return; } catch (e) { /* weiter */ } }
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
    fuelleAnl7();
  });
  $('gmodg-fall').addEventListener('change', () => fuelleAnl7($('gmodg-zeile').value));
  if (EINGEBETTET) leerStart();
  fuelleAnl7();

  // Toggle-Felder
  $('bef-aktiv').addEventListener('change', e => $('bef-felder').hidden = !e.target.checked);
  $('bef-voll').addEventListener('change', e => $('bef-d1-feld').hidden = e.target.checked);
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
  $('btn-heizlast').addEventListener('click', anHeizlast);

  // Startzustand: aus Link oder 3 leere Zeilen
  const z = leseLink();
  let gesichert = null;
  if (EINGEBETTET) { try { gesichert = JSON.parse(localStorage.getItem(WS_SPEICHER) || 'null'); } catch (e) { gesichert = null; } }
  if (z) { ladeZustand(z); berechnen(); }
  else if (gesichert && gesichert.f && Array.isArray(gesichert.s) && gesichert.s.length) ladeZustand(gesichert);
  else { addSchicht(); addSchicht(); addSchicht(); }
  if (EINGEBETTET) {
    document.documentElement.classList.add('eingebettet');
    let t;
    const sichern = () => { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(WS_SPEICHER, JSON.stringify(zustand())); } catch (e) { /* voll/gesperrt */ } }, 300); };
    document.addEventListener('input', sichern); document.addEventListener('change', sichern); document.addEventListener('click', sichern);
  }
  window.addEventListener('hashchange', () => { const z = leseLink(); if (z) { ladeZustand(z); berechnen(); } });

  // Service Worker
  if ('serviceWorker' in navigator && !EINGEBETTET) {
    const hatteSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hatteSW) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

// ── Eingebettet in der Heizlast-App: keine Vorbelegungen ──────
// Randbedingungen starten leer und müssen vor dem Berechnen gewählt werden.
const LEER_FELDER = { bauteil: '', raum: '', richtung: '', 'theta-i': '', 'theta-e': '', 'din-ausgabe': '' };
const PFLICHT = [['bauteil', 'Bauteil'], ['raum', 'Raumnutzung'], ['richtung', 'Wärmestromrichtung'], ['theta-i', 'θ_i'], ['theta-e', 'θ_e'],
  ['din-ausgabe', 'Ausgabe DIN 4108-2'], ['gmodg-fall', 'Anforderung GModG'], ['gmodg-zeile', 'Maßnahme (Anlage 7)']];
function leerStart() {
  ['bauteil', 'raum', 'richtung', 'din-ausgabe', 'gmodg-fall'].forEach(id => {
    const el = $(id);
    if (![...el.options].some(o => o.value === '')) el.insertAdjacentHTML('afterbegin', '<option value="">— wählen —</option>');
    el.value = '';
  });
  $('theta-i').value = ''; $('theta-e').value = '';
  document.addEventListener('change', e => e.target.classList && e.target.classList.remove('fehlt'));
  document.addEventListener('input', e => e.target.classList && e.target.classList.remove('fehlt'));
}
function pflichtFehlt() {
  const fehlt = PFLICHT.filter(([id]) => {
    if (id === 'gmodg-zeile' && $('gmodg-fall').value !== 'bestand') return false;
    const el = $(id), leer = el.value === '' || (el.type === 'number' && isNaN(parseFloat(el.value)));
    el.classList.toggle('fehlt', leer);
    return leer;
  });
  return fehlt.map(([, t]) => t);
}

// ── GModG: passende Anlage-7-Zeilen zum Bauteil ───────────────
function fuelleAnl7(wunsch) {
  const bt = BAUTEILE.find(b => b.id === $('bauteil').value);
  const z = $('gmodg-zeile');
  z.innerHTML = EINGEBETTET ? '<option value="">— wählen —</option>' : '';
  (bt ? bt.anl7 : []).forEach(id => {
    const r = GMODG.anl7.find(x => x.id === id);
    const o = document.createElement('option');
    o.value = id; o.textContent = `Nr. ${id}: ${r.text}`;
    z.appendChild(o);
  });
  if (wunsch && [...z.options].some(o => o.value === wunsch)) z.value = wunsch;
  $('gmodg-zeile-feld').hidden = $('gmodg-fall').value !== 'bestand';
}

// ── Schichtenverwaltung ───────────────────────────────────────
let _stoffHtml = '';
function stoffOptionen() {
  if (_stoffHtml) return _stoffHtml;
  let h = '<option value="">— Baustoff wählen —</option>';
  BAUSTOFFE.forEach(g => {
    h += `<optgroup label="${esc(g.gruppe)}">`;
    g.stoffe.forEach(s => {
      const teile = [esc(s.name)];
      if (s.lambda) teile.push((s.lambdaD ? 'λ_B ' : 'λ ') + (s.lambda < 0.1 ? s.lambda.toFixed(3) : s.lambda.toFixed(2)).replace('.', ','));
      if (!s.sd) teile.push('μ ' + muText(s));
      h += `<option value="${esc(s.name)}" data-lambda="${s.lambda || ''}" data-mu="${s.mu}" data-d="${s.d || ''}">${teile.join(' · ')}${s.q === 'G' ? ' (ungeprüft)' : ''}</option>`;
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
  const st = BAUSTOFFE.flatMap(g => g.stoffe).find(x => x.name === sel.value);
  name.hidden = true;
  name.value = sel.value;
  tr.querySelector('.s-lambda').value = o.lambda;
  tr.querySelector('.s-lambda').placeholder = o.lambda ? 'W/(mK)' : '– (R ≈ 0)';
  tr.querySelector('.s-mu').value = o.mu;
  if (o.d) tr.querySelector('.s-d').value = o.d;
  tr.querySelector('.s-quelle').value = quelleText(st);
}

function muText(s) {
  if (s.dicht) return '∞ (praktisch dampfdicht, s_d ≥ 1500 m)';
  return s.muMax ? `${s.mu.toLocaleString('de-DE')}/${s.muMax.toLocaleString('de-DE')}` : s.mu.toLocaleString('de-DE');
}
function quelleText(s) {
  if (!s) return '';
  if (s.q !== 'Z') return 'ungeprüft';
  const zusatz = [];
  if (s.lambdaD) zusatz.push(`λ_D ${s.lambdaD.toFixed(3).replace('.', ',')} → λ_B`);
  if (s.sd) zusatz.push(`s_d = ${String(s.sd).replace('.', ',')} m`);
  else if (s.muMax || s.dicht) zusatz.push(`μ ${muText(s)}`);
  return `Schneider 26, Taf. ${s.tafel || '4.33'}` + (zusatz.length ? ` (${zusatz.join(', ')})` : '');
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
  'bef-aktiv','bef-nf','bef-dm','bef-lambda','bef-voll','bef-d1','bef-schicht','delta-ur','ur-schicht',
  'inhom-aktiv','inhom-nr','inhom-name','inhom-lambda','inhom-fa','inhom-fb','gmodg-fall','gmodg-zeile'];
const STANDARD = { raum:'normal', 'theta-i':'20', 'theta-e':'-5', 'din-ausgabe':'2013-02', 'lu-stufe':'0', 'lu-schicht':'',
  'bef-aktiv':false, 'bef-nf':'', 'bef-dm':'', 'bef-lambda':'', 'bef-voll':true, 'bef-d1':'', 'bef-schicht':'', 'delta-ur':'0', 'ur-schicht':'',
  'inhom-aktiv':false, 'inhom-nr':'', 'inhom-name':'', 'inhom-lambda':'', 'inhom-fa':'', 'inhom-fb':'',
  'gmodg-fall':'bestand', 'gmodg-zeile':'' };

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
  fuelleAnl7(z.f['gmodg-zeile']);
  $('bef-felder').hidden = !$('bef-aktiv').checked;
  $('bef-d1-feld').hidden = $('bef-voll').checked;
  $('inhom-felder').hidden = !$('inhom-aktiv').checked;
  $('det-korr').open = $('lu-stufe').value !== '0' || $('bef-aktiv').checked || (nr($('delta-ur')) || 0) !== 0 || !!$('ur-schicht').value;
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
    if (ts.value === 'baustoff') {
      tr.querySelector('.s-lambda').value = lam;
      if (!lam) tr.querySelector('.s-lambda').placeholder = '– (R ≈ 0)';
    }
    tr.querySelector('.s-quelle').value = quelle || '';
    if (mu !== undefined) tr.querySelector('.s-mu').value = mu;
  });
  if (!z.s.length) addSchicht();
}

function beispielZustand(b) {
  const bt = BAUTEILE.find(x => x.id === b.f.bauteil);
  const basis = EINGEBETTET ? { ...STANDARD, ...LEER_FELDER, 'gmodg-fall': $('gmodg-fall').value, 'gmodg-zeile': '' } : { ...STANDARD, 'gmodg-fall': $('gmodg-fall').value };
  const f = { ...basis, richtung: bt ? bt.richtung : (EINGEBETTET ? '' : 'horizontal'), ...b.f };
  const s = b.s.map(([typ, stoff, name, d, mu, lam]) => {
    const st = BAUSTOFFE.flatMap(g => g.stoffe).find(x => x.name === stoff);
    const m = mu !== undefined ? mu : st ? st.mu : (typ === 'luft_ruhend' ? 1 : '');
    const l = lam !== undefined ? lam : st && st.lambda ? st.lambda : '';
    return [typ, stoff, name, String(d), String(l), st ? quelleText(st) : (stoff === '' && typ === 'baustoff' ? 'Schneider 26, S. 4.31' : ''), String(m)];
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

function anHeizlast() {
  _erg = null;
  berechnen();
  if (!_erg) return;
  const bt = BAUTEILE.find(b => b.id === _erg.bauteilId);
  const name = (window.prompt('Name des Bauteils für die Heizlast-App (z. B. „AW 1 – KS + WDVS“):', '') || '').trim();
  if (!name) { toast('Kein Name – nichts übergeben.'); return; }
  const b = heizlastBauteil(_erg, name, bt ? bt.label : _erg.bauteilId, new Date().toISOString());
  if (EINGEBETTET) {
    window.parent.postMessage({ typ: 'fh21.bauteil', bauteil: b }, '*');
    return;
  }
  let gespeichert = false;
  try {
    const alt = JSON.parse(localStorage.getItem(FH21_BAUTEILE_KEY) || '[]');
    localStorage.setItem(FH21_BAUTEILE_KEY, JSON.stringify(bauteilListeErgaenzen(alt, b)));
    gespeichert = true;
  } catch { /* privat/gesperrt: nur Datei */ }
  const blob = new Blob([JSON.stringify({ format: 'fh21.bauteile', version: 1, bauteile: [b] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bauteil_' + name.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`„${name}“ (U = ${fmtU(b.U)} W/(m²K)) übergeben${gespeichert ? ' – gespeichert und als Datei geladen' : ' – als Datei geladen'}.`);
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
    const s = { typ, name, d, lambda, quelle, mu };
    // μ-Bereich aus der Tafel nur, wenn der vorbelegte kleinere Wert nicht verändert wurde
    const st = BAUSTOFFE.flatMap(g => g.stoffe).find(x => x.name === r.querySelector('.s-stoff').value);
    if (st && st.muMax && mu === st.mu) { s.muMin = st.mu; s.muMax = st.muMax; }
    if (st && st.holz) { s.holz = st.holz; s.rho = st.rho; }
    return s;
  }).filter(s => s.d > 0 && (s.typ !== 'baustoff' || s.lambda > 0 || s.mu > 0));
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
    d1: nr($('bef-d1')),
    daemmNr: parseInt($('bef-schicht').value) || 1
  };
}

// ── Hauptberechnung ───────────────────────────────────────────
function berechnen() {
  if (EINGEBETTET) {
    const fehlt = pflichtFehlt();
    if (fehlt.length) { toast('Bitte zuerst eingeben bzw. wählen: ' + fehlt.join(', ') + '.'); $('ergebnis').hidden = true; _erg = null; return; }
  }
  const bauteilId = $('bauteil').value;
  const raum = $('raum').value;
  const richtung = $('richtung').value;
  const ti = nr($('theta-i'));
  const te = nr($('theta-e'));
  const din = $('din-ausgabe').value;
  const luSt = parseInt($('lu-stufe').value);
  const luNr = parseInt($('lu-schicht').value) || 0;

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
  const df = deltaUf(leseBef(), schichten, richtung, RT);
  const urNr = parseInt($('ur-schicht').value) || 0;
  const ur = urNr >= 1 && urNr <= schichten.length ? deltaUrTafel(schichtR(schichten[urNr - 1], richtung), RT) : null;
  const dUr = ur ? ur.wert : (nr($('delta-ur')) || 0);
  const dU = dg.wert + df.wert + dUr;
  const U = U0 + dU;

  const Rvorh = RT - rsi - rse;
  const temp = temperaturverlauf(sR, rsi, rse, RT, ti, te);
  const minErg = pruefeMin(bauteilId, raum, Rvorh, din);
  const schimmel = pruefeSchimmel(Rvorh);
  const plaus = plausChecks(U, bauteilId, sR);
  const bt = BAUTEILE.find(b => b.id === bauteilId);
  const muFehlt = schichten.filter(s => !(s.mu > 0)).map(s => s.name || '?');
  const feuchte = muFehlt.length ? { muFehlt } : { ...glaserUnguenstig(schichten, richtung, bt && bt.rminKey === 'dach'), schichten };
  const gmodg = pruefeGModG($('gmodg-fall').value, bauteilId, $('gmodg-zeile').value, raum, U);

  zeigeErgebnis({ sR, rsi, rse, RT, U0, dg, df, dUr, ur, dU, U, Rvorh, temp, minErg, gmodg, schimmel, feuchte, plaus, ti, te, richtung, bauteilId, raum, din, inhomErg });
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
    htmlGModG(e) +
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
    const lam = s.lambda > 0 && s.typ !== 'luft_ruhend' ? fmtR(s.lambda) : '—';
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
    } else if (!(s.lambda > 0)) {
      rw += `R<sub>${i+1}</sub> ≈ 0 (Folie/Bahn ohne λ – nur für den Feuchteschutz)\n`;
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
  rw += e.ur ? e.ur.text + '\n' : `ΔU<sub>r</sub> = ${fmtDU(e.dUr)} W/(m²K)${e.dUr ? ' (manuell)' : ''}\n`;
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
    <p class="hinweis klein">§ 11 GModG verweist bis 31.12.2026 auf DIN 4108-2:2013-02, ab 01.01.2027 auf DIN 4108-2:2026-05.</p>
  </div>`;
}

// 5 – Anforderung GModG
function htmlGModG(e) {
  const g = e.gmodg;
  if (!g) return '';
  const cls = g.ok ? 'ok' : 'nok', sym = g.ok ? '✓' : '✗';
  const stand = `<p class="hinweis klein" style="margin-top:8px">Quelle: ${esc(GMODG.stand)}; vgl. Schneider 26, Tafel 4.16 (dort noch als GEG).</p>`;
  const uZeile = `U = ${fmtU(g.U)} W/(m²K) (inkl. Korrekturwerte ΔU, auf 2 Stellen gerundet)`;

  if (g.fall === 'neubau') {
    return `<div class="karte">
      <p class="erg-titel">5 – GModG Neubau: Vergleich mit dem Referenzgebäude (Anlage 1)</p>
      <div class="rechenweg">${uZeile}
U<sub>Ref</sub> = ${fmtU(g.umax)} W/(m²K) – ${esc(g.text)}
U ${g.ok ? '≤' : '>'} U<sub>Ref</sub> → <span class="erg">${g.ok ? 'besser als oder gleich dem Referenzbauteil' : 'schlechter als das Referenzbauteil'}</span></div>
      <div class="ampel ${cls}" style="margin-top:12px"><div class="licht">${sym}</div><div>${g.ok ? 'Bauteil erreicht den Referenzwert' : 'Bauteil verfehlt den Referenzwert'}<br><small>nur Orientierung – kein Bauteilnachweis</small></div></div>
      <div class="hinweis-box">Für Neubauten gibt es <strong>keinen Grenzwert je Bauteil</strong>. Nachgewiesen wird das ganze Gebäude: Der Transmissionswärmeverlust H'<sub>T</sub> darf das 1,0-Fache des Referenzgebäudes nicht überschreiten (§ 16 mit § 15 Abs. 1). Ein Bauteil schlechter als die Referenz kann durch bessere Bauteile ausgeglichen werden.</div>
      ${stand}
    </div>`;
  }

  const z = g.zeile;
  const fn = z.fn.map(n => `<li><strong>Fußnote ${n}:</strong> ${esc(GMODG.fussnoten[n])}</li>`).join('');
  const rw = g.keineAnforderung
    ? `${uZeile}\nAnlage 7, Nr. ${z.id}, Zonen ${g.zone}: <span class="erg">keine Anforderung</span>`
    : `${uZeile}\nU<sub>max</sub> = ${fmtU(g.umax)} W/(m²K) (Anlage 7, Nr. ${z.id}, Zonen ${g.zone})\nU = ${fmtU(g.Ur)} ${g.ok ? '≤' : '>'} U<sub>max</sub> = ${fmtU(g.umax)} → <span class="erg">${g.ok ? 'erfüllt' : 'NICHT erfüllt'}</span>`;
  return `<div class="karte">
    <p class="erg-titel">5 – GModG: Änderung im Bestand (§ 36 mit Anlage 7)</p>
    <p><strong>Nr. ${z.id}:</strong> ${esc(z.text)}</p>
    <div class="rechenweg">${rw}</div>
    <div class="ampel ${cls}" style="margin-top:12px"><div class="licht">${sym}</div><div>Anforderung GModG ${g.keineAnforderung ? 'entfällt' : g.ok ? 'erfüllt' : 'NICHT erfüllt'}<br><small>${g.keineAnforderung ? 'für Zonen ' + g.zone + ' keine Anforderung' : `U = ${fmtU(g.Ur)} ${g.ok ? '≤' : '>'} U<sub>max</sub> = ${fmtU(g.umax)} W/(m²K)`}</small></div></div>
    <div class="hinweis-box"><strong>Ausnahmen:</strong>
      <ul style="margin:4px 0 0;padding-left:1.2em">
        <li><strong>Bagatellgrenze (§ 36 Satz 2):</strong> keine Anforderung, wenn höchstens 10 % der Fläche der jeweiligen Bauteilgruppe des Gebäudes geändert werden.</li>
        ${fn}
        ${z.id.startsWith('1') ? '<li><strong>Innendämmung</strong> ist in Anlage 7 nicht eigens aufgeführt – die Zuordnung (Nr. 1a/1b) bitte im Einzelfall klären.</li>' : ''}
      </ul>
    </div>
    ${stand}
  </div>`;
}

// 6 – Schimmelnachweis f_Rsi
function htmlSchimmel(e) {
  const m = e.schimmel;
  const cls = m.ok ? 'ok' : 'nok', sym = m.ok ? '✓' : '✗';
  const vgl = m.ok ? '≥' : '<';
  const rw = `<strong>Schimmelpilzschwelle</strong> (Kapillarkondensation ab φ ≈ 80 %)
φ<sub>i,O</sub> = φ<sub>i</sub> / 0,8 = ${m.phi} / 0,8 = ${String(m.phiO).replace('.', ',')} %
θ<sub>si,min</sub> = Taupunkt bei ${fmtT(m.ti)} °C und ${String(m.phiO).replace('.', ',')} % = (${(m.phiO / 100).toFixed(3).replace('.', ',')})<sup>0,1247</sup> · (109,8 + ${fmtT(m.ti)}) − 109,8 = <span class="erg">${fmtT(m.thetaMin)} °C</span>

<strong>Oberflächentemperatur</strong>
R<sub>T</sub> = R<sub>si</sub> + R + R<sub>se</sub> = ${fmtR(m.rsi)} + ${fmtR(m.R)} + ${fmtR(m.rse)} = ${fmtR(m.RT)} m²K/W
θ<sub>si</sub> = θ<sub>i</sub> − (θ<sub>i</sub> − θ<sub>e</sub>) · R<sub>si</sub> / R<sub>T</sub> = ${fmtT(m.ti)} − ${fmtT(m.ti - m.te)} · ${fmtR(m.rsi)} / ${fmtR(m.RT)} = <span class="erg">${fmtT(m.thetaSi)} °C</span> ${vgl} ${fmtT(m.thetaMin)} °C

<strong>Gleichwertig</strong>
erf R = R<sub>si</sub> · (θ<sub>i</sub> − θ<sub>e</sub>) / (θ<sub>i</sub> − θ<sub>s</sub>) − (R<sub>si</sub> + R<sub>se</sub>) = ${fmtR(m.rsi)} · ${fmtT(m.ti - m.te)} / ${fmtT(m.ti - m.thetaMin)} − ${fmtR(m.rsi + m.rse)} = ${fmtR(m.erfR)} m²K/W → R = ${fmtR(m.R)} ${vgl} erf R
erf U = (1 / R<sub>si</sub>) · (θ<sub>i</sub> − θ<sub>s</sub>) / (θ<sub>i</sub> − θ<sub>e</sub>) = ${fmtR(m.erfU)} W/(m²K)   (Temperaturfaktor f<sub>Rsi</sub> = ${fmtR(m.fRsi)})`;
  return `<div class="karte">
    <p class="erg-titel">6 – Schimmelnachweis (Schimmelpilzschwelle θ<sub>si,min</sub>)</p>
    <p class="hinweis">Randbedingungen: θ<sub>i</sub> = ${fmtT(m.ti)} °C, φ<sub>i</sub> = ${m.phi} %, θ<sub>e</sub> = ${fmtT(m.te)} °C, R<sub>si</sub> = ${fmtR(m.rsi)}, R<sub>se</sub> = ${fmtR(m.rse)} m²K/W (beheizte Räume). Unabhängig von θ<sub>i</sub>/θ<sub>e</sub> oben.</p>
    <div class="rechenweg">${rw}</div>
    <div class="ampel ${cls}" style="margin-top:12px">
      <div class="licht">${sym}</div>
      <div>Schimmelfreiheit in der Fläche ${m.ok ? 'gegeben' : 'NICHT gegeben'}<br>
        <small>θ<sub>si</sub> = ${fmtT(m.thetaSi)} °C ${vgl} θ<sub>si,min</sub> = ${fmtT(m.thetaMin)} °C</small></div>
    </div>
    <p class="hinweis klein" style="margin-top:8px">Gilt für die ungestörte Fläche. Maßgebend sind meist Wärmebrücken (Ecken, Anschlüsse) – dort die niedrigste Oberflächentemperatur nach DIN EN ISO 10211 nachweisen.</p>
    <p class="hinweis klein">Quelle: Schneider 26, S. 4.24 (Schimmelpilzschwelle, Tafel 4.24 Taupunkttemperatur) und Tafel 4.4a (R<sub>si</sub>/R<sub>se</sub>).</p>
  </div>`;
}

// 6 – Plausibilitätscheck
function htmlPlaus(e) {
  let items = '';
  e.plaus.forEach(p => {
    items += `<div class="check-item"><div class="check-dot ${p.ok ? 'ok' : 'warn'}"></div><div>${esc(p.text)}<br><span class="klein hinweis">${esc(p.hinweis)}</span></div></div>`;
  });
  return `<div class="karte"><p class="erg-titel">8 – Plausibilitätscheck</p>${items}</div>`;
}

// 6 – Feuchteschutz: Glaser-Verfahren
const fmtP = v => Math.round(v).toLocaleString('de-DE');
const fmtM = v => v > 0 && v < 0.0005 ? '< 0,001' : v.toFixed(3).replace('.', ',');
const fmtSd = v => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace('.', ',');
const fmtG = v => (v * 3600 * 1000).toFixed(3).replace('.', ',');   // kg/(m²s) → g/(m²h)

function htmlGlaser(e) {
  const F = e.feuchte, G = GLASER, T = G.tau, V = G.verd;
  const titel = '<p class="erg-titel">7 – Feuchteschutz: Tauwasser im Bauteil (Glaser-Verfahren, DIN 4108-3)</p>';
  if (F.muFehlt) return `<div class="karte">${titel}<p class="hinweis">Für den Tauwassernachweis fehlt μ bei: ${F.muFehlt.map(esc).join(', ')}.</p></div>`;

  const name = k => esc(F.schichten[k].name || 'Schicht ' + (k+1));
  const grenze = k => k === 0 ? 'innere Oberfläche' : k === F.n ? 'äußere Oberfläche' : `zwischen ${k} und ${k+1}`;
  let zeilen = `<tr><td></td><td>innere Oberfläche</td><td></td><td></td><td></td><td class="zahl mono">0,000</td><td class="zahl mono">${fmtT(F.theta[0])}</td><td class="zahl mono">${fmtP(F.ps[0])}</td></tr>`;
  F.schichten.forEach((s, i) => {
    const tw = F.ebenen.some(eb => eb.k === i+1);
    zeilen += `<tr${tw ? ' class="markiert"' : ''}><td class="zahl">${i+1}</td><td>${name(i)}${tw ? ' <span class="badge nok">Tauwasser dahinter</span>' : ''}</td>
      <td class="zahl mono">${fmtR(s.d/100)}</td><td class="zahl mono">${F.mus[i].toLocaleString('de-DE')}${F.bereich[i] ? (F.mus[i] === s.muMax ? ' <span class="klein">(max)</span>' : ' <span class="klein">(min)</span>') : ''}</td><td class="zahl mono">${fmtSd(F.sd[i])}</td>
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
    const h = s => (s / 3600).toFixed(0);
    rw += `\n<strong>Verdunstungsperiode</strong> (Juni–August, ${V.stunden} h; Dampfdrücke nach Tafel 4.29b; Tafel 4.30 Fall ${v.fall})
p<sub>i</sub> = p<sub>e</sub> = ${fmtP(v.piV)} Pa, im Tauwasserbereich p<sub>c</sub> = ${fmtP(v.pc)} Pa (${v.dach ? 'Dach' : 'Außenwand/Decke'})\n`;
    if (v.fall === 2) {
      rw += `g<sub>i</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>i</sub>) / s<sub>d,c</sub> = 2,0·10⁻¹⁰ · (${fmtP(v.pc)} − ${fmtP(v.piV)}) / ${fmtSd(v.xA)} = ${fmtG(v.gI)} g/(m²h)
g<sub>e</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>e</sub>) / (s<sub>d,T</sub> − s<sub>d,c</sub>) = 2,0·10⁻¹⁰ · (${fmtP(v.pc)} − ${fmtP(v.peV)}) / ${fmtSd(F.Sd - v.xA)} = ${fmtG(v.gE)} g/(m²h)
M<sub>ev</sub> = t<sub>ev</sub> · (g<sub>i</sub> + g<sub>e</sub>) = <span class="erg">${fmtM(F.mev)} kg/m²</span>`;
    } else if (v.fall === 3) {
      rw += `g<sub>ev1</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>i</sub>) / s<sub>d,c1</sub> = ${fmtG(v.gI)} g/(m²h),  t<sub>ev1</sub> = M<sub>c1</sub> / g<sub>ev1</sub> = ${h(v.t1)} h
g<sub>ev2</sub> = δ<sub>0</sub> · (p<sub>c</sub> − p<sub>e</sub>) / (s<sub>d,T</sub> − s<sub>d,c2</sub>) = ${fmtG(v.gE)} g/(m²h),  t<sub>ev2</sub> = M<sub>c2</sub> / g<sub>ev2</sub> = ${h(v.t2)} h\n`;
      rw += v.variante === 'beide'
        ? `t<sub>ev1</sub> und t<sub>ev2</sub> > t<sub>ev</sub>: M<sub>ev</sub> = (g<sub>ev1</sub> + g<sub>ev2</sub>) · t<sub>ev</sub>`
        : v.variante === 't1'
        ? `t<sub>ev1</sub> < t<sub>ev2</sub>: Ebene 1 ist zuerst trocken, danach verdunstet Ebene 2 auch nach innen
M<sub>ev</sub> = g<sub>ev1</sub>·t<sub>ev1</sub> + g<sub>ev2</sub>·t<sub>ev1</sub> + (δ<sub>0</sub>·(p<sub>c2</sub> − p<sub>i</sub>)/s<sub>d,c2</sub> + g<sub>ev2</sub>) · (t<sub>ev</sub> − t<sub>ev1</sub>)`
        : `t<sub>ev2</sub> < t<sub>ev1</sub>: Ebene 2 ist zuerst trocken, danach verdunstet Ebene 1 auch nach außen
M<sub>ev</sub> = g<sub>ev2</sub>·t<sub>ev2</sub> + g<sub>ev1</sub>·t<sub>ev2</sub> + (g<sub>ev1</sub> + δ<sub>0</sub>·(p<sub>c1</sub> − p<sub>e</sub>)/(s<sub>d,T</sub> − s<sub>d,c1</sub>)) · (t<sub>ev</sub> − t<sub>ev2</sub>)`;
      rw += ` = <span class="erg">${fmtM(F.mev)} kg/m²</span>`;
    } else {
      rw += `s<sub>d,c,m</sub> = s<sub>d,c1</sub> + 0,5 · (s<sub>d,c2</sub> − s<sub>d,c1</sub>) = ${fmtSd(v.xA)} + 0,5 · (${fmtSd(v.xB)} − ${fmtSd(v.xA)}) = ${fmtSd(v.xm)} m
M<sub>ev</sub> = δ<sub>0</sub> · ((p<sub>c</sub> − p<sub>i</sub>) / s<sub>d,c,m</sub> + (p<sub>c</sub> − p<sub>e</sub>) / (s<sub>d,T</sub> − s<sub>d,c,m</sub>)) · t<sub>ev</sub> = <span class="erg">${fmtM(F.mev)} kg/m²</span>`;
    }
    if (F.holz.length) {
      rw += `\n\n<strong>Zulässige Tauwassermasse bei Holz/Holzwerkstoffen</strong>\n`;
      F.holz.forEach(hz => {
        rw += `${esc(hz.name)}: ${Math.round(hz.anteil * 100)} % · d · ρ = ${String(hz.anteil).replace('.', ',')} · ${fmtR(hz.d)} · ${hz.rho} = ${fmtM(hz.grenze)} kg/m²\n`;
      });
      rw += `zul. M<sub>c</sub> = min(1,0; ${F.holz.map(hz => fmtM(hz.grenze)).join('; ')}) = <span class="erg">${fmtM(F.mcGrenze)} kg/m²</span>`;
    }
  }

  const cls = F.ok ? 'ok' : 'nok', sym = F.ok ? '✓' : '✗';
  const urteil = !F.tauwasser ? 'Kein Tauwasser im Bauteil'
    : `Tauwasser m<sub>c</sub> = ${fmtM(F.mc)} kg/m² – ${F.ok ? 'zulässig' : 'NICHT zulässig'}`;
  const detail = !F.tauwasser ? 'Nachweis erfüllt'
    : `M<sub>c</sub> ${F.okMc ? '≤' : '>'} zul. M<sub>c</sub> = ${fmtM(F.mcGrenze)} kg/m², M<sub>ev</sub> = ${fmtM(F.mev)} kg/m² ${F.okEv ? '≥' : '<'} M<sub>c</sub>`;

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
    ${F.tauwasser ? `<p class="hinweis klein" style="margin-top:8px">Grenzwert 0,5 kg/m², wenn die Tauwasserebene an einer kapillar nicht wasseraufnahmefähigen Schicht liegt (z.B. Folie, Mineralwolle) – bitte selbst prüfen. Holz (5 %) und Holzwerkstoffe (3 %) aus der Auswahlliste rechnet die App automatisch ein, eigene Holzbaustoffe nicht.</p>` : ''}
    ${e.inhomErg ? '<p class="hinweis klein">Inhomogene Schicht: Nachweis im Gefachbereich (Baustoff aus der Schichttabelle).</p>' : ''}
    <p class="hinweis klein"><strong>μ-Wahl nach Tafel 4.29a:</strong> Bei Stoffen mit zwei μ-Werten (z.B. 15/35) wählt die App automatisch den Wert, der die Tauwassermenge M<sub>c</sub> maximiert – vor dem Taupunkt (min), dahinter (max). Dieselben Werte gelten für die Verdunstungsperiode. Wer in der Spalte μ einen eigenen Wert einträgt, behält diesen.</p>
    <p class="hinweis klein">Randbedingungen: Schneider 26, Tafel 4.29b und 4.4a; Grenzwerte Abschnitt 3.5.1. Ab 01.01.2027 verweist § 11 GModG auf DIN 4108-3:2024-03 (Änderungen nicht geprüft).</p>
    <p class="hinweis klein">δ<sub>0</sub> = 2·10⁻¹⁰ kg/(m·s·Pa) und Formeln nach Schneider 26, Abschn. 3.2 und Tafel 4.30.</p>
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
       Der winterliche Mindestwärmeschutz nach DIN 4108-2 ist <strong>${minOk}</strong>.
       ${!e.gmodg ? '' : e.gmodg.fall === 'neubau'
         ? `Gegenüber dem Referenzgebäude des GModG (U<sub>Ref</sub> = ${fmtU(e.gmodg.umax)}) ist das Bauteil <strong>${e.gmodg.ok ? 'gleich gut oder besser' : 'schlechter'}</strong>.`
         : e.gmodg.keineAnforderung ? 'Das GModG stellt an diese Maßnahme in dieser Temperaturzone keine Anforderung.'
         : `Die Anforderung des GModG (§ 36, Anlage 7 Nr. ${e.gmodg.zeile.id}: U<sub>max</sub> = ${fmtU(e.gmodg.umax)}) ist <strong>${e.gmodg.ok ? 'erfüllt' : 'NICHT erfüllt'}</strong>.`}
       Der Schimmelnachweis in der Fläche ist <strong>${e.schimmel.ok ? 'erfüllt' : 'NICHT erfüllt'}</strong> (θ<sub>si</sub> = ${fmtT(e.schimmel.thetaSi)} °C, Schwelle ${fmtT(e.schimmel.thetaMin)} °C).
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
