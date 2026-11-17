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
// anl7: passende Zeilen der GModG-Anlage 7 (erste = Vorauswahl), refKey: Referenzgebäude Anlage 1
const BAUTEILE = [
  { id:'aussenwand',         label:'Außenwand',                               richtung:'horizontal', rminKey:'aussenwand',      anl7:['1b','1a'],      refKey:'aussenwand' },
  { id:'steildach',          label:'Steildach',                               richtung:'aufwaerts',  rminKey:'dach',            anl7:['5b','5a'],      refKey:'dach' },
  { id:'flachdach',          label:'Flachdach',                               richtung:'aufwaerts',  rminKey:'dach',            anl7:['5c','5a'],      refKey:'dach' },
  { id:'decke_aussen_oben',  label:'Decke gegen Außenluft (Wärmestrom ↑)',richtung:'aufwaerts',  rminKey:'decke_aussen',    anl7:['5a'],           refKey:'aussenwand' },
  { id:'decke_aussen_unten', label:'Decke gegen Außenluft (Wärmestrom ↓)',richtung:'abwaerts',   rminKey:'decke_aussen',    anl7:['6e','6d','6c'], refKey:'aussenwand' },
  { id:'decke_unbeheizt',    label:'Decke unter nicht ausg. Dachraum',        richtung:'aufwaerts',  rminKey:'decke_unbeheizt', anl7:['5a'],           refKey:'dach' },
  { id:'kellerdecke',        label:'Kellerdecke / gegen Erdreich',            richtung:'abwaerts',   rminKey:'kellerdecke',     anl7:['6b','6a','6c'], refKey:'erdreich' }
];

// Gebäudemodernisierungsgesetz (GModG) – Z (zitiert aus der nichtamtlichen Lesefassung,
// gesetze-im-internet.de/geg, gültig 29.07.–31.12.2026; Stand ab 01.01.2027 nicht geprüft!)
// § 36 mit Anlage 7: Höchstwerte U_max [W/(m²K)] bei Änderung bestehender Gebäude.
// hoch = Wohngebäude bzw. Zonen ≥ 19 °C, niedrig = Zonen 12 bis < 19 °C (null = keine Anforderung)
const GMODG = {
  stand: 'GModG, nichtamtliche Lesefassung gültig 29.07.–31.12.2026',
  anl7: [
    { id:'1a', text:'Außenwand – Ersatz oder erstmaliger Einbau',                                        hoch:0.24, niedrig:0.35, fn:[] },
    { id:'1b', text:'Außenwand – außenseitige Dämmung, Bekleidung oder neuer Außenputz',                  hoch:0.24, niedrig:0.35, fn:[2] },
    { id:'5a', text:'Dach, oberste Geschossdecke, Abseitenwand – Ersatz oder erstmaliger Einbau',          hoch:0.24, niedrig:0.35, fn:[] },
    { id:'5b', text:'Dach – neue Dachdeckung oder Bekleidung/Dämmung auf der Kaltseite',                  hoch:0.24, niedrig:0.35, fn:[1,5] },
    { id:'5c', text:'Dach mit Abdichtung (Flachdach) – Ersatz der Abdichtung',                             hoch:0.20, niedrig:0.35, fn:[1,5] },
    { id:'6a', text:'Wand/Decke gegen Erdreich oder unbeheizte Räume – Ersatz oder erstmaliger Einbau',    hoch:0.30, niedrig:null, fn:[] },
    { id:'6b', text:'Wand/Decke gegen Erdreich oder unbeheizt – Bekleidung/Dämmung auf der Kaltseite',     hoch:0.30, niedrig:null, fn:[1,5] },
    { id:'6c', text:'Decke nach unten – Fußbodenaufbau auf der beheizten Seite',                           hoch:0.50, niedrig:null, fn:[1,5] },
    { id:'6d', text:'Decke nach unten zur Außenluft – Ersatz oder erstmaliger Einbau',                     hoch:0.24, niedrig:0.35, fn:[1] },
    { id:'6e', text:'Decke nach unten zur Außenluft – Bekleidung/Dämmung erneuert',                        hoch:0.24, niedrig:0.35, fn:[1,5] },
  ],
  fussnoten: {
    1: 'Bei technisch begrenzter Dämmschichtdicke gilt die Anforderung als erfüllt, wenn die höchstmögliche Dämmschichtdicke mit λ = 0,035 W/(mK) eingebaut wird (eingeblasene Dämmstoffe in Hohlräume und nachwachsende Rohstoffe: λ = 0,045 W/(mK)).',
    2: 'Entfällt, wenn die Außenwand nach dem 31.12.1983 unter energiesparrechtlichen Vorschriften errichtet oder erneuert wurde.',
    5: 'Entfällt, wenn die Bauteilfläche nach dem 31.12.1983 unter energiesparrechtlichen Vorschriften errichtet oder erneuert wurde.'
  },
  // Anlage 1: Referenzgebäude (Wohngebäude), U-Werte nur zur Orientierung – Nachweis über H'T (§ 16)
  ref: {
    aussenwand: { u:0.28, text:'Außenwand, Geschossdecke gegen Außenluft' },
    dach:       { u:0.20, text:'Dach, oberste Geschossdecke, Wände zu Abseiten' },
    erdreich:   { u:0.35, text:'Bauteile gegen Erdreich oder unbeheizte Räume, Bodenplatte' }
  }
};

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

