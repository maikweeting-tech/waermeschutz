'use strict';
/* Wärmeschutz-Rechner – Daten und Nachschlagetabellen
   Quellen-Kürzel: Z = zitiert, G = aus dem Gedächtnis – prüfen! */

// Wärmeübergangswiderstände [m²K/W]
// DIN EN ISO 6946:2018-03, Tabelle 7 (Wärmeschutz, nicht Feuchteschutz) – Z
const RSI_RSE = {
  horizontal: { rsi: 0.13, rse: 0.04 },
  aufwaerts:  { rsi: 0.10, rse: 0.04 },
  abwaerts:   { rsi: 0.17, rse: 0.04 }
};

// Ruhende (unbelüftete) Luftschichten [mm → m²K/W]
// DIN EN ISO 6946:2018-03, Tabelle 2 – G
const LUFT_R = {
  horizontal: [[0,0],[5,0.11],[7,0.13],[10,0.15],[15,0.17],[25,0.18],[50,0.18],[100,0.18],[300,0.18]],
  aufwaerts:  [[0,0],[5,0.11],[7,0.13],[10,0.15],[15,0.16],[25,0.16],[50,0.16],[100,0.16],[300,0.16]],
  abwaerts:   [[0,0],[5,0.11],[7,0.13],[10,0.15],[15,0.17],[25,0.19],[50,0.21],[100,0.22],[300,0.23]]
};

// Bauteiltypen mit Standard-Wärmestromrichtung
const BAUTEILE = [
  { id:'aussenwand',         label:'Außenwand',                               richtung:'horizontal', rminKey:'aussenwand' },
  { id:'steildach',          label:'Steildach',                               richtung:'aufwaerts',  rminKey:'dach' },
  { id:'flachdach',          label:'Flachdach',                               richtung:'aufwaerts',  rminKey:'dach' },
  { id:'decke_aussen_oben',  label:'Decke gegen Außenluft (Wärmestrom ↑)',richtung:'aufwaerts',  rminKey:'decke_aussen' },
  { id:'decke_aussen_unten', label:'Decke gegen Außenluft (Wärmestrom ↓)',richtung:'abwaerts',   rminKey:'decke_aussen' },
  { id:'decke_unbeheizt',    label:'Decke unter nicht ausg. Dachraum',        richtung:'aufwaerts',  rminKey:'decke_unbeheizt' },
  { id:'kellerdecke',        label:'Kellerdecke / gegen Erdreich',            richtung:'abwaerts',   rminKey:'kellerdecke' }
];

// Mindest-Wärmedurchlasswiderstände R_min [m²K/W] – R ohne R_si/R_se
// DIN 4108-2, Tabelle 3 – G (2026-05-Werte: Platzhalter = 2013er, unbedingt prüfen!)
const R_MIN = {
  '2013-02': {
    normal: {
      aussenwand:      { rmin:1.20, zeile:'1',   text:'Außenwände' },
      dach:            { rmin:1.20, zeile:'3',   text:'Dach, Dachschräge, Abseitenwand' },
      decke_aussen:    { rmin:1.75, zeile:'4',   text:'Decke/Fußboden gegen Außenluft' },
      decke_unbeheizt: { rmin:0.90, zeile:'5',   text:'Decke unter nicht ausg. Dachraum' },
      kellerdecke:     { rmin:0.90, zeile:'5/6', text:'Kellerdecke, gegen Erdreich' }
    },
    niedrig: {
      aussenwand:      { rmin:0.55, zeile:'1',   text:'Außenwände' },
      dach:            { rmin:0.90, zeile:'3',   text:'Dach, Dachschräge' },
      decke_aussen:    { rmin:1.20, zeile:'4',   text:'Decke/Fußboden gegen Außenluft' },
      decke_unbeheizt: { rmin:0.55, zeile:'5',   text:'Decke unter nicht ausg. Dachraum' },
      kellerdecke:     { rmin:0.55, zeile:'5/6', text:'Kellerdecke, gegen Erdreich' }
    }
  },
  '2026-05': {
    normal: {
      aussenwand:      { rmin:1.20, zeile:'?', text:'Außenwände – Werte 2026 prüfen!' },
      dach:            { rmin:1.20, zeile:'?', text:'Dach – Werte 2026 prüfen!' },
      decke_aussen:    { rmin:1.75, zeile:'?', text:'Decke – Werte 2026 prüfen!' },
      decke_unbeheizt: { rmin:0.90, zeile:'?', text:'Decke – Werte 2026 prüfen!' },
      kellerdecke:     { rmin:0.90, zeile:'?', text:'Kellerdecke – Werte 2026 prüfen!' }
    },
    niedrig: {
      aussenwand:      { rmin:0.55, zeile:'?', text:'Werte 2026 prüfen!' },
      dach:            { rmin:0.90, zeile:'?', text:'Werte 2026 prüfen!' },
      decke_aussen:    { rmin:1.20, zeile:'?', text:'Werte 2026 prüfen!' },
      decke_unbeheizt: { rmin:0.55, zeile:'?', text:'Werte 2026 prüfen!' },
      kellerdecke:     { rmin:0.55, zeile:'?', text:'Werte 2026 prüfen!' }
    }
  }
};

