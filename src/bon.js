// Reine Bon-Logik (ohne React). Einzige Stelle, an der ein Produktionsbon entsteht.
// Vorschau, Kopieren und Export nutzen alle renderBon().
//
// Vertrag: menge_g und vk_out_brutto muessen Zahlen sein, keine Kommastrings
// ("30,5"). So ein String wird von `+v || 0` zu 0 und laesst die Zutat oder
// den Preis still verschwinden. App.jsx erzwingt das heute in jedem
// Schreibpfad; dieses Modul verlaesst sich darauf, ohne es selbst zu pruefen.

export const BON_BREITE = 48; // Zeichen je Zeile, 80-mm-Thermodrucker (Mark, 05.08.2026)

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

// Einmal konstruiert statt pro Zutat/Produkt neu - Formatter-Konstruktion ist
// die teuerste Einzeloperation im Modul.
const MENGE_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const EURO_FORMAT  = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Menge deutsch, ohne ueberfluessige Nullen: 30 -> "30", 2.5 -> "2,5"
export function formatMenge(v) {
  return MENGE_FORMAT.format(+v || 0);
}

export function formatEuro(v) {
  return EURO_FORMAT.format(+v || 0) + " €";
}

// Zentrale Definition von "gepflegt": ein nichtleerer, getrimmter String.
// Wird fuer Vorlagen, Override und den Bon-Status gleich ausgewertet.
export const gepflegt = (v) => typeof v === "string" && v.trim().length > 0;

function textZeilen(wert) {
  return String(wert || "").split("\n").map(z => z.trim()).filter(Boolean);
}

// Gestaffelt je Zutat: Menge, Zutat eingerueckt, optionale Anweisung mit "> ".
// Die Reihenfolge der Zutaten IST die Bau-Reihenfolge (Vorgabe Susanne, 05.08.2026).
// Gepflegter Freitext in bon_zutaten schlaegt die Rezeptur, leer = live.
export function zutatenZeilen(produkt) {
  const eigen = textZeilen(produkt?.bon_zutaten);
  if (eigen.length) return eigen;

  const zutaten = Array.isArray(produkt?.zutaten) ? produkt.zutaten : [];
  const aus = [];
  for (const z of zutaten) {
    if (!gepflegt(z?.name)) continue;
    const eigeneMenge = gepflegt(z.bon_menge);
    if (!eigeneMenge && !((+z.menge_g || 0) > 0)) continue;
    aus.push(eigeneMenge ? z.bon_menge.trim() : `${formatMenge(z.menge_g)} g`);
    aus.push(`  ${z.name.trim()}`);
    if (gepflegt(z.bon_anweisung)) aus.push(`  > ${z.bon_anweisung.trim()}`);
  }
  return aus;
}

// Bricht eine Blockzeile um und erhaelt dabei ihren eigenen Einzug; Folgezeilen
// werden zusaetzlich zwei Zeichen tiefer gesetzt.
function wrapBlockZeile(zeile) {
  const roh = String(zeile ?? "");
  const einzug = (roh.match(/^\s*/) || [""])[0];
  const breite = Math.max(8, BON_BREITE - einzug.length);
  return wrapZeile(roh.slice(einzug.length), breite, "  ").map(z => einzug + z);
}

const TRENNER = "-".repeat(BON_BREITE);

// Greift, solange keine Vorlage gepflegt ist - die App soll auch dann
// einen brauchbaren Bon zeigen.
export const VORLAGE_FALLBACK = [
  "{produkt}",
  "{gruppe}",
  "{kampagne}",
  TRENNER,
  "{zutaten}",
  TRENNER,
  "{schritte}",
  "{hinweise}",
  "Reihenfolge = Bau-Reihenfolge",
  "von oben nach unten.",
].join("\n");

// Der Standard, auf den jede Warengruppe ohne eigene Vorlage zurueckfaellt.
// Eigenstaendig exportiert, weil der Vorlagen-Editor genau diese Aufloesung
// braucht (welcher Text steht "im Hintergrund", wenn nichts gepflegt ist).
export function standardVorlage(vorlagen) {
  const std = vorlagen?._default;
  return gepflegt(std) ? std : VORLAGE_FALLBACK;
}

// Warengruppe > Standard > Fallback. Leere Strings gelten als nicht gepflegt.
export function aufloeseVorlage(gruppe, vorlagen) {
  const eigen = vorlagen?.[gruppe];
  if (gepflegt(eigen)) return eigen;
  return standardVorlage(vorlagen);
}

function schritteZeilen(produkt) {
  return textZeilen(produkt?.bon_schritte).map((z, i) => `${i + 1}. ${z}`);
}

function hinweisZeilen(produkt) {
  return textZeilen(produkt?.bon_hinweise).map(z => `! ${z}`);
}

