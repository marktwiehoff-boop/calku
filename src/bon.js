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
