// Einkaufspreis eines Artikels von Hand aendern (Tab Einkaufspreise).
//
// Der Artikelstamm (priceList) traegt je Artikel Packungsgroesse, Einheit,
// Packungspreis und den daraus abgeleiteten Preis je Gramm/ml
// (price_per_gram_ml) - und DER steht in jeder Rezeptzeile als preis_pro_g.
// Bis 09/2026 liess sich ein Artikel nur loeschen oder per CSV-Import
// ueberschreiben; ein falsch erfasstes Gebinde (Sesam Tofu: 200 g fuer
// 21,44 EUR = 107,20 EUR/kg, tatsaechlich ein 2-kg-Karton) blieb stehen und
// verzerrte jede Bowl damit. Hier: Aenderung eines Feldes, alles Abhaengige
// wird nachgezogen, der Aufrufer stempelt den neuen Preis in die Rezepturen.
//
// Pur und ohne React, damit es testbar bleibt (wie preisimport.js).

const MASSE = { g: 1, ml: 1, kg: 1000, l: 1000, kiste: 1 };
export const STUECK_EINHEITEN = new Set(["stück", "stueck", "stk", "stk.", "st", "st.", "stck"]);

/** Packungsgroesse in Gramm/ml, oder null bei Stueck/unbekannter Einheit. */
export function packungInGramm(artikel) {
  const groesse = +(artikel && artikel.package_size) || 0;
  const einheit = String((artikel && artikel.unit) || "").toLowerCase();
  if (groesse <= 0 || !(einheit in MASSE)) return null;
  return groesse * MASSE[einheit];
}

function istStueck(artikel) {
  const basis = artikel && artikel.preisbasis;
  if (basis) return basis === "stueck";
  return STUECK_EINHEITEN.has(String((artikel && artikel.unit) || "").toLowerCase());
}

/** Preis je Stueck eines Stueck-Artikels (Packungspreis / Stueck je Packung). */
export function stueckpreisVon(artikel) {
  if (!istStueck(artikel)) return null;
  const preis = +(artikel && artikel.package_price) || 0;
  const anzahl = +(artikel && artikel.package_size) || 1;
  return preis > 0 ? preis / Math.max(1, anzahl) : null;
}

/** Preis je Gramm aus Packung ableiten; null, wenn das nicht sauber geht. */
export function preisProGrammAusPackung(artikel) {
  const preis = +(artikel && artikel.package_price) || 0;
  if (preis <= 0) return null;
  if (istStueck(artikel)) {
    const gewicht = +(artikel && artikel.gewicht_je_stueck_g) || 0;
    const jeStueck = stueckpreisVon(artikel);
    return gewicht > 0 && jeStueck != null ? jeStueck / gewicht : null;
  }
  const gramm = packungInGramm(artikel);
  return gramm ? preis / gramm : null;
}

const PREISFELDER = ["unit", "package_size", "package_price", "price_per_gram_ml"];

/** Enthaelt der Patch ein Feld, das den Einkaufspreis betrifft? */
export function istPreisPatch(patch) {
  return !!patch && PREISFELDER.some(f => f in patch);
}

/**
 * Artikel mit einem Preis-Patch neu rechnen.
 *
 * patch: { unit?, package_size?, package_price?, price_per_gram_ml? }
 *   - price_per_gram_ml gesetzt (Kilopreis direkt eingetippt): gilt so; ist
 *     die Packung in Gramm bekannt, wird der Packungspreis passend gezogen,
 *     damit beides zusammenpasst.
 *   - sonst (Einheit, Groesse oder Packungspreis geaendert): Preis je Gramm
 *     aus der Packung ableiten. Geht das nicht (Stueck ohne Gewicht), bleibt
 *     der alte Preis je Gramm stehen - lieber ein alter als ein erfundener.
 * Rueckgabe: { artikel, proGAlt, proGNeu, geaendert }
 */
export function artikelPreisAendern(artikel, patch, heute = new Date()) {
  const alt = artikel || {};
  const proGAlt = +alt.price_per_gram_ml || 0;
  const neu = { ...alt };
  for (const f of PREISFELDER) {
    if (!(f in (patch || {}))) continue;
    const wert = patch[f];
    if (f === "unit") neu.unit = String(wert || "").trim() || alt.unit;
    else neu[f] = Math.max(0, +wert || 0);
  }

  if ("price_per_gram_ml" in (patch || {}) && neu.price_per_gram_ml > 0) {
    const gramm = packungInGramm(neu);
    if (gramm) neu.package_price = +(neu.price_per_gram_ml * gramm).toFixed(4);
  } else {
    const proG = preisProGrammAusPackung(neu);
    if (proG != null) neu.price_per_gram_ml = +proG.toFixed(10);
  }

  const proGNeu = +neu.price_per_gram_ml || 0;
  const geaendert = Math.abs(proGNeu - proGAlt) > 1e-12
    || neu.package_price !== alt.package_price
    || neu.package_size !== alt.package_size
    || neu.unit !== alt.unit;
  if (geaendert) {
    // Pruefstempel wie beim CSV-Import, plus Herkunft - damit der naechste
    // Import den Artikel nicht als "veraltet" meldet und man sieht, dass hier
    // jemand von Hand eingegriffen hat.
    const tag = heute.toISOString().slice(0, 10);
    neu.date_last_checked = `${tag} 00:00:00`;
    neu.preis_manuell_am = tag;
  }
  return { artikel: neu, proGAlt, proGNeu, geaendert };
}