// Ersetzt bekannte Platzhalter in einer Zeile, die Text und Platzhalter
// mischt (z. B. "VK {vk}"). Sind alle darin vorkommenden bekannten
// Platzhalter leer, entfaellt die Zeile komplett (Rueckgabe null) - genau wie
// bei einer reinen Einzelplatzhalter-Zeile; war mindestens einer gefuellt,
// bleibt die Zeile mit Leerstrings fuer die leeren Platzhalter.
//
// Konvention fuer Vorlagen: ein Label gehoert mit seinem Platzhalter auf eine
// eigene Zeile ("VK {vk}"), nicht gemischt mit einem anderen Platzhalter
// ("{gruppe} VK {vk}") - sonst bleibt das Label bei leerem Wert allein
// stehen ("Smoothies VK"). Das ist nicht algorithmisch loesbar, kein Code
// kann wissen, dass "VK" inhaltlich zu {vk} gehoert.
function ersetzeBekannte(zeile, bekannt) {
  const alleTokens = zeile.match(/\{[^{}]+\}/g) || [];
  const vorkommend = Object.keys(bekannt).filter(k => zeile.includes(k));
  // Unbekannte Platzhalter (z. B. {filiale}) zaehlen als "gefuellt", sonst
  // wuerde ein leerer bekannter Platzhalter in derselben Zeile sie mit
  // loeschen - sie bleiben stattdessen woertlich stehen, ersetzt wird nur,
  // was bekannt ist.
  const hatUnbekannte = alleTokens.some(t => !(t in bekannt));

  if (vorkommend.length && !hatUnbekannte && vorkommend.every(k => !bekannt[k])) return null;

  let text = zeile;
  for (const k of vorkommend) text = text.split(k).join(bekannt[k]);
  return text;
}

// Hoechstens eine Leerzeile am Stueck, keine am Anfang oder Ende.
function zuBonText(zeilen) {
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

  const override = gepflegt(produkt?.bon_override) ? produkt.bon_override.trim() : "";
  const vorlage  = override || aufloeseVorlage(produkt.gruppe, vorlagen);

  const werte = {
    "{produkt}":     produkt.name || "",
    "{gruppe}":      produkt.gruppe || "",
    "{untergruppe}": produkt.untergruppe || "",
    "{kampagne}":    produkt.kampagne || "",
    // Ungepflegter/nullwertiger VK ("0") ist kein echter Preis - ein
    // falscher Preis auf dem Kuechenbon ist schlimmer als gar keiner.
    "{vk}":          Number(produkt.vk_out_brutto) > 0 ? formatEuro(produkt.vk_out_brutto) : "",
  };
  const bloecke = {
    "{zutaten}":  zutatenZeilen(produkt),
    "{schritte}": schritteZeilen(produkt),
    "{hinweise}": hinweisZeilen(produkt),
  };
  // Einmal fuer den ganzen Lauf gebaut statt pro Vorlagenzeile neu - Zutaten-
  // liste & Co. aendern sich waehrend eines renderBon-Aufrufs nicht.
  const bekannt = { ...werte };
  for (const [k, v] of Object.entries(bloecke)) bekannt[k] = v.join(" ");

  // Vorlagenzeilen werden linksbuendig gerendert - eine fuehrende Einrueckung
  // im Text geht durch das trim() in wrapZeile ohnehin verloren.
  const aus = [];
  for (const zeile of String(vorlage).split("\n")) {
    const roh = zeile.trim();

    // Zeile besteht NUR aus einem Blockplatzhalter
    if (Object.prototype.hasOwnProperty.call(bloecke, roh)) {
      for (const b of bloecke[roh]) aus.push(...wrapBlockZeile(b));
      continue;
    }
    // Zeile besteht NUR aus einem Einzelplatzhalter -> leer heisst: Zeile entfaellt
    if (Object.prototype.hasOwnProperty.call(werte, roh)) {
      if (!werte[roh]) continue;
      aus.push(...wrapZeile(werte[roh]));
      continue;
    }
    // Gemischte Zeile (Text + Platzhalter) oder reiner Text ohne Platzhalter
    const ersetzt = ersetzeBekannte(zeile, bekannt);
    if (ersetzt === null) continue;
    if (!ersetzt.trim()) { aus.push(""); continue; }
    aus.push(...wrapZeile(ersetzt));
  }
  return zuBonText(aus);
}

// "abweichend" = folgt der Rezeptur nicht mehr, "gepflegt" = Schritte da,
// "auto" = rein aus Vorlage + Live-Zutaten.
export function bonStatus(produkt) {
  if (gepflegt(produkt?.bon_override) || gepflegt(produkt?.bon_zutaten)) return "abweichend";
  if (gepflegt(produkt?.bon_schritte)) return "gepflegt";
  return "auto";
}

// Ein kaputter Eintrag (null, undefined, kein Objekt) darf den Export der
// uebrigen Produkte nicht abreissen - dieselbe Haltung wie bei kaputten
// Zutatenlisten.
const istProdukt = (p) => p != null && typeof p === "object";

export function bonsAlsCsv(produkte, vorlagen) {
  const esc = (s) => `"${String(s ?? "").split(`"`).join(`""`)}"`;
  const zeilen = [["produkt", "gruppe", "bon_text"].join(";")];
  for (const p of (produkte || []).filter(istProdukt)) {
    zeilen.push([esc(p.name), esc(p.gruppe), esc(renderBon(p, vorlagen))].join(";"));
  }
  // BOM, damit Excel die Umlaute richtig liest. Als Escape-Sequenz statt
  // Literalzeichen, sonst ist es im Editor/Diff unsichtbar und ein
  // Whitespace-Cleanup koennte es lautlos entfernen.
  return "\uFEFF" + zeilen.join("\r\n");
}

export function bonsAlsJson(produkte, vorlagen, stand = new Date().toISOString().slice(0, 10)) {
  return JSON.stringify({
    stand,
    quelle: "calku",
    bon_vorlagen: vorlagen || {},
    bons: (produkte || []).filter(istProdukt).map(p => ({
      id: p.id,
      name: p.name,
      gruppe: p.gruppe,
      bon_zutaten:  p.bon_zutaten  || null,
      bon_schritte: p.bon_schritte || null,
      bon_hinweise: p.bon_hinweise || null,
      bon_override: p.bon_override || null,
      bon_text: renderBon(p, vorlagen),
    })),
  }, null, 2);
}
