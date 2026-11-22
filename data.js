'use strict';
/* Wärmeschutz-Rechner – Daten und Nachschlagetabellen
   Quellen-Kürzel: Z = zitiert, G = aus dem Gedächtnis – prüfen! */

// Wärmeübergangswiderstände [m²K/W]
// DIN EN ISO 6946:2018-03, Tabelle 7 (Wärmeschutz, nicht Feuchteschutz) – Z, Schneider 26, Tafel 4.4a
const RSI_RSE = {
  horizontal: { rsi: 0.13, rse: 0.04 },
  aufwaerts:  { rsi: 0.10, rse: 0.04 },
  abwaerts:   { rsi: 0.17, rse: 0.04 }
};
// Außenseite des Bauteils → R_se (DIN EN ISO 6946; Schneider 26, Tafel 4.4a)
// luft: R_se wie oben; erdreich: R_se = 0; innen: angrenzender Innenraum/unbeheizter Raum (z. B. Keller) → R_se = R_si
// G: Werte für Erdreich und Innenraum aus dem Gedächtnis – gegen Tafel 4.4a prüfen, dann geprueft setzen
const AUSSENSEITE = {
  luft:     { label: 'Außenluft' },
  erdreich: { label: 'Erdreich' },
  innen:    { label: 'Innenraum / unbeheizter Raum (Keller) / belüftete Luftschicht' }
};
const AUSSENSEITE_QUELLE = { text: 'DIN EN ISO 6946; Schneider 26, Tafel 4.4a', geprueft: false };

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