// Schimmelnachweis (Mindestwärmeschutz an der inneren Oberfläche)
// DIN 4108-2, Abschnitt 6.2: f_Rsi ≥ 0,70 bei θ_i = 20 °C, φ_i = 50 %, θ_e = −5 °C,
// R_si = 0,25 m²K/W (erhöht, Feuchteschutz), R_se = 0,04 m²K/W → θ_si ≥ 12,6 °C – G
const SCHIMMEL = { rsi: 0.25, rse: 0.04, fmin: 0.70, ti: 20, te: -5, phi: 50, thetaMin: 12.6 };

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

// Beispielaufbauten (innen → außen). Schicht: [Typ, Baustoff aus BAUSTOFFE oder '', Name, d in cm]
const BEISPIELE = [
  { titel: 'Außenwand KS + WDVS (EPS 035)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz', '', 1.5], ['baustoff', 'Kalksandstein KS 1800', '', 17.5],
    ['baustoff', 'EPS (Styropor) 035', '', 14], ['baustoff', 'Kalkzementputz', '', 1] ]},
  { titel: 'Außenwand Porenbeton monolithisch', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz', '', 1], ['baustoff', 'Porenbeton PP 2-0,35', '', 36.5], ['baustoff', 'Kalkzementputz', '', 2] ]},
  { titel: 'Steildach Zwischensparren mit Dampfbremse', f: { bauteil: 'steildach', 'inhom-aktiv': true, 'inhom-nr': '4',
      'inhom-name': 'KVH / BSH (C24)', 'inhom-lambda': '0.13', 'inhom-fa': '0.88', 'inhom-fb': '0.12' }, s: [
    ['baustoff', 'Gipskartonplatte (GKB)', '', 1.25], ['luft_ruhend', '', 'Installationsebene (ruhende Luft)', 2.5],
    ['baustoff', 'Dampfbremse (s_d ≈ 2 m)', '', 0.02],
    ['baustoff', 'Mineralwolle (MW) 035', '', 20], ['baustoff', 'Holzfaserdämmplatte (WF) 045', '', 6] ]},
  { titel: 'Steildach ohne Dampfbremse (Tauwasser!)', f: { bauteil: 'steildach', 'inhom-aktiv': true, 'inhom-nr': '3',
      'inhom-name': 'KVH / BSH (C24)', 'inhom-lambda': '0.13', 'inhom-fa': '0.88', 'inhom-fb': '0.12' }, s: [
    ['baustoff', 'Gipskartonplatte (GKB)', '', 1.25], ['luft_ruhend', '', 'Installationsebene (ruhende Luft)', 2.5],
    ['baustoff', 'Mineralwolle (MW) 035', '', 20], ['baustoff', 'Holzfaserdämmplatte (WF) 045', '', 6] ]},
  { titel: 'Flachdach Warmdach (PUR/PIR)', f: { bauteil: 'flachdach' }, s: [
    ['baustoff', 'Stahlbeton (2500)', '', 20], ['baustoff', 'Dampfsperre Bitumen mit Alu (s_d ≈ 1500 m)', '', 0.4],
    ['baustoff', 'PUR/PIR 024', '', 16], ['baustoff', 'Bitumen-Abdichtung (s_d ≈ 300 m)', '', 1] ]},
  { titel: 'Innendämmung ohne Dampfbremse (Tauwasser!)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipskartonplatte (GKB)', '', 1.25], ['baustoff', 'Mineralwolle (MW) 035', '', 6],
    ['baustoff', 'Vollziegel VMz 1800', '', 24], ['baustoff', 'Kalkzementputz', '', 2] ]},
  { titel: 'Kellerdecke, unterseitig gedämmt', f: { bauteil: 'kellerdecke' }, s: [
    ['baustoff', 'Zementestrich (ZE)', '', 5], ['baustoff', 'EPS (Styropor) 040', '', 3],
    ['baustoff', 'Stahlbeton (2500)', '', 18], ['baustoff', 'Mineralwolle (MW) 035', '', 10] ]},
  { titel: 'Altbau: Vollziegel ungedämmt', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Kalkputz', '', 1.5], ['baustoff', 'Vollziegel VMz 1800', '', 24], ['baustoff', 'Kalkzementputz', '', 2] ]},
];

