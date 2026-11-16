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