// Gebäudemodernisierungsgesetz (GModG) – Z (zitiert aus den nichtamtlichen Lesefassungen
// gültig 29.07.–31.12.2026 und ab 01.01.2027 (BBSR, gmodg.bund.de): § 36, Anlage 7 und Anlage 1
// sind in beiden Fassungen gleich; Abgleich mit Schneider 26, Tafel 4.16)
// § 36 mit Anlage 7: Höchstwerte U_max [W/(m²K)] bei Änderung bestehender Gebäude.
// hoch = Wohngebäude bzw. Zonen ≥ 19 °C, niedrig = Zonen 12 bis < 19 °C (null = keine Anforderung)
const GMODG = {
  stand: 'GModG, nichtamtliche Lesefassungen gültig ab 29.07.2026 und ab 01.01.2027 (§ 36, Anlage 7 und Anlage 1 unverändert)',
  anl7: [
    { id:'1a', text:'Außenwand – Ersatz oder erstmaliger Einbau',                                        hoch:0.24, niedrig:0.35, fn:[1] },
    { id:'1b', text:'Außenwand – außenseitige Dämmung, Bekleidung oder neuer Außenputz',                  hoch:0.24, niedrig:0.35, fn:[1,2] },
    { id:'5a', text:'Dach, oberste Geschossdecke, Abseitenwand – Ersatz oder erstmaliger Einbau',          hoch:0.24, niedrig:0.35, fn:[1] },
    { id:'5b', text:'Dach – neue Dachdeckung oder Bekleidung/Dämmung auf der Kaltseite',                  hoch:0.24, niedrig:0.35, fn:[1,5] },
    { id:'5c', text:'Dach mit Abdichtung (Flachdach) – Ersatz der Abdichtung',                             hoch:0.20, niedrig:0.35, fn:[1,5] },
    { id:'6a', text:'Wand/Decke gegen Erdreich oder unbeheizte Räume – Ersatz oder erstmaliger Einbau',    hoch:0.30, niedrig:null, fn:[1] },
    { id:'6b', text:'Wand/Decke gegen Erdreich oder unbeheizt – Bekleidung/Dämmung auf der Kaltseite',     hoch:0.30, niedrig:null, fn:[1,5] },
    { id:'6c', text:'Decke nach unten – Fußbodenaufbau auf der beheizten Seite',                           hoch:0.50, niedrig:null, fn:[1,5] },
    { id:'6d', text:'Decke nach unten zur Außenluft – Ersatz oder erstmaliger Einbau',                     hoch:0.24, niedrig:0.35, fn:[1] },
    { id:'6e', text:'Decke nach unten zur Außenluft – Bekleidung/Dämmung erneuert',                        hoch:0.24, niedrig:0.35, fn:[1,5] },
  ],
  fussnoten: {
    1: 'Ist die Dämmschichtdicke aus technischen Gründen begrenzt, gilt die Anforderung als erfüllt, wenn die nach den anerkannten Regeln der Technik höchstmögliche Dämmschichtdicke mit λ = 0,035 W/(mK) eingebaut wird (in Hohlräume eingeblasene Dämmstoffe und nachwachsende Rohstoffe: λ = 0,045 W/(mK)). Bei Nr. 5b gilt das auch für Zwischensparrendämmung, wenn die Dicke durch innenseitige Bekleidung oder Sparrenhöhe begrenzt ist.',
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
      // vom Nutzer gegen DIN 4108-2:2026-05, Tabelle 3 geprüft (22.11.2026)
      kellerdecke:     { rmin:0.90, zeile:'?', text:'Kellerdecke / gegen Erdreich', geprueft:'22.11.2026' }
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

// Schimmelnachweis an der inneren Oberfläche – Z (Schneider 26, S. 4.24, Tafel 4.24 und 4.4a):
// Schimmelpilzschwelle = Taupunkt bei φ_i,O = φ_i / 0,8 (Kapillarkondensation ab 80 %);
// θ_i = 20 °C, φ_i = 50 % → 62,5 % → θ_si ≥ 12,6 °C; θ_e = −5 °C; R_si = 0,25, R_se = 0,04 m²K/W
const SCHIMMEL = { rsi: 0.25, rse: 0.04, ti: 20, te: -5, phi: 50, phiKapillar: 0.8 };

// α für Befestigungselemente: α = 0,8 · d₁/d₀ – Z (Schneider 26, Tafel 4.6a)
const ALPHA_BEF = 0.8;

// Typische U-Wert-Bereiche [W/(m²K)] – zur Plausibilitätsprüfung
const U_TYPISCH = {
  // Untergrenzen auf Passivhaus-Niveau gesenkt (gut gedämmte Neubauten liegen sonst „außerhalb“)
  aussenwand:      { min:0.10, max:0.80, text:'Außenwand' },
  dach:            { min:0.08, max:0.50, text:'Dach' },
  decke_aussen:    { min:0.10, max:0.60, text:'Decke gegen Außenluft' },
  decke_unbeheizt: { min:0.10, max:0.60, text:'Decke unter Dachraum' },
  kellerdecke:     { min:0.10, max:0.80, text:'Kellerdecke / Bodenplatte' }
};

// Richtungslabels
const RICHTUNG_LABEL = { horizontal:'horizontal', aufwaerts:'aufwärts', abwaerts:'abwärts' };

// Beispielaufbauten (innen → außen). Schicht: [Typ, Baustoff aus BAUSTOFFE oder '', Name, d in cm,
// μ (optional, sonst Tabellenwert/-bereich), λ (optional, für eigene Baustoffe)]
const BEISPIELE = [
  { titel: 'Außenwand KS + WDVS (EPS 035)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz (1400)', '', 1.5], ['baustoff', 'Kalksandstein (1800)', '', 17.5],
    ['baustoff', 'EPS (Styropor) 035', '', 14], ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 1] ]},
  { titel: 'Außenwand Porenbeton monolithisch 36,5 cm', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz (1400)', '', 1], ['baustoff', 'Porenbeton-Planstein PP (350)', '', 36.5], ['baustoff', 'Leichtputz (≤ 1000)', '', 2] ]},
  { titel: 'Steildach Zwischensparren mit PE-Dampfbremse', f: { bauteil: 'steildach', 'inhom-aktiv': true, 'inhom-nr': '4',
      'inhom-name': 'Nadelholz / KVH (500)', 'inhom-lambda': '0.13', 'inhom-fa': '0.88', 'inhom-fb': '0.12' }, s: [
    ['baustoff', 'Gipskartonplatte (900)', '', 1.25], ['luft_ruhend', '', 'Installationsebene (ruhende Luft)', 2.5],
    ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015],
    ['baustoff', 'Mineralwolle (MW) 035', '', 20], ['baustoff', 'Holzfaserdämmplatte (WF) 045', '', 6, 5] ]},
  { titel: 'Steildach ohne Dampfbremse (Tauwasser!)', f: { bauteil: 'steildach', 'inhom-aktiv': true, 'inhom-nr': '3',
      'inhom-name': 'Nadelholz / KVH (500)', 'inhom-lambda': '0.13', 'inhom-fa': '0.88', 'inhom-fb': '0.12' }, s: [
    ['baustoff', 'Gipskartonplatte (900)', '', 1.25], ['luft_ruhend', '', 'Installationsebene (ruhende Luft)', 2.5],
    ['baustoff', 'Mineralwolle (MW) 035', '', 20], ['baustoff', 'Holzfaserdämmplatte (WF) 045', '', 6, 5] ]},
  { titel: 'Flachdach Warmdach (PUR/PIR)', f: { bauteil: 'flachdach' }, s: [
    ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 20], ['baustoff', 'Aluminiumfolie 0,05 mm (s_d = 1500 m)', '', 0.005],
    ['baustoff', 'PUR/PIR 024', '', 16], ['baustoff', 'Bitumenbahn mit Einlage (DIN EN 13707)', '', 0.8] ]},
  { titel: 'Innendämmung ohne Dampfbremse (Tauwasser!)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipskartonplatte (900)', '', 1.25], ['baustoff', 'Mineralwolle (MW) 035', '', 6],
    ['baustoff', 'Vollziegel (1800)', '', 24], ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 2] ]},
  // Fußbodenaufbauten über unbeheiztem Keller (oben = innen)
  { titel: 'Fußboden: Fliesen auf Heizestrich', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Fliesen, Keramik/Feinsteinzeug (2300)', '', 1], ['baustoff', 'Dünnbettmörtel / Fliesenkleber (1600)', '', 0.5],
    ['baustoff', 'Heizestrich (Zementestrich 2000)', '', 6.5], ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015],
    ['baustoff', 'Trittschalldämmung EPS-T 045', '', 3], ['baustoff', 'EPS (Styropor) 035', '', 10],
    ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 18] ]},
  { titel: 'Fußboden: Parkett auf Zementestrich', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Parkett Eiche (Laubholz 700)', '', 1.5], ['baustoff', 'Zementestrich (2000)', '', 5],
    ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015], ['baustoff', 'Mineralwolle (MW) 040', '', 3],
    ['baustoff', 'EPS (Styropor) 035', '', 10], ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 18] ]},
  { titel: 'Fußboden: Linoleum auf Calciumsulfat-Fließestrich', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Linoleum (1200)', '', 0.25], ['baustoff', 'Calciumsulfat-Fließestrich (2100)', '', 5],
    ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015], ['baustoff', 'Trittschalldämmung EPS-T 045', '', 3],
    ['baustoff', 'EPS (Styropor) 035', '', 10], ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 18] ]},
  { titel: 'Fußboden: PVC-Belag auf Zementestrich', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Kunststoffbelag, z.B. PVC (1700)', '', 0.2], ['baustoff', 'Zementestrich (2000)', '', 5],
    ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015], ['baustoff', 'Trittschalldämmung EPS-T 045', '', 3],
    ['baustoff', 'EPS (Styropor) 035', '', 10], ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 18] ]},
  { titel: 'Kellerdecke, unterseitig gedämmt', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Zementestrich (2000)', '', 5], ['baustoff', 'EPS (Styropor) 040', '', 3],
    ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 18], ['baustoff', 'Mineralwolle (MW) 035', '', 10] ]},
  // Rechenbeispiel nach DIN 4108-3 aus Schneider 26, S. 4.31 (belüftete Luftschicht und
  // Wetterschutzschale gehen nicht ein); MW mit λ = 0,040 und Dampfbremse wie im Buch
  { titel: 'Holzrahmenwand – Beispiel DIN 4108-3 (Schneider S. 4.31)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'OSB-Platte (650)', '', 1.9],
    ['baustoff', '', 'Dampfbremse (s_d = 2,00 m)', 0.005, 40000],
    ['baustoff', '', 'Mineralwolle 040 (λ = 0,040 wie im Buch)', 16, 1, 0.040],
    ['baustoff', 'OSB-Platte (650)', '', 1.9] ]},
  { titel: 'Altbau: Vollziegel ungedämmt', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 1.5], ['baustoff', 'Vollziegel (1800)', '', 24], ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 2] ]},
  // ── Vorlagen für Projekte (Dicken = Vorschlag, im Projekt anpassen; λ aus der Baustoff-Datenbank) ──
  { gruppe: 'Vorlagen', titel: 'Kellerbodenplatte ohne Fußbodenaufbau (Perimeterdämmung XPS)', f: { bauteil: 'kellerdecke', aussenseite: 'erdreich' }, s: [
    ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 25], ['baustoff', 'PE-Folie 0,25 mm (s_d = 100 m)', '', 0.025],
    ['baustoff', 'XPS 035', '', 12] ]},
  { gruppe: 'Vorlagen', titel: 'Kellerbodenplatte mit Fußbodenaufbau (Estrich, Dämmung, XPS unter Platte)', f: { bauteil: 'kellerdecke', aussenseite: 'erdreich' }, s: [
    ['baustoff', 'Zementestrich (2000)', '', 5], ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015],
    ['baustoff', 'Trittschalldämmung EPS-T 045', '', 3], ['baustoff', 'EPS (Styropor) 035', '', 8],
    ['baustoff', 'Bitumenbahn mit Einlage (DIN EN 13707)', '', 0.4], ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 25],
    ['baustoff', 'XPS 035', '', 12] ]},
  { gruppe: 'Vorlagen', titel: 'Etagendecke Stahlbeton mit Fußbodenaufbau (Wärmestrom ↓)', f: { bauteil: 'kellerdecke', aussenseite: 'innen' }, s: [
    ['baustoff', 'Zementestrich (2000)', '', 5], ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015],
    ['baustoff', 'Trittschalldämmung EPS-T 045', '', 3], ['baustoff', 'Stahlbeton (2300, 1 % Stahl)', '', 20],
    ['baustoff', 'Gipsputz (1000)', '', 1] ]},
  { gruppe: 'Vorlagen', titel: 'Außenwand KS + WDVS Mineralwolle (MW 035)', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz (1400)', '', 1.5], ['baustoff', 'Kalksandstein (1800)', '', 17.5],
    ['baustoff', 'Mineralwolle (MW) 035', '', 16], ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 1] ]},
  { gruppe: 'Vorlagen', titel: 'Außenwand KS + WDVS EPS 032', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz (1400)', '', 1.5], ['baustoff', 'Kalksandstein (1800)', '', 17.5],
    ['baustoff', 'EPS (Styropor) 032', '', 16], ['baustoff', 'Kunstharzputz (1100)', '', 0.5] ]},
  { gruppe: 'Vorlagen', titel: 'Außenwand zweischalig: KS, Kerndämmung MW 035, Verblender', f: { bauteil: 'aussenwand' }, s: [
    ['baustoff', 'Gipsputz (1400)', '', 1.5], ['baustoff', 'Kalksandstein (1800)', '', 17.5],
    ['baustoff', 'Mineralwolle (MW) 035', '', 14], ['baustoff', 'Vollklinker (1800)', '', 11.5] ]},
  { gruppe: 'Vorlagen', titel: 'Außenwand Holzständerwerk (KVH 6/16, e = 62,5 cm) mit Installationsebene und Dampfbremse', f: { bauteil: 'aussenwand', 'inhom-aktiv': true, 'inhom-nr': '5',
      'inhom-name': 'Nadelholz / KVH (500)', 'inhom-lambda': '0.13', 'inhom-fa': '0.904', 'inhom-fb': '0.096' }, s: [
    ['baustoff', 'Gipskartonplatte (900)', '', 1.25], ['luft_ruhend', '', 'Installationsebene (ruhende Luft)', 4],
    ['baustoff', 'OSB-Platte (650)', '', 1.8], ['baustoff', 'PE-Folie 0,15 mm (s_d = 50 m)', '', 0.015], ['baustoff', 'Mineralwolle (MW) 035', '', 16],
    ['baustoff', 'Holzfaserdämmplatte (WF) 040', '', 6], ['baustoff', 'Kalk-/Kalkzementputz (1800)', '', 1] ]},
];
// Fenster und Türen: U_w kommt aus Herstellerangabe bzw. DIN EN ISO 10077 (nicht über Schichten);
// zur Auswahl in der Übergabe an die Heizlast-App – die Quelle muss eingetragen werden.
const FENSTER_UW = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