// Baustoff-Datenbank: λ-Bemessungswert [W/(mK)], Wasserdampf-Diffusionswiderstandszahl μ [–]
// (ein typischer Wert aus dem Tabellenbereich), bei Bahnen zusätzlich übliche Dicke d [cm].
// Schneider Bautabellen, 26. Auflage – G (aus dem Gedächtnis, prüfen!)
const BAUSTOFFE = [
  { gruppe: 'Dämmstoffe', stoffe: [
    { name: 'Mineralwolle (MW) 035', lambda: 0.035, mu: 1 },
    { name: 'Mineralwolle (MW) 040', lambda: 0.040, mu: 1 },
    { name: 'EPS (Styropor) 035', lambda: 0.035, mu: 50 },
    { name: 'EPS (Styropor) 040', lambda: 0.040, mu: 50 },
    { name: 'XPS 035', lambda: 0.035, mu: 100 },
    { name: 'XPS 040', lambda: 0.040, mu: 100 },
    { name: 'PUR/PIR 024', lambda: 0.024, mu: 50 },
    { name: 'PUR/PIR 028', lambda: 0.028, mu: 50 },
    { name: 'Holzfaserdämmplatte (WF) 040', lambda: 0.040, mu: 5 },
    { name: 'Holzfaserdämmplatte (WF) 045', lambda: 0.045, mu: 5 },
    { name: 'Zellulose-Einblasdämmung 040', lambda: 0.040, mu: 2 },
    { name: 'Schaumglas (CG) 050', lambda: 0.050, mu: 100000 },
  ]},
  { gruppe: 'Mauerwerk', stoffe: [
    { name: 'Kalksandstein KS 1800', lambda: 0.99, mu: 20 },
    { name: 'Kalksandstein KS 2000', lambda: 1.10, mu: 20 },
    { name: 'Porenbeton PP 2-0,35', lambda: 0.09, mu: 5 },
    { name: 'Porenbeton PP 4-0,55', lambda: 0.16, mu: 5 },
    { name: 'Hochlochziegel HLz 12-0,7', lambda: 0.70, mu: 5 },
    { name: 'Vollziegel VMz 1800', lambda: 0.81, mu: 10 },
    { name: 'Leichtbetonstein Vbl 800', lambda: 0.39, mu: 5 },
  ]},
  { gruppe: 'Beton', stoffe: [
    { name: 'Normalbeton C20/25 (2400)', lambda: 2.10, mu: 100 },
    { name: 'Stahlbeton (2500)', lambda: 2.30, mu: 100 },
    { name: 'Leichtbeton 1200', lambda: 0.56, mu: 10 },
    { name: 'Leichtbeton 1600', lambda: 0.81, mu: 15 },
  ]},
  { gruppe: 'Holz / Holzwerkstoffe', stoffe: [
    { name: 'Nadelholz (Fichte, Kiefer)', lambda: 0.13, mu: 40 },
    { name: 'KVH / BSH (C24)', lambda: 0.13, mu: 40 },
    { name: 'Laubholz (Eiche, Buche)', lambda: 0.20, mu: 50 },
    { name: 'OSB-Platte', lambda: 0.13, mu: 50 },
    { name: 'Spanplatte', lambda: 0.13, mu: 50 },
    { name: 'MDF-Platte', lambda: 0.14, mu: 20 },
  ]},
  { gruppe: 'Putze / Mörtel / Estriche', stoffe: [
    { name: 'Kalkzementputz', lambda: 1.00, mu: 20 },
    { name: 'Kalkputz', lambda: 0.87, mu: 10 },
    { name: 'Gipsputz', lambda: 0.51, mu: 10 },
    { name: 'Wärmedämmputz (WDP)', lambda: 0.14, mu: 10 },
    { name: 'Zementestrich (ZE)', lambda: 1.40, mu: 20 },
    { name: 'Calciumsulfatestrich (CAF)', lambda: 1.20, mu: 15 },
  ]},
  { gruppe: 'Platten / Bekleidungen', stoffe: [
    { name: 'Gipskartonplatte (GKB)', lambda: 0.25, mu: 8 },
    { name: 'Gipsfaserplatte (GF)', lambda: 0.32, mu: 13 },
    { name: 'Faserzementplatte', lambda: 0.58, mu: 50 },
  ]},
  { gruppe: 'Folien / Bahnen', stoffe: [
    { name: 'PE-Dampfsperre (s_d ≈ 100 m)', lambda: 0.40, mu: 500000, d: 0.02 },
    { name: 'Dampfbremse (s_d ≈ 2 m)', lambda: 0.20, mu: 10000, d: 0.02 },
    { name: 'Unterdeckbahn diffusionsoffen (s_d ≈ 0,02 m)', lambda: 0.20, mu: 40, d: 0.05 },
    { name: 'Dampfsperre Bitumen mit Alu (s_d ≈ 1500 m)', lambda: 0.17, mu: 375000, d: 0.4 },
    { name: 'Bitumen-Abdichtung (s_d ≈ 300 m)', lambda: 0.17, mu: 30000, d: 1 },
  ]},
];

// Feuchteschutz: Glaser-Verfahren nach DIN 4108-3:2018-10, Anhang A – G (prüfen!)
// Tauperiode 90 Tage: innen 20 °C / 50 %, außen −5 °C / 80 %
// Verdunstungsperiode 90 Tage: innen 20 °C / 50 %, außen 12 °C / 70 %;
// Dächer: Außenoberfläche 20 °C. Grenzwerte: m_c ≤ 1,0 kg/m² (0,5 kg/m² an nicht
// kapillar wasseraufnahmefähigen Schichten), m_ev ≥ m_c.
const GLASER = {
  rsi: 0.25, rse: 0.04,
  tau: { ti: 20, phiI: 0.50, te: -5, phiE: 0.80, stunden: 2160 },
  verd: { ti: 20, phiI: 0.50, te: 12, phiE: 0.70, teDach: 20, stunden: 2160 },
  delta0: 2.0e-10,       // Wasserdampf-Diffusionsleitkoeffizient der Luft [kg/(m·s·Pa)]
  mcMax: 1.0, mcMaxNichtKapillar: 0.5
};
