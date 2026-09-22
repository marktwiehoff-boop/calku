// Artikelart je Verkaufsartikel: Pflichtartikel (jede Filiale fuehrt ihn)
// oder Zusatzartikel (optional im Sortiment). Das Feld heisst am Produkt
// `artikelart` und traegt "pflicht" | "zusatz"; fehlt es, ist der Artikel
// noch nicht gekennzeichnet - die App zeigt das an, bis jemand entscheidet.
// Bowl-Varianten (produkte_aufgeloest) erben die Art ihres Grundrezepts.
export const ARTIKELARTEN = [
  { key: "pflicht", label: "Pflichtartikel", kurz: "Pflicht" },
  { key: "zusatz",  label: "Zusatzartikel",  kurz: "Zusatz" },
];
export const ARTIKELART = Object.fromEntries(ARTIKELARTEN.map(a => [a.key, a]));

// Tolerante Lesart fuer Importe und alte Staende: "Pflichtartikel", "P",
// "pflicht", "Zusatz", "optional", "Z" ... - alles andere bleibt ungesetzt.
export function normalisiereArtikelart(wert) {
  if (wert == null) return null;
  const w = String(wert).trim().toLowerCase();
  if (!w) return null;
  if (w === "p" || w.startsWith("pflicht") || w === "muss" || w === "standard") return "pflicht";
  if (w === "z" || w.startsWith("zusatz") || w === "optional" || w === "option") return "zusatz";
  return null;
}

export const artikelartVon = (p) => normalisiereArtikelart(p && p.artikelart);

// Naechste Art beim Klick auf das Kennzeichen: leer -> Pflicht -> Zusatz -> Pflicht
export function naechsteArtikelart(aktuell) {
  return artikelartVon({ artikelart: aktuell }) === "pflicht" ? "zusatz" : "pflicht";
}

// Produkte ohne Kennzeichnung (Grundrezepte, keine abgeleiteten Varianten)
export function ohneArtikelart(produkte) {
  return (produkte || []).filter(p => !p.basis_produkt_id && !artikelartVon(p));
}
