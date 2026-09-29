// Welcher Einkaufsartikel steckt hinter einer Rezeptzeile?
//
// Bis 09/2026 nur der exakte Name: "Oreo Cookies (154g)" in der Rezeptur = Artikel gleichen
// Namens. Rezeptzeilen mit Kuechennamen ("Salatmix", "Hähnchen") erreichte damit weder der
// Preisimport noch eine Preisaenderung im Tab Einkaufspreise - obwohl der Zutatenstamm (E11)
// sie ueber artikel_nr laengst mit dem Artikel verknuepft. Jetzt:
//   1. Name der Zeile = Artikelname (wie bisher)
//   2. sonst: Zutat der Zeile (zutat_id, Name/Alias) -> artikel_nr -> Artikel mit dieser Nummer
//
// Pur und ohne React - Tests in artikelzuordnung.test.js.
import { normalisiereNummer } from "./preisimport.js";
import { stammIndex, findeZutat } from "./zutaten.js";

/** Index einmal bauen, dann je Zeile nachschlagen (Rezepturen haben Hunderte Zeilen). */
export function baueZuordnung(priceList = {}, zutaten = []) {
  const jeNummer = new Map();
  for (const [key, a] of Object.entries(priceList)) {
    const nr = normalisiereNummer(a?.article_number);
    if (nr && !/^z\d+$/.test(nr) && !jeNummer.has(nr)) jeNummer.set(nr, key);
  }
  return { priceList, zutaten, jeNummer, stamm: stammIndex(zutaten) };
}

/** Schluessel des Artikels einer Rezeptzeile in priceList, oder null. */
export function artikelKey(zeile, zuordnung) {
  const name = String(zeile?.name ?? "").trim().toLowerCase();
  if (name && zuordnung.priceList[name]) return name;
  const zutat = findeZutat(zuordnung.zutaten, zeile ?? {}, zuordnung.stamm);
  const nr = normalisiereNummer(zutat?.artikel_nr);
  return (nr && zuordnung.jeNummer.get(nr)) || null;
}