// ΔU''_g je Korrekturstufe [W/(m²K)]
// DIN EN ISO 6946:2018-03, Anhang D (Berichtigung 1:2023-04 ggf. beachten) – G
const DELTA_UG = { 0: 0, 1: 0.01, 2: 0.04 };

// α für Befestigungselemente (volle Durchdringung) – G
const ALPHA_BEF = 0.8;

// Typische U-Wert-Bereiche [W/(m²K)] – zur Plausibilitätsprüfung
const U_TYPISCH = {
  aussenwand:      { min:0.15, max:0.80, text:'Außenwand' },
  dach:            { min:0.10, max:0.50, text:'Dach' },
  decke_aussen:    { min:0.15, max:0.60, text:'Decke gegen Außenluft' },
  decke_unbeheizt: { min:0.15, max:0.60, text:'Decke unter Dachraum' },
  kellerdecke:     { min:0.20, max:0.80, text:'Kellerdecke' }
};

// Richtungslabels
const RICHTUNG_LABEL = { horizontal:'horizontal', aufwaerts:'aufwärts', abwaerts:'abwärts' };

// Baustoff-Datenbank mit λ-Bemessungswerten [W/(mK)]
// Schneider Bautabellen, 26. Auflage – G (aus dem Gedächtnis, prüfen!)
const BAUSTOFFE = [
  { gruppe: 'Dämmstoffe', stoffe: [
    { name: 'Mineralwolle (MW) 035', lambda: 0.035 },
    { name: 'Mineralwolle (MW) 040', lambda: 0.040 },
    { name: 'EPS (Styropor) 035', lambda: 0.035 },
    { name: 'EPS (Styropor) 040', lambda: 0.040 },
    { name: 'XPS 035', lambda: 0.035 },
    { name: 'XPS 040', lambda: 0.040 },
    { name: 'PUR/PIR 024', lambda: 0.024 },
    { name: 'PUR/PIR 028', lambda: 0.028 },
    { name: 'Holzfaserdämmplatte (WF) 040', lambda: 0.040 },
    { name: 'Holzfaserdämmplatte (WF) 045', lambda: 0.045 },
    { name: 'Zellulose-Einblasdämmung 040', lambda: 0.040 },
    { name: 'Schaumglas (CG) 050', lambda: 0.050 },
  ]},
  { gruppe: 'Mauerwerk', stoffe: [
    { name: 'Kalksandstein KS 1800', lambda: 0.99 },
    { name: 'Kalksandstein KS 2000', lambda: 1.10 },
    { name: 'Porenbeton PP 2-0,35', lambda: 0.09 },
    { name: 'Porenbeton PP 4-0,55', lambda: 0.16 },
    { name: 'Hochlochziegel HLz 12-0,7', lambda: 0.70 },
    { name: 'Vollziegel VMz 1800', lambda: 0.81 },
    { name: 'Leichtbetonstein Vbl 800', lambda: 0.39 },
  ]},
  { gruppe: 'Beton', stoffe: [
    { name: 'Normalbeton C20/25 (2400)', lambda: 2.10 },
    { name: 'Stahlbeton (2500)', lambda: 2.30 },
    { name: 'Leichtbeton 1200', lambda: 0.56 },
    { name: 'Leichtbeton 1600', lambda: 0.81 },
  ]},
  { gruppe: 'Holz / Holzwerkstoffe', stoffe: [
    { name: 'Nadelholz (Fichte, Kiefer)', lambda: 0.13 },
    { name: 'KVH / BSH (C24)', lambda: 0.13 },
    { name: 'Laubholz (Eiche, Buche)', lambda: 0.20 },
    { name: 'OSB-Platte', lambda: 0.13 },
    { name: 'Spanplatte', lambda: 0.13 },
    { name: 'MDF-Platte', lambda: 0.14 },
  ]},
  { gruppe: 'Putze / Mörtel / Estriche', stoffe: [
    { name: 'Kalkzementputz', lambda: 1.00 },
    { name: 'Kalkputz', lambda: 0.87 },
    { name: 'Gipsputz', lambda: 0.51 },
    { name: 'Wärmedämmputz (WDP)', lambda: 0.14 },
    { name: 'Zementestrich (ZE)', lambda: 1.40 },
    { name: 'Calciumsulfatestrich (CAF)', lambda: 1.20 },
  ]},
  { gruppe: 'Platten / Bekleidungen', stoffe: [
    { name: 'Gipskartonplatte (GKB)', lambda: 0.25 },
    { name: 'Gipsfaserplatte (GF)', lambda: 0.32 },
    { name: 'Faserzementplatte', lambda: 0.58 },
  ]},
];