// Baustoff-Datenbank
// lambda: Bemessungswert λ_B [W/(mK)] (null = keine Angabe, R wird vernachlässigt)
// mu / muMax: Richtwert der Wasserdampf-Diffusionswiderstandszahl (Tabellenbereich a/b);
//   laut Tafel-Fußnote ist jeweils der für die Baukonstruktion ungünstigere Wert zu wählen.
// sd + d: Folien mit s_d-Angabe [m] bei Dicke d [cm] – μ = s_d / d wird unten berechnet.
// q: 'Z' = abgeglichen mit Schneider Bautabellen 26, Tafel 4.33 (S. 4.33–4.42),
//    'G' = noch nicht abgeglichen (aus dem Gedächtnis, prüfen!)
const BAUSTOFFE = [
  // Dämmstoffe nach harmonisierten Normen: Name = Nennwert λ_D (Wärmeleitstufe),
  // gerechnet wird mit dem Bemessungswert λ_B (Schneider 26, Tafel 4.43, Fußnoten S. 4.45):
  // MW, EPS, XPS, PUR, PF, CG, EPB: λ_B = λ_D · 1,03, mind. + 1 mW/(mK); WF, Kork: · 1,05, mind. + 2 mW/(mK)
  { gruppe: 'Dämmstoffe', stoffe: [
    { name: 'Mineralwolle (MW) 032', lambdaD: 0.032, lambda: 0.033, mu: 1, q: 'Z', tafel: '4.43' },
    { name: 'Mineralwolle (MW) 035', lambdaD: 0.035, lambda: 0.036, mu: 1, q: 'Z', tafel: '4.43' },
    { name: 'Mineralwolle (MW) 040', lambdaD: 0.040, lambda: 0.041, mu: 1, q: 'Z', tafel: '4.43' },
    { name: 'EPS (Styropor) 032', lambdaD: 0.032, lambda: 0.033, mu: 20, muMax: 100, q: 'Z', tafel: '4.43' },
    { name: 'EPS (Styropor) 035', lambdaD: 0.035, lambda: 0.036, mu: 20, muMax: 100, q: 'Z', tafel: '4.43' },
    { name: 'EPS (Styropor) 040', lambdaD: 0.040, lambda: 0.041, mu: 20, muMax: 100, q: 'Z', tafel: '4.43' },
    { name: 'XPS 035', lambdaD: 0.035, lambda: 0.036, mu: 80, muMax: 250, q: 'Z', tafel: '4.43' },
    { name: 'XPS 040', lambdaD: 0.040, lambda: 0.041, mu: 80, muMax: 250, q: 'Z', tafel: '4.43' },
    { name: 'PUR/PIR 024', lambdaD: 0.024, lambda: 0.025, mu: 40, muMax: 200, q: 'Z', tafel: '4.43' },
    { name: 'PUR/PIR 028', lambdaD: 0.028, lambda: 0.029, mu: 40, muMax: 200, q: 'Z', tafel: '4.43' },
    { name: 'Phenolharz-Hartschaum (PF) 022', lambdaD: 0.022, lambda: 0.023, mu: 10, muMax: 60, q: 'Z', tafel: '4.43' },
    { name: 'Holzfaserdämmplatte (WF) 040', lambdaD: 0.040, lambda: 0.042, mu: 3, muMax: 5, q: 'Z', tafel: '4.43' },
    { name: 'Holzfaserdämmplatte (WF) 045', lambdaD: 0.045, lambda: 0.047, mu: 3, muMax: 5, q: 'Z', tafel: '4.43' },
    { name: 'Expandierter Kork (ICB) 040', lambdaD: 0.040, lambda: 0.042, mu: 5, muMax: 10, q: 'Z', tafel: '4.43' },
    { name: 'Holzwolle-Leichtbauplatte (WW) 090', lambdaD: 0.090, lambda: 0.095, mu: 2, muMax: 5, q: 'Z', tafel: '4.43' },
    { name: 'Blähperlit (EPB) 050', lambdaD: 0.050, lambda: 0.052, mu: 5, q: 'Z', tafel: '4.43' },
    { name: 'Schaumglas (CG) 050', lambdaD: 0.050, lambda: 0.052, mu: 1000000, dicht: true, sdHinweis: true, q: 'Z', tafel: '4.43' },
    { name: 'Trittschalldämmung EPS-T 045', lambdaD: 0.045, lambda: 0.046, mu: 20, muMax: 100, q: 'Z', tafel: '4.43' },
    { name: 'Zellulose-Einblasdämmung 040', lambda: 0.040, mu: 2, q: 'G' },
  ]},
  { gruppe: 'Mauerwerk', stoffe: [
    { name: 'Kalksandstein (1400)', lambda: 0.70, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Kalksandstein (1800)', lambda: 0.99, mu: 15, muMax: 25, q: 'Z' },
    { name: 'Kalksandstein (2000)', lambda: 1.1, mu: 15, muMax: 25, q: 'Z' },
    { name: 'Porenbeton-Planstein PP (350)', lambda: 0.11, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Porenbeton-Planstein PP (500)', lambda: 0.16, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Porenbeton-Planstein PP (600)', lambda: 0.19, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Vollziegel (1400)', lambda: 0.58, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Vollziegel (1800)', lambda: 0.81, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Hochlochziegel HLzA/B (700, Normalmörtel)', lambda: 0.36, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Hochlochziegel HLzA/B (700, Leichtmörtel LM21)', lambda: 0.31, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Hochlochziegel HLzW (700, Leichtmörtel LM21)', lambda: 0.21, mu: 5, muMax: 10, q: 'Z' },
    { name: 'Vollklinker (1800)', lambda: 0.81, mu: 50, muMax: 100, q: 'Z' },
  ]},
  { gruppe: 'Beton', stoffe: [
    { name: 'Normalbeton (2400, unbewehrt)', lambda: 2.0, mu: 80, muMax: 130, q: 'Z' },
    { name: 'Stahlbeton (2300, 1 % Stahl)', lambda: 2.3, mu: 80, muMax: 130, q: 'Z' },
    { name: 'Stahlbeton (2400, 2 % Stahl)', lambda: 2.5, mu: 80, muMax: 130, q: 'Z' },
    { name: 'Leichtbeton, geschlossenes Gefüge (1200)', lambda: 0.62, mu: 70, muMax: 150, q: 'Z' },
    { name: 'Leichtbeton, geschlossenes Gefüge (1600)', lambda: 1.00, mu: 70, muMax: 150, q: 'Z' },
  ]},
  { gruppe: 'Holz / Holzwerkstoffe', stoffe: [
    // holz: zulässige Erhöhung des massebezogenen Feuchtegehalts (Holz 5 %, Holzwerkstoffe 3 %, Abschn. 3.5.1)
    { name: 'Nadelholz / KVH (500)', lambda: 0.13, mu: 20, muMax: 50, rho: 500, holz: 0.05, q: 'Z' },
    { name: 'Laubholz (700)', lambda: 0.18, mu: 50, muMax: 200, rho: 700, holz: 0.05, q: 'Z' },
    { name: 'Sperrholz (500)', lambda: 0.13, mu: 70, muMax: 200, rho: 500, holz: 0.03, q: 'Z' },
    { name: 'OSB-Platte (650)', lambda: 0.13, mu: 30, muMax: 50, rho: 650, holz: 0.03, q: 'Z' },
    { name: 'Spanplatte (600)', lambda: 0.14, mu: 15, muMax: 50, rho: 600, holz: 0.03, q: 'Z' },
    { name: 'Holzfaserplatte / MDF (600)', lambda: 0.14, mu: 12, muMax: 20, rho: 600, holz: 0.03, q: 'Z' },
    { name: 'Holzfaserplatte (250)', lambda: 0.07, mu: 3, muMax: 5, rho: 250, holz: 0.03, q: 'Z' },
  ]},
  { gruppe: 'Putze / Mörtel / Estriche', stoffe: [
    { name: 'Kalk-/Kalkzementputz (1800)', lambda: 1.0, mu: 15, muMax: 35, q: 'Z' },
    { name: 'Gipsputz (1000)', lambda: 0.34, mu: 4, muMax: 10, q: 'Z' },
    { name: 'Gipsputz (1400)', lambda: 0.51, mu: 4, muMax: 10, q: 'Z' },
    { name: 'Leichtputz (≤ 1000)', lambda: 0.38, mu: 15, muMax: 20, q: 'Z' },
    { name: 'Wärmedämmputz T1', lambda: 0.12, mu: 5, muMax: 20, q: 'Z' },
    { name: 'Kunstharzputz (1100)', lambda: 0.70, mu: 50, muMax: 200, q: 'Z' },
    { name: 'Zementestrich (2000)', lambda: 1.40, mu: 15, muMax: 35, q: 'Z' },
    { name: 'Anhydritestrich (2100)', lambda: 1.20, mu: 15, muMax: 35, q: 'Z' },
    { name: 'Calciumsulfat-Fließestrich (2100)', lambda: 1.4, mu: 15, muMax: 35, q: 'Z' },
  ]},
  { gruppe: 'Platten / Bekleidungen', stoffe: [
    { name: 'Gipskartonplatte (700)', lambda: 0.21, mu: 4, muMax: 10, q: 'Z' },
    { name: 'Gipskartonplatte (900)', lambda: 0.25, mu: 4, muMax: 10, q: 'Z' },
    { name: 'Gipsfaserplatte (GF)', lambda: 0.32, mu: 13, q: 'G' },
  ]},
  { gruppe: 'Folien / Bahnen', stoffe: [
    { name: 'PE-Folie 0,15 mm (s_d = 50 m)', lambda: null, sd: 50, d: 0.015, q: 'Z' },
    { name: 'PE-Folie 0,25 mm (s_d = 100 m)', lambda: null, sd: 100, d: 0.025, q: 'Z' },
    { name: 'Aluminiumfolie 0,05 mm (s_d = 1500 m)', lambda: null, sd: 1500, d: 0.005, q: 'Z' },
    { name: 'Aluminiumverbundfolie 0,4 mm (s_d = 10 m)', lambda: null, sd: 10, d: 0.04, q: 'Z' },
    { name: 'Bituminiertes Papier 0,1 mm (s_d = 2 m)', lambda: null, sd: 2, d: 0.01, q: 'Z' },
  ]},
  // Abdichtungen: Tafel 4.33 Nr. 6.2/6.5 (Z); Vlies und Dampfdruckausgleichsschicht stehen
  // nicht in der Tafel → ungeprüft bzw. Herstellerangabe (herst: μ muss eingetragen werden)
  { gruppe: 'Abdichtungen / Dachbahnen', stoffe: [
    { name: 'Bitumenbahn mit Einlage (DIN EN 13707)', lambda: 0.17, mu: 20000, d: 0.4, q: 'Z' },
    { name: 'Nackte Bitumenbahn (DIN 52129)', lambda: 0.17, mu: 2000, muMax: 20000, d: 0.2, q: 'Z' },
    { name: 'Bitumen (als Stoff, z.B. Anstrich)', lambda: 0.17, mu: 50000, q: 'Z' },
    { name: 'Dampfdruckausgleichsschicht (Lochglasvlies-Bitumenbahn)', lambda: 0.17, d: 0.3, herst: true, q: 'G' },
    { name: 'Schutz-/Trennvlies (diffusionsoffen)', lambda: null, mu: 1, d: 0.3, q: 'G' },
  ]},
  // Gründach: lose Schüttungen (Tafel 4.33 Nr. 7.1, μ 3) und Erdreich naturfeucht (Nr. 7.7, μ 50).
  // Schneider 26, Abschn. 3.5.2: Glaser-Verfahren bei begrünten Dächern nicht anwendbar.
  // Fußboden: Beläge Tafel 4.33 Nr. 6.1, Fliesen Nr. 7.2, Estriche Nr. 1.3, Holz Nr. 5,
  // Dünnbettmörtel Nr. 1.2 (als Fliesenkleber); übliche Dicke d als Vorschlag
  { gruppe: 'Fußboden: Beläge und Estriche', stoffe: [
    { name: 'Fliesen, Keramik/Feinsteinzeug (2300)', lambda: 1.3, mu: 1000000, dicht: true, d: 1.0, q: 'Z' },
    { name: 'Dünnbettmörtel / Fliesenkleber (1600)', lambda: 1.0, mu: 15, muMax: 35, d: 0.5, q: 'Z' },
    { name: 'Parkett Eiche (Laubholz 700)', lambda: 0.18, mu: 50, muMax: 200, d: 1.5, rho: 700, holz: 0.05, q: 'Z' },
    { name: 'Dielen Nadelholz (500)', lambda: 0.13, mu: 20, muMax: 50, d: 2.4, rho: 500, holz: 0.05, q: 'Z' },
    { name: 'Linoleum (1200)', lambda: 0.17, mu: 800, muMax: 1000, d: 0.25, q: 'Z' },
    { name: 'Kunststoffbelag, z.B. PVC (1700)', lambda: 0.25, mu: 10000, d: 0.2, q: 'Z' },
    { name: 'Gummibelag (1200)', lambda: 0.17, mu: 10000, d: 0.3, q: 'Z' },
    { name: 'Teppich/Teppichboden (200)', lambda: 0.06, mu: 5, d: 0.8, q: 'Z' },
    { name: 'Korkfliesen (> 400)', lambda: 0.065, mu: 20, muMax: 40, d: 0.4, q: 'Z' },
    { name: 'Korkunterlage (< 200)', lambda: 0.05, mu: 10, muMax: 20, d: 0.3, q: 'Z' },
    { name: 'Heizestrich (Zementestrich 2000)', lambda: 1.40, mu: 15, muMax: 35, d: 6.5, q: 'Z' },
    { name: 'Calciumsulfat-Fließestrich als Heizestrich (2100)', lambda: 1.4, mu: 15, muMax: 35, d: 5, q: 'Z' },
    { name: 'Magnesiaestrich (1400)', lambda: 0.47, mu: 15, muMax: 35, d: 4, q: 'Z' },
    { name: 'Gussasphaltestrich (2300)', lambda: 0.90, mu: 1000000, dicht: true, sdHinweis: true, d: 3, q: 'Z' },
  ]},
  { gruppe: 'Gründach / Schüttungen', stoffe: [
    { name: 'Blähton/Blähschiefer-Schüttung (≤ 400)', lambda: 0.16, mu: 3, gruendach: true, q: 'Z' },
    { name: 'Bimskies-Schüttung (≤ 1000)', lambda: 0.19, mu: 3, gruendach: true, q: 'Z' },
    { name: 'Schaumlava-Schüttung (≤ 1200)', lambda: 0.22, mu: 3, gruendach: true, q: 'Z' },
    { name: 'Sand, Kies, Splitt trocken (1800)', lambda: 0.70, mu: 3, gruendach: true, q: 'Z' },
    { name: 'Erdreich naturfeucht: Sand und Kies', lambda: 2.0, mu: 50, gruendach: true, q: 'Z' },
    { name: 'Erdreich naturfeucht: Ton, Schlick', lambda: 1.5, mu: 50, gruendach: true, q: 'Z' },
    // Wurzelschutzbahnen: Werkstoffkennwerte aus Tafel 4.33 Nr. 6.2–6.5 (übliche Dicke d als Vorschlag)
    { name: 'Wurzelschutzbahn PE (hohe Rohdichte)', lambda: 0.50, mu: 100000, d: 0.1, gruendach: true, q: 'Z' },
    { name: 'Wurzelschutzbahn PVC-P (weich)', lambda: 0.14, mu: 100000, d: 0.15, gruendach: true, q: 'Z' },
    { name: 'Wurzelschutzbahn EPDM', lambda: 0.25, mu: 6000, d: 0.12, gruendach: true, q: 'Z' },
    { name: 'Wurzelschutzbahn Bitumen (mit Einlage)', lambda: 0.17, mu: 20000, d: 0.4, gruendach: true, q: 'Z' },
  ]},
];
// Folien mit s_d-Angabe: μ so, dass bei der Tabellendicke genau s_d herauskommt
BAUSTOFFE.forEach(g => g.stoffe.forEach(s => { if (s.sd) s.mu = Math.round(s.sd / (s.d / 100)); }));

// Feuchteschutz: Glaser-Verfahren nach DIN 4108-3 – Z (Schneider 26, Tafel 4.29b, Tafel 4.4a,
// Abschnitt 3.5.1, Tafel 4.30, Abschnitt 3.2)
// Tauperiode Dez.–Feb., 90 d = 2160 h: innen 20 °C / 50 % (1168 Pa), außen −5 °C / 80 % (321 Pa)
// Verdunstungsperiode Juni–Aug., 90 d: p_i = p_e = 1200 Pa; im Tauwasserbereich p_s = 1700 Pa
// (Außenwände, Decken gegen Dachraum) bzw. 2000 Pa (Dächer). R_si = 0,25, R_se = 0,04.
// Grenzwerte: M_c ≤ M_ev; M_c ≤ 1,0 kg/m² (0,5 kg/m² an kapillar nicht wasseraufnahmefähigen Schichten).
const GLASER = {
  rsi: 0.25, rse: 0.04,
  tau: { ti: 20, phiI: 0.50, te: -5, phiE: 0.80, stunden: 2160 },
  verd: { pI: 1200, pE: 1200, psWand: 1700, psDach: 2000, stunden: 2160 },
  delta0: 2.0e-10,       // Wasserdampf-Diffusionsleitkoeffizient der Luft [kg/(m·s·Pa)] – Z (Abschn. 3.2)
  mcMax: 1.0, mcMaxNichtKapillar: 0.5
};
