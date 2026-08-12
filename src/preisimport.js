// Preislisten-Import: TG-CSV gegen den CALKU-Artikelstamm.
//
// Bis August 2026 aktualisierte der Import nur die Zutatenpreis-Kopien in den
// Rezepturen, nie den Artikelstamm (priceList) - und matchte dabei ueber den
// exakten Zutatennamen, obwohl die CSV Handelsbezeichnungen fuehrt. Ergebnis:
// Susannes Wochen-Upload kam nie an, der Stamm blieb auf dem Ur-Import von
// Maerz 2025 stehen (Bochum-Erstbestellung, 11.08.2026).
//
// Neu: Matching primaer ueber die normalisierte Artikelnummer, Name nur als
// Rueckfall (exakt, KEIN Fuzzy - die Tomatenwuerfel-Lehre). Ein Treffer
// aktualisiert den Artikel selbst (inkl. Pruefdatum), die Rezepturen werden
// vom Aufrufer durchgestempelt. Alles ohne Treffer kommt als Liste zurueck -
// das ist Susannes Nachpflegeliste.

/** "810035.0" -> "810035"; fuehrende Nullen und Leerraum weg; nie null. */
export function normalisiereNummer(wert) {
  if (wert == null) return "";
  let s = String(wert).trim();
  if (/^\d+([.,]0+)?$/.test(s)) s = s.replace(/[.,]0+$/, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s.toLowerCase();
}

/** Preisfelder eines Artikels proportional auf den neuen Gebindepreis ziehen. */
function skaliere(artikel, neuerGebindepreis) {
  const alt = +artikel.package_price || 0;
  const neu = { ...artikel, package_price: neuerGebindepreis };
  if (alt > 0) {
    const f = neuerGebindepreis / alt;
    for (const feld of ["price_per_gram_ml", "net_price_per_unit", "gross_price"]) {
      if (+neu[feld] > 0) neu[feld] = +(+neu[feld] * f).toFixed(10);
    }
    return { artikel: neu, pruefen: false };
  }
  // Kein alter Gebindepreis: nur bei Masseneinheit sauber ableitbar.
  const groesse = +artikel.package_size || 0;
  const einheit = String(artikel.unit || "").toLowerCase();
  if (groesse > 0 && ["g", "kg", "ml", "l", "kiste"].includes(einheit)) {
    const inGramm = ["kg", "l"].includes(einheit) ? groesse * 1000 : groesse;
    neu.price_per_gram_ml = +(neuerGebindepreis / inGramm).toFixed(10);
    return { artikel: neu, pruefen: false };
  }
  return { artikel: neu, pruefen: true };
}

/**
 * Kernfunktion, pur und ohne React: rechnet den Import durch.
 *
 * @param zeilen     [{name, preis, artNr}] aus dem Import-Modal (preis: Zahl)
 * @param priceList  { key(lowercase ingredient_name): Artikel }
 * @param semantik   "gebinde" (TG-Artikelliste, Kundenpreis je VE - Standard)
 *                   | "grundpreis" (EUR je kg/l, alte Listenform)
 * @param heute      Date fuer den Pruefstempel
 * @returns { patches: {key: neuerArtikel}, geaendert, unveraendert,
 *            ohneMatch: [zeile], pruefen: [name], veraltet: [artikel] }
 */
export function verarbeitePreisimport({ zeilen, priceList, semantik = "gebinde", heute = new Date() }) {
  const stempel = `${heute.toISOString().slice(0, 10)} 00:00:00`;

  // Indexe ueber den Stamm: Nummer -> key, Name -> key
  const jeNummer = {};
  const jeName = {};
  for (const [key, a] of Object.entries(priceList)) {
    const nr = normalisiereNummer(a.article_number);
    if (nr && !/^z\d+$/.test(nr)) jeNummer[nr] = key; // Z-Platzhalter nicht matchbar
    jeName[String(a.ingredient_name || "").trim().toLowerCase()] = key;
  }

  const patches = {};
  const ohneMatch = [];
  const pruefen = [];
  const nummernInCsv = new Set();
  let geaendert = 0;
  let unveraendert = 0;

  for (const zeile of zeilen) {
    const nr = normalisiereNummer(zeile.artNr);
    if (nr) nummernInCsv.add(nr);
    const key = (nr && jeNummer[nr]) || jeName[String(zeile.name || "").trim().toLowerCase()];
    if (!key) {
      ohneMatch.push(zeile);
      continue;
    }
    const basis = patches[key] || priceList[key];
    const gebindepreis = semantik === "grundpreis"
      ? berechneGebindepreisAusGrundpreis(basis, zeile.preis)
      : +zeile.preis;
    if (gebindepreis == null || !(gebindepreis > 0)) {
      ohneMatch.push(zeile);
      continue;
    }
    if (Math.abs((+basis.package_price || 0) - gebindepreis) < 0.0005) {
      unveraendert++;
      patches[key] = { ...basis, date_last_checked: stempel };
      continue;
    }
    const { artikel, pruefen: p } = skaliere(basis, gebindepreis);
    artikel.date_last_checked = stempel;
    patches[key] = artikel;
    geaendert++;
    if (p) pruefen.push(artikel.ingredient_name);
  }

  // Stammartikel, deren Nummer in der CSV fehlt: Kandidaten fuer veraltete
  // Nummern. Nur aussagekraeftig, wenn die CSV ueberhaupt Nummern trug.
  const veraltet = [];
  if (nummernInCsv.size > 0) {
    for (const a of Object.values(priceList)) {
      const nr = normalisiereNummer(a.article_number);
      if (!nr || /^z\d+$/.test(nr)) continue; // Platzhalter melden wir nicht
      if (!nummernInCsv.has(nr)) veraltet.push(a);
    }
  }

  return { patches, geaendert, unveraendert, ohneMatch, pruefen, veraltet };
}

// ===========================================================================
//  SPALTENERKENNUNG - nach INHALT, nicht nach Kopfzeile
//
//  Bis August 2026 wurde die Kopfzeile gegen eine Kandidatenliste geprueft.
//  Zwei Fehler daran, beide live aufgetreten:
//    1. Susannes Export nennt die Beschreibung "Artikeltext1" - stand auf
//       keiner Liste, das Pflichtfeld blieb leer, der Knopf war grau, ohne
//       jede Erklaerung.
//    2. Ihre Datei fuehrt drei Spalten, die mit "Preis" beginnen: den echten
//       Preis, "Preis Herkunft" (nur der Buchstabe v) und "Preis gueltig von"
//       (ein Datum). Getroffen wurde die erste mit "preis" im Kopf - richtig
//       nur durch die Spaltenreihenfolge. Ein anderer Export haette
//       kommentarlos ein "v" als Preis importiert.
//
//  Jetzt entscheidet, was in der Spalte STEHT. Die Kopfzeile gibt nur noch
//  einen Bonus - und der greift erst, wenn der Inhalt die Rolle ohnehin
//  traegt. Eine Spalte, deren Inhalt der Rolle widerspricht, kann also nie
//  ueber ihren Namen gewinnen.
// ===========================================================================

const STICHPROBE = 200;      // Zeilen, die wir anschauen - reicht fuer ein Profil
const KOPF_BONUS = 0.3;      // Zuschlag fuer eine passende Kopfzeile

const RX_ARTNR      = /^\d{4,8}([.,]0+)?$/;      // 810035 / 810035.0
const RX_DEZIMAL    = /^\d{1,7}([.,]\d{1,4})?$/; // 6,38 / 6.38 / 12 - Datum faellt raus
const RX_NACHKOMMA  = /^\d{1,7}[.,]\d{1,4}$/;
const RX_ZWEISTELLIG= /^\d{1,7}[.,]\d{2}$/;      // typische Preisschreibweise
const RX_KURZ_ALPHA = /^[A-Za-zÄÖÜäöüß./]{1,4}$/;

// Gaengige Mengeneinheiten aus TG-Listen und CALKU-Stamm
const EINHEITEN = new Set([
  "pg", "kg", "st", "stk", "stck", "lt", "l", "ml", "g", "be", "ki", "ka",
  "kar", "fl", "do", "eh", "pk", "ve", "btl", "bd", "ea", "ct", "sk", "eim",
]);

const klemme = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Bis zu STICHPROBE Zeilen einer Spalte einsammeln, Leerwerte weg. */
function spaltenWerte(zeilen, spalte) {
  const out = [];
  const bis = Math.min(zeilen.length, STICHPROBE);
  for (let i = 0; i < bis; i++) {
    const roh = zeilen[i] ? zeilen[i][spalte] : null;
    if (roh == null) continue;
    const s = String(roh).trim();
    if (s) out.push(s);
  }
  return out;
}

/** Inhaltsprofil einer Spalte: nur Kennzahlen, keine Rollen-Meinung. */
function profiliere(werte) {
  const n = werte.length;
  if (n === 0) {
    return { n: 0, artNr: 0, dezimal: 0, nachkomma: 0, zwei: 0,
             kurzAlpha: 0, einheiten: 0, distinktQuote: 0, wenigDistinkt: 0,
             mittlereLaenge: 0, zifferAnteil: 1 };
  }
  let artNr = 0, dezimal = 0, nachkomma = 0, zwei = 0, kurzAlpha = 0, einheiten = 0;
  let laenge = 0, ziffern = 0, zeichen = 0;
  const gesehen = new Set();
  for (const w of werte) {
    gesehen.add(w.toLowerCase());
    if (RX_ARTNR.test(w)) artNr++;
    if (RX_DEZIMAL.test(w) && parseFloat(w.replace(",", ".")) > 0) {
      dezimal++;
      if (RX_NACHKOMMA.test(w)) nachkomma++;
      if (RX_ZWEISTELLIG.test(w)) zwei++;
    }
    if (RX_KURZ_ALPHA.test(w)) kurzAlpha++;
    if (EINHEITEN.has(w.toLowerCase())) einheiten++;
    laenge += w.length;
    zeichen += w.length;
    ziffern += (w.match(/\d/g) || []).length;
  }
  const distinkt = gesehen.size;
  return {
    n,
    artNr: artNr / n,
    dezimal: dezimal / n,
    nachkomma: nachkomma / n,
    zwei: zwei / n,
    kurzAlpha: kurzAlpha / n,
    einheiten: einheiten / n,
    distinktQuote: distinkt / n,
    wenigDistinkt: distinkt <= 10 ? 1 : distinkt <= 20 ? 0.5 : 0,
    mittlereLaenge: laenge / n,
    zifferAnteil: zeichen ? ziffern / zeichen : 0,
  };
}

// Rollen in der Reihenfolge ihrer Trennschaerfe: die Artikelnummer ist am
// eindeutigsten zu erkennen, der Name am unschaerfsten - also kommt er zuletzt
// und nimmt, was uebrig ist.
const ROLLEN = [
  {
    feld: "artNr",
    schwelle: 0.6,
    kopf: /artikelnr|artikelnummer|art\.?\s?-?\s?nr|artnr|nummer|^artikel$/,
    // Glatte 4- bis 8-stellige Ganzzahlen, moeglichst alle verschieden.
    punkte: (p) => 0.75 * p.artNr + 0.25 * p.distinktQuote,
  },
  {
    feld: "preis",
    schwelle: 0.6,
    kopf: /preis|price|(^|[^a-z])(vk|ek)([^a-z]|$)/,
    // Positive Dezimalzahl, mit Nachkommastellen, am liebsten genau zwei.
    // Ein "v" oder ein Datum kommt damit nie ueber null; die Gebindegroesse
    // ("12,000") bleibt unter der echten Preisspalte.
    punkte: (p) => 0.45 * p.dezimal + 0.25 * p.nachkomma + 0.3 * p.zwei,
  },
  {
    feld: "einheit",
    schwelle: 0.55,
    kopf: /einheit|unit|vpe|gebinde|vkp|(^|[^a-z])me([^a-z]|$)/,
    // Wenige, kurze, buchstabige Kuerzel - idealerweise bekannte Einheiten.
    punkte: (p) => 0.5 * p.kurzAlpha + 0.2 * p.wenigDistinkt + 0.3 * p.einheiten,
  },
  {
    feld: "name",
    schwelle: 0.35,
    kopf: /artikelkurztext|kurztext|bezeichnung|artikeltext|artikelname|(^|[^a-z])name|text/,
    // Langer, weitgehend ziffernfreier, unterschiedlicher Text.
    punkte: (p) => 0.5 * klemme((p.mittlereLaenge - 5) / 25)
                 + 0.3 * p.distinktQuote
                 + 0.2 * (1 - p.zifferAnteil),
  },
];

/**
 * Spalten einer eingelesenen CSV den Importfeldern zuordnen - inhaltsbasiert.
 *
 * @param cols   Spaltennamen in Dateireihenfolge
 * @param zeilen geparste Datenzeilen ([{spalte: wert}])
 * @returns { name, preis, einheit, artNr } - je ein Spaltenname oder ""
 */
export function erkenneSpalten(cols, zeilen) {
  const spalten = Array.isArray(cols) ? cols : [];
  const daten = Array.isArray(zeilen) ? zeilen : [];
  const ergebnis = { name: "", preis: "", einheit: "", artNr: "" };
  if (!spalten.length || !daten.length) return ergebnis;

  const profile = new Map();
  for (const c of spalten) profile.set(c, profiliere(spaltenWerte(daten, c)));

  const belegt = new Set(); // jede Spalte hoechstens einmal
  for (const rolle of ROLLEN) {
    let beste = "", bestePunkte = 0;
    for (const c of spalten) {
      if (belegt.has(c)) continue;
      const p = profile.get(c);
      if (!p.n) continue;
      const inhalt = rolle.punkte(p);
      // Der Kopfzeilen-Bonus greift erst oberhalb der Inhaltsschwelle - ein
      // schoener Name rettet keine Spalte, deren Inhalt nicht passt.
      if (inhalt < rolle.schwelle) continue;
      const gesamt = inhalt + (rolle.kopf.test(c.toLowerCase()) ? KOPF_BONUS : 0);
      if (gesamt > bestePunkte) { bestePunkte = gesamt; beste = c; }
    }
    if (beste) { ergebnis[rolle.feld] = beste; belegt.add(beste); }
  }
  return ergebnis;
}

/**
 * Stabiler Schluessel fuer eine Dateiform: gleiche Spalten in anderer
 * Reihenfolge ergeben dieselbe Signatur, eine zusaetzliche Spalte nicht.
 * Darunter merkt sich die App die zuletzt genutzte Zuordnung.
 */
export function spaltenSignatur(cols) {
  return (Array.isArray(cols) ? cols : [])
    .map(c => String(c == null ? "" : c).trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort()
    .join("|");
}

/** Grundpreis (EUR/kg bzw. EUR/l) in den Gebindepreis des Artikels umrechnen. */
function berechneGebindepreisAusGrundpreis(artikel, grundpreis) {
  const groesse = +artikel.package_size || 0;
  const einheit = String(artikel.unit || "").toLowerCase();
  if (!(grundpreis > 0) || groesse <= 0) return null;
  if (["kg", "l"].includes(einheit)) return +(grundpreis * groesse).toFixed(4);
  if (["g", "ml"].includes(einheit)) return +((grundpreis / 1000) * groesse).toFixed(4);
  return null; // Stueckartikel haben keinen kg-Grundpreis
}
