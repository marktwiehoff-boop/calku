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

const TRENNER = "-".repeat(BON_BREITE);

// Greift, solange keine Vorlage gepflegt ist - die App soll auch dann
// einen brauchbaren Bon zeigen.
export const VORLAGE_FALLBACK = [
  "{produkt}",
  "{gruppe}",
  TRENNER,
  "{zutaten}",
  TRENNER,
  "{schritte}",
  "{hinweise}",
].join("\n");

// Warengruppe > Standard > Fallback. Leere Strings gelten als nicht gepflegt.
export function aufloeseVorlage(gruppe, vorlagen) {
  const v = vorlagen || {};
  const eigen = v[gruppe];
  if (typeof eigen === "string" && eigen.trim()) return eigen;
  const std = v._default;
  if (typeof std === "string" && std.trim()) return std;
  return VORLAGE_FALLBACK;
}

export function schritteZeilen(produkt) {
  return textZeilen(produkt?.bon_schritte).map((z, i) => `${i + 1}. ${z}`);
}

export function hinweisZeilen(produkt) {
  return textZeilen(produkt?.bon_hinweise).map(z => `! ${z}`);
}

// Hoechstens eine Leerzeile am Stueck, keine am Anfang oder Ende.
function verdichte(zeilen) {
  const out = [];
  for (const z of zeilen) {
    if (z === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(z);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// Der eine Weg vom Rezept zum Bon-Text.
export function renderBon(produkt, vorlagen) {
  if (!produkt) return "";

  const override = typeof produkt.bon_override === "string" ? produkt.bon_override.trim() : "";
  const vorlage  = override || aufloeseVorlage(produkt.gruppe, vorlagen);

  const werte = {
    "{produkt}":     produkt.name || "",
    "{gruppe}":      produkt.gruppe || "",
    "{untergruppe}": produkt.untergruppe || "",
    "{vk}":          produkt.vk_out_brutto != null ? formatEuro(produkt.vk_out_brutto) : "",
  };
  const bloecke = {
    "{zutaten}":  zutatenZeilen(produkt),
    "{schritte}": schritteZeilen(produkt),
    "{hinweise}": hinweisZeilen(produkt),
  };

  const aus = [];
  for (const zeile of String(vorlage).split("\n")) {
    const roh = zeile.trim();

    // Zeile besteht NUR aus einem Blockplatzhalter
    if (Object.prototype.hasOwnProperty.call(bloecke, roh)) {
      for (const b of bloecke[roh]) aus.push(...wrapZeile(b, BON_BREITE, "  "));
      continue;
    }
    // Zeile besteht NUR aus einem Einzelplatzhalter -> leer heisst: Zeile entfaellt
    if (Object.prototype.hasOwnProperty.call(werte, roh)) {
      if (!werte[roh]) continue;
      aus.push(...wrapZeile(werte[roh]));
      continue;
    }
    // Gemischte Zeile: alles ersetzen, Bloecke einzeilig zusammenziehen
    let text = zeile;
    for (const [k, v] of Object.entries(werte))   text = text.split(k).join(v);
    for (const [k, v] of Object.entries(bloecke)) text = text.split(k).join(v.join(" "));
    if (!text.trim()) { aus.push(""); continue; }
    aus.push(...wrapZeile(text));
  }
  return verdichte(aus);
}
