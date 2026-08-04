// Reine Bon-Logik (ohne React). Einzige Stelle, an der ein Produktionsbon entsteht.
// Vorschau, Kopieren und Export nutzen alle renderBon().

export const BON_BREITE = 42; // Zeichen je Zeile, 80-mm-Thermodrucker

// Bricht einen Text auf die Bonbreite um. Folgezeilen bekommen den Einzug
// vorangestellt, damit fortgesetzte Zutaten/Schritte optisch eingerueckt sind.
export function wrapZeile(text, breite = BON_BREITE, einzug = "") {
  const roh = String(text ?? "").trim();
  if (!roh) return [""];

  const zeilen = [];
  let aktuell = "";
  const praefix = () => (zeilen.length === 0 ? "" : einzug);
  const maxLen  = () => Math.max(1, breite - praefix().length);
  const push    = () => { zeilen.push(praefix() + aktuell); aktuell = ""; };

  for (const wort of roh.split(/\s+/)) {
    let rest = wort;
    // Wort passt in keine ganze Zeile -> hart trennen
    while (rest.length > maxLen()) {
      if (aktuell) push();
      const schnitt = maxLen();
      zeilen.push(praefix() + rest.slice(0, schnitt));
      rest = rest.slice(schnitt);
    }
    if (!aktuell) aktuell = rest;
    else if (aktuell.length + 1 + rest.length <= maxLen()) aktuell += " " + rest;
    else { push(); aktuell = rest; }
  }
  if (aktuell) push();
  return zeilen;
}

// Menge deutsch, ohne ueberfluessige Nullen: 30 -> "30", 2.5 -> "2,5"
export function formatMenge(v) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(+v || 0);
}

export function formatEuro(v) {
  const n = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+v || 0);
  return n + " €";
}

function textZeilen(wert) {
  return String(wert || "").split("\n").map(z => z.trim()).filter(Boolean);
}

// Zutatenblock: gepflegter Freitext schlaegt die Rezeptur, leer = live.
export function zutatenZeilen(produkt) {
  const eigen = textZeilen(produkt?.bon_zutaten);
  if (eigen.length) return eigen;
  return (produkt?.zutaten || [])
    .filter(z => (+z.menge_g || 0) > 0)
    .map(z => `${z.name} ${formatMenge(z.menge_g)} g`);
}
