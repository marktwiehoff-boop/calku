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

/** Grundpreis (EUR/kg bzw. EUR/l) in den Gebindepreis des Artikels umrechnen. */
function berechneGebindepreisAusGrundpreis(artikel, grundpreis) {
  const groesse = +artikel.package_size || 0;
  const einheit = String(artikel.unit || "").toLowerCase();
  if (!(grundpreis > 0) || groesse <= 0) return null;
  if (["kg", "l"].includes(einheit)) return +(grundpreis * groesse).toFixed(4);
  if (["g", "ml"].includes(einheit)) return +((grundpreis / 1000) * groesse).toFixed(4);
  return null; // Stueckartikel haben keinen kg-Grundpreis
}
