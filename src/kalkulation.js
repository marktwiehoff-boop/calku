// Rechenkern der Kalkulation: Formatter, Stammdaten, Rezeptzeilen, Bowl-Varianten, Datenpflege.
// Pur und ohne React. Aus App.jsx ausgelagert (28.09.2026).
import { verknuepfeProdukte } from "./zutaten.js";
// ============================================================
//  FORMATTER (de-DE)
// ============================================================
export const fmtEUR  = v => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
export const fmtEUR0 = v => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
export const fmtPct  = v => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0) + " %";
export const fmtNum  = v => new Intl.NumberFormat("de-DE").format(Math.round(v || 0));
export const fmtNum2 = v => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
export const fmtMenge = v => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v || 0);
export const fmtDate = d => d ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "—";

// ============================================================
//  STAMMDATEN: Warengruppen + Schwellwerte
// ============================================================
// Mark hat verbindlich vorgegeben:
//   Smoothies / Juices / Iced Drinks: max. 24% Wareneinsatz, darüber rot
//   Bowls / Wraps / Kampagnen:        max. 26% Wareneinsatz, darüber rot
// Binäre Ampel ohne Gelb-Puffer.
export const SCHWELLWERTE = {
  "Smoothies":   { rot: 24 },
  "Juices":      { rot: 24 },
  "Iced Drinks": { rot: 24 },
  "Bowls":       { rot: 26 },
  "Wraps":       { rot: 26 },
  "Kampagnen":   { rot: 26 },
  "Archiv":      { rot: 30 },
};

export const WARENGRUPPEN  = ["Smoothies", "Juices", "Iced Drinks", "Bowls", "Wraps", "Kampagnen"];
export const ICED_SUBGROUPS = ["Classic Iced Matcha", "Sweet Iced Matcha", "Frozen Iced Tea", "Refresher", "Iced Coffee Lattes"];
export const BOWL_SUBGROUPS = ["Salatbowls", "Kartoffelbowls", "Reisbowls"];
// Untergruppen je Warengruppe (für Reiter-Unterfilter + Edit-Dialog)
export const SUBGROUPS_BY_GRUPPE = { "Iced Drinks": ICED_SUBGROUPS, "Bowls": BOWL_SUBGROUPS };
// Default-Untergruppe, wenn am Produkt keine gesetzt ist
export const DEFAULT_UNTERGRUPPE = { "Bowls": "Salatbowls" };
export const untergruppeVon = (p) => p.untergruppe || DEFAULT_UNTERGRUPPE[p.gruppe] || null;

// ============================================================
//  BOWL-VARIANTEN: eine Bowl, drei Basen (Salat / Kartoffel / Reis)
// ============================================================
// In der Kasse ist jede Bowl drei Artikel („Julius Caesar Bowl“, „Julius
// Caesar Kartoffel (normal)“, „Julius Caesar Reis (normal)“). In CALKU bleibt
// sie EIN Rezept: alle Zutaten sind in den drei Varianten gleich, nur der
// Salatmix schrumpft in der Kartoffel- und Reis-Variante, und die Basis
// (Kartoffeln + Basissauce + Röstzwiebeln bzw. Reis) kommt dazu. Die Basis
// steht genau einmal im Dokument (bowl_basis) und gilt für alle Bowls mit
// wählbarer Basis — eine Information, ein Ort. Beim Speichern schreibt die
// App zusätzlich `produkte_aufgeloest`: je Variante ein eigenes Produkt mit
// den ids `<id>` (Salat), `<id>_kartoffel`, `<id>_reis` — das lesen
// Bestellvorschlag und BigQuery (Zuordnung zu den Kassenartikeln).
export const BOWL_VARIANTEN = [
  { key: "salat",     label: "Salatbowl",     kurz: "Salat",     untergruppe: "Salatbowls",     idSuffix: "",           nameZusatz: "" },
  { key: "kartoffel", label: "Kartoffelbowl", kurz: "Kartoffel", untergruppe: "Kartoffelbowls", idSuffix: "_kartoffel", nameZusatz: "Kartoffel" },
  { key: "reis",      label: "Reisbowl",      kurz: "Reis",      untergruppe: "Reisbowls",      idSuffix: "_reis",      nameZusatz: "Reis" },
];
export const BOWL_VARIANTE = Object.fromEntries(BOWL_VARIANTEN.map(v => [v.key, v]));
export const BOWL_GROESSEN = [["normal", "Normal"], ["klein", "Klein"]];

// Vorgabe, solange im Dokument keine Basis gepflegt ist. Mengen: Rezeptur-
// Entscheidung Mark 03./05.09.2026 (Salatmix 100 g Salatbowl, 50 g Kartoffel-
// und Reisbowl; Kartoffeln gegart 230 g, Basissauce 40 g, Röstzwiebeln 5 g;
// Reis 150 g). Klein = zwei Drittel auf 5 g gerundet, Salatmix klein halbiert
// — bitte im Bowls-Tab bestätigen. Preise aus den CALKU-Rezepten (Quark
// Kartoffel Bowl, Korean Glaze Bowl) bzw. der TG-Einkaufspreisliste.
export const DEFAULT_BOWL_BASIS = {
  version: 1,
  salat: {
    zutaten: ["Salatmix", "Mixsalat"],
    menge: { normal: { kartoffel: 50, reis: 50 }, klein: { kartoffel: 30, reis: 30 } },
  },
  varianten: {
    kartoffel: { zutaten: [
      { name: "Kartoffeln gegart",    lieferant: "Transgourmet", preis_pro_g: 0.001988, menge: { normal: 230, klein: 155 } },
      { name: "Kartoffel Basissauce", lieferant: "Transgourmet", preis_pro_g: 0.004380, menge: { normal: 40,  klein: 25 } },
      { name: "Röstzwiebeln",         lieferant: "Transgourmet", preis_pro_g: 0.005080, menge: { normal: 5,   klein: 5 } },
    ] },
    reis: { zutaten: [
      { name: "Quinoa Reismix",       lieferant: "Transgourmet", preis_pro_g: 0.001450, menge: { normal: 150, klein: 100 } },
    ] },
  },
};

// ============================================================
//  PREIS-ABGLEICH: Zutatenname → Preisliste (tolerant)
// ============================================================
// Füllwörter/Qualifier, die für den Namensvergleich ignoriert werden.
export const PL_FILLER = new Set([
  "tk", "ig", "bio", "immergrün", "immergruen", "frisch", "natur", "geröstet", "geroestet",
  "gekocht", "gegart", "gerieben", "gehackt", "vegan", "veg", "art", "stk", "mit", "und",
  "der", "die", "das", "topping", "sorte", "gross", "groß", "klein", "hausgem", "hausgemacht",
]);
export function ztCompact(s) {
  return String(s || "").toLowerCase()
    .replace(/[,(].*$/, "")            // alles ab Komma/Klammer abschneiden
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-zäöüß ]/g, " ")
    .split(/\s+/).filter(t => t && !PL_FILLER.has(t)).join("");
}
export const sortChars = (s) => s.split("").sort().join("");
export function buildPlIndex(priceList) {
  return Object.values(priceList || {})
    .map(e => ({ proG: e?.price_per_gram_ml, comp: ztCompact(e?.ingredient_name || "") }))
    .filter(e => e.comp && e.proG);
}
// Liefert preis_pro_g aus der Preisliste oder 0. Reihenfolge: exakt > Präfix > Anagramm > Teilstring.
export function findPreisProG(name, plIndex) {
  const q = ztCompact(name);
  if (q.length < 3) return 0;
  const qs = sortChars(q);
  let best = null, bestScore = 0, bestDiff = 1e9;
  for (const e of plIndex) {
    const c = e.comp;
    let sc = 0;
    if (c === q) sc = 4;
    else if ((q.startsWith(c) || c.startsWith(q)) && Math.min(q.length, c.length) >= 4) sc = 3;
    else if (q.length >= 6 && c.length >= 6 && sortChars(c) === qs) sc = 2;
    else if (q.length >= 6 && c.length >= 6 && (q.includes(c) || c.includes(q))) sc = 1;
    if (sc > 0) {
      const diff = Math.abs(q.length - c.length);
      if (sc > bestScore || (sc === bestScore && diff < bestDiff)) { best = e; bestScore = sc; bestDiff = diff; }
    }
  }
  return best ? (best.proG || 0) : 0;
}

// Seit 2026 gilt fuer Speisen im Haus derselbe Satz wie ausser Haus. Der
// Steuersatz haengt damit nicht mehr am Verkaufsort, sondern an der
// Produktart: Speisen, Acai, Smoothies und Frozen Yoghurt 7 %, uebrige
// Getraenke 19 %. Der Unterschied zwischen IN und OUT ist nur noch die
// Verpackung - im Haus wird auf Geschirr serviert.
export const MWST_SPEISEN  = 0.07;
export const MWST_GETRAENK = 0.19;

// Vorgabe je Warengruppe. Kampagnen sind gemischt - Bagel, Korean Glaze
// Bowl, Acai und Frozen Yoghurt sind Speisen, ein Dragon Fruit Refresher
// ist es nicht. Deshalb steht dort 7 % als Vorgabe, und der Satz laesst
// sich am einzelnen Rezept uebersteuern.
export const MWST_GRUPPE = {
  "Smoothies":   MWST_SPEISEN,
  "Juices":      MWST_GETRAENK,
  "Iced Drinks": MWST_GETRAENK,
  "Bowls":       MWST_SPEISEN,
  "Wraps":       MWST_SPEISEN,
  "Kampagnen":   MWST_SPEISEN,
};

// Satz eines Produkts: ein am Rezept hinterlegter Wert schlaegt die Vorgabe.
export function mwstSatz(p) {
  const eigen = +(p && p.mwst_satz);
  if (eigen === MWST_SPEISEN || eigen === MWST_GETRAENK) return eigen;
  return MWST_GRUPPE[p && p.gruppe] ?? MWST_GETRAENK;
}
export const SCHWUND_PCT = 3.0; // Sicherheitspuffer Soll → Soll-inkl-Schwund

// ============================================================
//  AMPEL-LOGIK
// ============================================================
export function ampelFarbe(quote, gruppe) {
  const s = SCHWELLWERTE[gruppe] || SCHWELLWERTE["Archiv"];
  if (quote > s.rot) return { stufe: "rot",   bg: "bg-red-50",   text: "text-red-800",   border: "border-red-300",   dot: "bg-red-500" };
  return                    { stufe: "gruen", bg: "bg-green-50", text: "text-green-800", border: "border-green-300", dot: "bg-green-500" };
}

// ============================================================
//  GRÖßEN-GRUPPIERUNG (Smoothies, Juices)
// ============================================================
// Erkennt am Produktname-Ende eine Füllmenge ("400ml", "0,3l", "300 ml")
// und trennt sie vom Basis-Namen ("Erdbeerliebe 400ml" → "Erdbeerliebe" + "400 ml").
export const GRUPPIERBARE = new Set(["Smoothies", "Juices"]);

export function extractSize(name, gruppe) {
  if (!GRUPPIERBARE.has(gruppe)) return { base: name, size: null };
  const mMl = name.match(/^(.+?)\s+(\d+)\s*ml\s*$/i);
  if (mMl) return { base: mMl[1].trim(), size: `${mMl[2]} ml` };
  const mL = name.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)\s*l\s*$/i);
  if (mL) return { base: mL[1].trim(), size: `${mL[2].replace(".", ",")} l` };
  return { base: name, size: null };
}

export function sizeToMl(size) {
  if (!size) return 0;
  const ml = size.match(/^(\d+)\s*ml/i);
  if (ml) return +ml[1];
  const l = size.match(/^(\d+(?:[,.]\d+)?)\s*l/i);
  if (l) return parseFloat(l[1].replace(",", ".")) * 1000;
  return 0;
}

export function gruppiereProdukte(produkte, gruppe) {
  if (!GRUPPIERBARE.has(gruppe)) {
    return produkte.map(p => ({ base: p.name, items: [{ ...p, _size: null }] }));
  }
  const map = new Map();
  produkte.forEach(p => {
    const { base, size } = extractSize(p.name, gruppe);
    if (!map.has(base)) map.set(base, { base, items: [] });
    map.get(base).items.push({ ...p, _size: size });
  });
  return Array.from(map.values()).map(g => ({
    base: g.base,
    items: g.items.sort((a, b) => sizeToMl(a._size) - sizeToMl(b._size)),
  }));
}

export function fmtRange(arr, formatter) {
  if (arr.length === 0) return "—";
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (Math.abs(min - max) < 0.005) return formatter(min);
  return `${formatter(min)} – ${formatter(max)}`;
}

// ============================================================
//  MAPPING: alte Excel-Kategorien → neue Hierarchie
// ============================================================
export function mapToWarengruppe(altKategorie, rezeptName) {
  const cat  = (altKategorie || "").toLowerCase().replace(/\s+/g, " ");
  const name = (rezeptName   || "").toLowerCase();

  if (cat.includes("smoothie"))                          return { gruppe: "Smoothies", untergruppe: null };
  if (cat.includes("saft") || cat.includes("säft") ||
      cat.includes("s�ft") || cat.includes("juice"))return { gruppe: "Juices",    untergruppe: null };

  if (cat.includes("frozen") || cat.includes("refresher")) {
    if (name.includes("refresher")) return { gruppe: "Iced Drinks", untergruppe: "Refresher" };
    return { gruppe: "Iced Drinks", untergruppe: "Frozen Iced Tea" };
  }
  if (cat.includes("iced latte") || cat.includes("iced coffee") || cat.includes("iced matcha")) {
    if (name.includes("matcha")) {
      // „Sweet" / „süß" → Sweet Iced Matcha; alles andere → Iced Matcha
      if (name.includes("sweet") || name.includes("süß") || name.includes("suess")) {
        return { gruppe: "Iced Drinks", untergruppe: "Sweet Iced Matcha" };
      }
      return { gruppe: "Iced Drinks", untergruppe: "Iced Matcha" };
    }
    return { gruppe: "Iced Drinks", untergruppe: "Iced Coffee Lattes" };
  }
  if (cat.includes("bowl")) return { gruppe: "Bowls", untergruppe: null };
  if (cat.includes("wrap")) return { gruppe: "Wraps", untergruppe: null };
  if (cat.includes("kampagne") || cat.includes("thai") || cat.includes("saison")) {
    return { gruppe: "Kampagnen", untergruppe: null };
  }
  return { gruppe: "Archiv", untergruppe: altKategorie || "Sonstiges" };
}

// ============================================================
//  REZEPT-NORMALIZER
//  Wandelt einen Eintrag aus rezeptdatenbank.json → internes Schema
// ============================================================
export function normalizeRecipe(raw, priceList) {
  // Pseudo-Zeilen, die NICHT zum Wareneinsatz beitragen:
  const isPseudo = (n) => {
    if (!n) return true;
    const x = n.toLowerCase();
    return x.startsWith("in:") || x.startsWith("out:") ||
           x === "wareneinsatz" || x === "summe" || x.includes("verkaufspreis");
  };

  const zutaten = [];
  let vk_in_brutto = 0, vk_out_brutto = 0;
  let material_incl_pkg_db = null;

  for (const ing of (raw.ingredients || [])) {
    const nm = ing.ingredient_name || "";
    if (!nm) continue;
    const lower = nm.toLowerCase();

    if (lower === "in: verkaufspreis (brutto/netto)") { vk_in_brutto  = +ing.amount_grams || 0; continue; }
    if (lower === "out: verkaufspreis (brutto/netto)"){ vk_out_brutto = +ing.amount_grams || 0; continue; }
    if (lower === "in: material inkl. verpackung")   { material_incl_pkg_db = +ing.cost || 0;   continue; }
    if (isPseudo(nm)) continue;
    if (!ing.amount_grams && !ing.cost) continue;

    // Lieferpreis: aktuelle Preisliste hat Vorrang vor dem im Rezept hinterlegten Preis
    const pl = priceList?.[nm.toLowerCase()];
    const preisProEinheit = pl?.price_per_gram_ml ?? null;
    const menge = +ing.amount_grams || 0;
    const cost  = preisProEinheit != null ? menge * preisProEinheit : (+ing.cost || 0);

    zutaten.push({
      name: nm,
      menge_g: menge,
      lieferant: "Transgourmet",
      preis_pro_g: preisProEinheit ?? (menge > 0 ? cost / menge : 0),
      cost,
    });
  }

  const material = zutaten.reduce((s, z) => s + z.cost, 0);
  // Verpackung: Differenz zwischen "IN: Material inkl. Verpackung" und Materialkosten,
  // sonst Default 0,15 € (typische Schale/Becher).
  let verpackung = material_incl_pkg_db != null ? Math.max(0, material_incl_pkg_db - material) : 0.15;
  if (verpackung > 1.0) verpackung = 0.15;

  const map = mapToWarengruppe(raw.category, raw.name);

  return {
    id: `${raw.name}__${raw.category}`.replace(/\s+/g, "_"),
    name: raw.name,
    gruppe: map.gruppe,
    untergruppe: map.untergruppe,
    alte_kategorie: raw.category,
    zutaten,
    verpackung_eur: verpackung,
    vk_in_brutto,
    vk_out_brutto,
    kampagne_start: null,
    kampagne_ende: null,
    artikelart: null, // Pflicht-/Zusatzartikel: wird in der App gekennzeichnet
  };
}

// ============================================================
//  BERECHNUNG pro Produkt
// ============================================================

// Ausbeute in Prozent: wie viel der EINGEKAUFTEN Menge im Produkt ankommt
// (geschälte Ananas ~60). Der Wareneinsatz rechnet mit der Einkaufsmenge,
// deshalb teilt die Ausbeute die Kosten. Leer oder 100 = keine Wirkung.
// WICHTIG: preis_pro_g muss dann der reine TG-Einkaufspreis sein — sonst
// steckt der Verschnitt doppelt drin (einmal im Preis, einmal hier).
export function ausbeuteFaktor(z) {
  const a = +(z && z.ausbeute_prozent) || 100;
  return Math.min(100, Math.max(1, a)) / 100;
}

// ---- Einheit einer Rezeptzeile: g (Standard), ml oder Stück -------------
// Ei, Wrap, Tortilla: der Gast bekommt EIN Stück, und ein Stück hat einen
// Stückpreis. Solche Zeilen rechnen in Stück (menge_stk × preis_je_stueck)
// und führen menge_g / preis_pro_g nur als Gramm-Äquivalent mit
// (menge_stk × g/Stück), damit Bestellvorschlag, Bons und BigQuery weiter in
// Gramm rechnen können. Fehlt das Stückgewicht, ist das Gramm-Äquivalent 0
// und die Zeile fehlt im Bestellvorschlag — die App weist darauf hin.
export const EINHEITEN = [
  { key: "g",   menge: "g",   preis: "€/kg"  },
  { key: "ml",  menge: "ml",  preis: "€/l"   },
  { key: "stk", menge: "Stk", preis: "€/Stk" },
];
export const EINHEIT = Object.fromEntries(EINHEITEN.map(e => [e.key, e]));
export function zutatEinheit(z) {
  const e = z && z.einheit;
  return e === "stk" || e === "ml" ? e : "g";
}
export const istStueck = (z) => zutatEinheit(z) === "stk";
// Menge in der Einheit der Zeile
export function zutatMenge(z) {
  return istStueck(z) ? (+(z && z.menge_stk) || 0) : (+(z && z.menge_g) || 0);
}
// Preis in der Anzeige-Einheit der Zeile: €/kg bzw. €/l, bei Stück €/Stk
export function zutatPreisAnzeige(z) {
  return istStueck(z) ? (+(z && z.preis_je_stueck) || 0) : (+(z && z.preis_pro_g) || 0) * 1000;
}

export function zutatKosten(z) {
  if (istStueck(z)) {
    return ((+(z && z.menge_stk) || 0) * (+(z && z.preis_je_stueck) || 0)) / ausbeuteFaktor(z);
  }
  return ((+(z && z.menge_g) || 0) * (+(z && z.preis_pro_g) || 0)) / ausbeuteFaktor(z);
}

// Der eine Weg, eine Rezeptzeile nach einer Änderung konsistent zu machen:
// Stück-Zeilen bekommen ihr Gramm-Äquivalent, jede Zeile neue Kosten.
export function normalisiereZutat(z) {
  const n = { ...z };
  if (istStueck(n)) {
    n.einheit = "stk";
    n.menge_stk = Math.max(0, +n.menge_stk || 0);
    n.preis_je_stueck = Math.max(0, +n.preis_je_stueck || 0);
    const g = +n.gramm_je_stueck || 0;
    n.menge_g = g > 0 ? n.menge_stk * g : 0;
    n.preis_pro_g = g > 0 ? n.preis_je_stueck / g : 0;
  } else {
    if (n.einheit !== "ml") delete n.einheit;
    n.menge_g = Math.max(0, +n.menge_g || 0);
    n.preis_pro_g = Math.max(0, +n.preis_pro_g || 0);
  }
  n.cost = zutatKosten(n);
  return n;
}
// Menge einer Zeile setzen (in ihrer Einheit) und neu rechnen
export function mitMenge(z, menge) {
  const m = Math.max(0, +menge || 0);
  return normalisiereZutat(istStueck(z) ? { ...z, menge_stk: m } : { ...z, menge_g: m });
}
// Anzeigepreis einer Zeile setzen (€/kg, €/l oder €/Stk) und neu rechnen
export function mitPreis(z, preisAnzeige) {
  const p = Math.max(0, +preisAnzeige || 0);
  return normalisiereZutat(istStueck(z) ? { ...z, preis_je_stueck: p } : { ...z, preis_pro_g: p / 1000 });
}
// Einheit wechseln. Die Zahlen auf dem Bildschirm bleiben stehen, nur die
// Einheit dahinter ändert sich: aus „1 g · 0,28 €/kg“ (so stand das Ei
// bisher da) wird „1 Stk · 0,28 €/Stk“.
export function mitEinheit(z, einheit, artikel) {
  if (zutatEinheit(z) === einheit) return z;
  const menge = zutatMenge(z);
  const preis = zutatPreisAnzeige(z);
  const n = { ...z, einheit };
  if (einheit === "stk") {
    n.menge_stk = menge;
    n.preis_je_stueck = preis;
    n.gramm_je_stueck = stueckgewicht(artikel) || z.gramm_je_stueck || null;
  } else {
    n.menge_g = menge;
    n.preis_pro_g = preis / 1000;
    delete n.menge_stk;
    delete n.preis_je_stueck;
  }
  return normalisiereZutat(n);
}

// Preisbasis eines Einkaufsartikels: Stueck, pro Gramm oder pro 100 ml.
// Wird automatisch aus der Einheit abgeleitet und kann im Einkaufspreise-Tab
// uebersteuert werden. Das Stueckgewicht ist rechnerisch Stueckpreis /
// Preis pro Gramm (Gurke: 1,00 EUR / 0,0022 EUR pro g = 450 g) - oder, wo
// die Liste keinen brauchbaren Grammpreis hat (Eier: 30 Stueck fuer 8,45
// EUR), als gewicht_je_stueck_g gepflegt. Es fliesst so in die Bestell-App.
export const PREISBASEN = [["gramm", "pro Gramm"], ["stueck", "Stück"], ["ml100", "pro 100 ml"]];
export const STUECK_EINHEITEN = new Set(["stück", "stueck", "stk", "stk.", "st", "st.", "stck"]);

export function preisbasisAuto(a) {
  const einheit = String((a && a.unit) || "").toLowerCase();
  if (einheit === "ml" || einheit === "l" || einheit === "liter") return "ml100";
  if (einheit === "g" || einheit === "kg" || einheit === "kiste") return "gramm";
  if (STUECK_EINHEITEN.has(einheit)) return "stueck";
  // Ohne Einheit und kleine Zahl = Handelsware in Flaschen (Cola, Vio). Mit Einheit gilt die
  // Einheit - die alte „package_size <= 5 -> Stueck"-Regel machte H-Milch (Liter/1) zur
  // Stueckware (E11.8, 10.09.2026).
  if (!einheit && (+(a && a.package_size) || 0) <= 5) return "stueck";
  return "gramm";
}

export function istStueckArtikel(a) {
  return !!a && ((a.preisbasis || preisbasisAuto(a)) === "stueck");
}

// Stueckpreis eines Stueck-Artikels: Packungspreis / Stueck je Packung
// (Eier: 8,45 EUR / 30 = 0,28 EUR; Gurke: 1,00 EUR / 1 = 1,00 EUR).
export function stueckpreis(a) {
  if (!istStueckArtikel(a)) return null;
  const preis = +(a && a.package_price) || 0;
  const anzahl = +(a && a.package_size) || 1;
  return preis > 0 ? preis / Math.max(1, anzahl) : null;
}

export function stueckgewicht(a) {
  if (!istStueckArtikel(a)) return null;
  const manuell = +(a && a.gewicht_je_stueck_g) || 0;
  if (manuell > 0) return manuell;
  const preis = stueckpreis(a);
  const proG = +(a && a.price_per_gram_ml) || 0;
  return preis > 0 && proG > 0 ? preis / proG : null;
}

export function berechne(produkt) {
  const material = produkt.zutaten.reduce((s, z) => s + (z.cost || 0), 0);
  const satz = mwstSatz(produkt);
  // Im Haus faellt keine Verpackung an (Geschirr), ausser Haus schon.
  const we_in_eur  = material;
  const we_out_eur = material + (produkt.verpackung_eur || 0);
  const vk_in_netto  = (produkt.vk_in_brutto  || 0) / (1 + satz);
  const vk_out_netto = (produkt.vk_out_brutto || 0) / (1 + satz);
  const we_in  = vk_in_netto  > 0 ? we_in_eur  / vk_in_netto  * 100 : 0;
  const we_out = vk_out_netto > 0 ? we_out_eur / vk_out_netto * 100 : 0;
  return {
    material,
    satz,
    // "wareneinsatz" ist die Ausser-Haus-Sicht - alle verdichteten
    // Kennzahlen laufen darauf.
    wareneinsatz: we_out_eur,
    wareneinsatz_in: we_in_eur,
    vk_in_netto,
    vk_out_netto,
    we_in,
    we_out,
    db_in:  vk_in_netto  - we_in_eur,
    db_out: vk_out_netto - we_out_eur,
  };
}

// ============================================================
//  BOWL-VARIANTEN: Hilfsfunktionen
// ============================================================
export function bowlBasisOderDefault(basis) {
  return basis && basis.varianten ? basis : DEFAULT_BOWL_BASIS;
}

// Größe einer Bowl: explizit (p.groesse) oder aus dem Namen („… Klein“).
export function bowlGroesse(p) {
  if (p?.groesse === "klein" || p?.groesse === "normal") return p.groesse;
  return /\bklein\b/i.test(p?.name || "") ? "klein" : "normal";
}

// Welche Basen bietet eine Bowl? Explizit (p.varianten), sonst aus der
// Untergruppe (Reisbowls → nur Reis), sonst: steckt eine Basiszutat schon im
// Rezept selbst (Quark Kartoffel Bowl), ist es genau diese Variante — alles
// andere ist eine Bowl mit wählbarer Basis (Salat / Kartoffel / Reis).
export function bowlVarianten(p, basis) {
  if (!p || p.gruppe !== "Bowls") return null;
  if (Array.isArray(p.varianten)) {
    const gueltig = BOWL_VARIANTEN.map(v => v.key).filter(k => p.varianten.includes(k));
    if (gueltig.length) return gueltig;
  }
  const einzel = BOWL_VARIANTEN.find(v => v.key !== "salat" && v.untergruppe === p.untergruppe);
  if (einzel) return [einzel.key];
  if (p.untergruppe !== "Salatbowls") {
    const b = bowlBasisOderDefault(basis);
    const namen = new Set((p.zutaten || []).map(z => (z.name || "").trim().toLowerCase()));
    for (const v of BOWL_VARIANTEN) {
      const bz = b.varianten?.[v.key]?.zutaten || [];
      if (bz.some(x => namen.has((x.name || "").trim().toLowerCase()))) return [v.key];
    }
  }
  return BOWL_VARIANTEN.map(v => v.key);
}

// Bowl mit wählbarer Basis = mehr als eine Variante. Nur dann kommt die
// zentrale Basis dazu; Einzelrezepte (Korean Glaze, Quark Kartoffel) sind
// komplett, wie sie sind.
export function basisWaehlbar(p, basis) {
  const v = bowlVarianten(p, basis);
  return !!v && v.length > 1;
}

// Untergruppe in der Kassen-Sicht: Einzelvarianten tragen ihre Basis, auch
// wenn am Produkt keine Untergruppe gepflegt ist (Quark Kartoffel Bowl).
export function bowlUntergruppe(p, basis) {
  const v = bowlVarianten(p, basis);
  if (v && v.length === 1) return BOWL_VARIANTE[v[0]].untergruppe;
  return untergruppeVon(p);
}

export function istSalatZutat(z, basis) {
  const n = (z?.name || "").trim().toLowerCase();
  if (!n) return false;
  const muster = bowlBasisOderDefault(basis).salat?.zutaten || DEFAULT_BOWL_BASIS.salat.zutaten;
  return muster.some(m => {
    const s = String(m).trim().toLowerCase();
    return s && (n === s || n.startsWith(s + " "));
  });
}

// Menge einer Rezeptzeile in einer Variante (Einheit der Zeile). Eine
// Zeilen-Ausnahme (menge_je_variante) schlägt die zentrale Salatmix-Regel,
// die schlägt die normale Menge des Rezepts.
export function zutatMengeVariante(z, variante, p, basis) {
  const ausnahme = z?.menge_je_variante?.[variante];
  if (ausnahme != null && ausnahme !== "") return Math.max(0, +ausnahme || 0);
  if (variante !== "salat" && istSalatZutat(z, basis)) {
    const regel = bowlBasisOderDefault(basis).salat?.menge?.[bowlGroesse(p)]?.[variante];
    if (regel != null && regel !== "") return Math.max(0, +regel || 0);
  }
  return zutatMenge(z);
}

// Zeilen der zentralen Basis für eine Variante und Größe, als Rezeptzeilen.
export function basisZutaten(variante, p, basis) {
  const g = bowlGroesse(p);
  return (bowlBasisOderDefault(basis).varianten?.[variante]?.zutaten || [])
    .filter(b => (b.name || "").trim())
    .map(b => normalisiereZutat({
      name: b.name.trim(), lieferant: b.lieferant || "Transgourmet",
      menge_g: +(b.menge?.[g] ?? 0) || 0, preis_pro_g: +b.preis_pro_g || 0,
      ausbeute_prozent: b.ausbeute_prozent ?? null, basis: true,
    }));
}

// „Julius Caesar Normal“ → „Julius Caesar Kartoffel Normal“ (Größe bleibt
// hinten, wie in der Kasse: „Julius Caesar Kartoffel (normal)“).
export function variantenName(name, v) {
  if (!v.nameZusatz) return name;
  const m = String(name || "").match(/^(.*?)(\s+(?:Normal|Klein))$/i);
  return m ? `${m[1]} ${v.nameZusatz}${m[2]}` : `${name} ${v.nameZusatz}`;
}

// Eine Variante als eigenständiges Produkt — berechne() rechnet sie wie
// jedes andere. Genau so landet sie in produkte_aufgeloest.
export function bowlVariante(p, variante, basis) {
  const v = BOWL_VARIANTE[variante] || BOWL_VARIANTE.salat;
  const { varianten, vk_varianten, ...rest } = p;
  const zutaten = (p.zutaten || []).map(z => {
    const { menge_je_variante, ...zr } = z;
    return mitMenge(zr, zutatMengeVariante(z, variante, p, basis));
  }).concat(basisZutaten(variante, p, basis));
  const vk = (vk_varianten && vk_varianten[variante]) || {};
  return {
    ...rest,
    id: p.id + v.idSuffix,
    name: variantenName(p.name, v),
    untergruppe: v.untergruppe,
    groesse: bowlGroesse(p),
    vk_in_brutto:  +(vk.vk_in_brutto  ?? p.vk_in_brutto)  || 0,
    vk_out_brutto: +(vk.vk_out_brutto ?? p.vk_out_brutto) || 0,
    zutaten,
    variante,
    basis_produkt_id: p.id,
  };
}

// Alle Produkte, Bowls mit wählbarer Basis je Variante einzeln. Das ist die
// Sicht der Kasse und der Bestell-App — und der Inhalt von produkte_aufgeloest.
export function aufgeloesteProdukte(produkte, basis) {
  const aus = [];
  for (const p of produkte || []) {
    if (basisWaehlbar(p, basis)) {
      for (const k of bowlVarianten(p, basis)) aus.push(bowlVariante(p, k, basis));
    } else {
      aus.push(p);
    }
  }
  return aus;
}

// Vollständiges Dokument, wie es nach Supabase bzw. in den Export geht.
export function dokumentZumSpeichern({ mix, produkte, bowlBasis, artikel, geloescht, bonVorlagen, importMappings, zutaten = [] }) {
  return {
    mix, produkte,
    bowl_basis: bowlBasis,
    // abgeleitet, bei jedem Speichern neu geschrieben - nie von Hand pflegen; auch die
    // Basiszeilen der Bowl-Varianten bekommen hier ihre zutat_id (Stufe 1, E11.2)
    produkte_aufgeloest: verknuepfeProdukte(aufgeloesteProdukte(produkte, bowlBasis), zutaten).produkte,
    // Zutatenstamm (E11, Stufe 1): eine Zeile je Zutat, Rezeptzeilen verweisen per zutat_id
    zutaten,
    artikel, geloescht, bon_vorlagen: bonVorlagen, import_mappings: importMappings,
  };
}

// Datenpflege-Befunde für den Bowls-Tab: Ei noch in Gramm, Varianten-
// Duplikate aus dem Import vom 03.09.2026 (eigene Produkte je Basis).
export const EI_MUSTER = /^(ei|eier)\b/i;
export const EI_GEWICHT_G = 50; // ein Ei = 50 g (bisherige Rezeptur, so rechnet auch der Bestellvorschlag)
// Versteckte Stueck-Zeilen: Aus der Excel-Zeit stehen Stueckartikel (Oreo, Wraps, Becher) als
// "1 g" in der Rezeptur, und ihr "Preis je Gramm" ist in Wahrheit der Stueckpreis. Erkennbar
// daran, dass Grammpreis und Stueckpreis des Artikels gleich sind. (Ei hat eine eigene Umstellung.)
export function versteckteStueckzeile(z, artikel) {
  if (!artikel || istStueck(z) || EI_MUSTER.test((z.name || "").trim())) return false;
  if (!STUECK_EINHEITEN.has(String(artikel.unit || "").toLowerCase()) && artikel.preisbasis !== "stueck") return false;
  const jeStueck = stueckpreis({ ...artikel, preisbasis: "stueck" });
  const proG = +artikel.price_per_gram_ml || 0;
  return jeStueck > 0 && proG > 0 && Math.abs(proG - jeStueck) / jeStueck < 0.05;
}

// Stueckzahlen je Groesse, wo sie nicht 1:1 aus der alten "Gramm"-Zahl folgen
// (Mark Twiehoff, 28.09.2026: Cookie Monster 400 ml 1 Keks, 500 und 600 ml je 2 Kekse).
export const STUECK_VORGABEN = [
  { artikel: /oreo/i, produkt: /cookie monster/i, jeMl: { 400: 1, 500: 2, 600: 2 } },
];
export function stueckVorgabe(z, produkt) {
  const v = STUECK_VORGABEN.find(x => x.artikel.test(z.name || "") && x.produkt.test(produkt.name || ""));
  const ml = (String(produkt.name || "").match(/(\d{3})\s*ml/i) || [])[1];
  return v && ml && v.jeMl[ml] != null ? v.jeMl[ml] : null;
}

// Gramm je Stueck eines Stueckartikels: gepflegt, sonst aus "(154g)" im Namen / Stueck je Packung
export function stueckGrammAusArtikel(a) {
  if (+a?.gewicht_je_stueck_g > 0) return +a.gewicht_je_stueck_g;
  const m = String(a?.ingredient_name || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const n = +a?.package_size || 0;
  return m && n > 1 ? Math.round((+m[1] / n) * 10) / 10 : null;
}

export function pflegeBefunde(produkte, basis, priceList = {}) {
  const eier = [];
  const stueck = [];
  for (const p of produkte || []) {
    (p.zutaten || []).forEach((z, i) => {
      if (EI_MUSTER.test((z.name || "").trim()) && !istStueck(z)) eier.push({ produkt: p, index: i, zutat: z });
      else if (versteckteStueckzeile(z, priceList[(z.name || "").toLowerCase()])) stueck.push({ produkt: p, index: i, zutat: z });
    });
  }
  const duplikate = (produkte || []).filter(p => {
    if (p.gruppe !== "Bowls") return false;
    const v = BOWL_VARIANTEN.find(x => x.idSuffix && String(p.id).endsWith(x.idSuffix));
    if (!v) return false;
    const basisId = String(p.id).slice(0, -v.idSuffix.length);
    const original = (produkte || []).find(x => x.id === basisId);
    return !!original && basisWaehlbar(original, basis);
  });
  return { eier, stueck, duplikate };
}

// ============================================================
//  DEMO-DATEN (laden bei App-Start, werden durch JSON-Upload ersetzt)
// ============================================================
export const DEMO_PRODUKTE = [
  // SMOOTHIES
  { id: "smo_green", name: "Green Booster", gruppe: "Smoothies", untergruppe: null,
    zutaten: [
      { name: "Babyspinat",   menge_g: 30,  lieferant: "Transgourmet", preis_pro_g: 0.0089, cost: 30  * 0.0089 },
      { name: "Banane",       menge_g: 100, lieferant: "Transgourmet", preis_pro_g: 0.0018, cost: 100 * 0.0018 },
      { name: "Apfelsaft",    menge_g: 200, lieferant: "Transgourmet", preis_pro_g: 0.0012, cost: 200 * 0.0012 },
      { name: "Ingwer frisch",menge_g: 5,   lieferant: "Transgourmet", preis_pro_g: 0.0078, cost: 5   * 0.0078 },
    ], verpackung_eur: 0.18, vk_in_brutto: 5.90, vk_out_brutto: 5.90 },

  { id: "smo_berry", name: "Berry Power", gruppe: "Smoothies", untergruppe: null,
    zutaten: [
      { name: "Heidelbeeren TK", menge_g: 80,  lieferant: "Transgourmet", preis_pro_g: 0.0099, cost: 80  * 0.0099 },
      { name: "Banane",          menge_g: 80,  lieferant: "Transgourmet", preis_pro_g: 0.0018, cost: 80  * 0.0018 },
      { name: "Orangensaft",     menge_g: 200, lieferant: "Transgourmet", preis_pro_g: 0.0015, cost: 200 * 0.0015 },
    ], verpackung_eur: 0.18, vk_in_brutto: 6.50, vk_out_brutto: 6.50 },

  // JUICES
  { id: "jui_orange", name: "Fresh Orange", gruppe: "Juices", untergruppe: null,
    zutaten: [
      { name: "Orangen frisch", menge_g: 500, lieferant: "Transgourmet", preis_pro_g: 0.0024, cost: 500 * 0.0024 },
    ], verpackung_eur: 0.18, vk_in_brutto: 4.90, vk_out_brutto: 4.90 },

  { id: "jui_immun", name: "Immun Shot Booster", gruppe: "Juices", untergruppe: null,
    zutaten: [
      { name: "Ingwer frisch", menge_g: 30, lieferant: "Transgourmet", preis_pro_g: 0.0078, cost: 30 * 0.0078 },
      { name: "Zitrone",       menge_g: 20, lieferant: "Transgourmet", preis_pro_g: 0.0035, cost: 20 * 0.0035 },
      { name: "Kurkuma",       menge_g: 5,  lieferant: "Transgourmet", preis_pro_g: 0.022,  cost: 5  * 0.022  },
    ], verpackung_eur: 0.10, vk_in_brutto: 2.90, vk_out_brutto: 2.90 },

  // ICED DRINKS — Iced Coffee Lattes
  { id: "ice_coffee", name: "Iced Caramel Latte", gruppe: "Iced Drinks", untergruppe: "Iced Coffee Lattes",
    zutaten: [
      { name: "Espresso",        menge_g: 18,  lieferant: "Transgourmet", preis_pro_g: 0.025, cost: 18  * 0.025 },
      { name: "Milch",           menge_g: 200, lieferant: "Transgourmet", preis_pro_g: 0.0012,cost: 200 * 0.0012 },
      { name: "Karamell-Sirup",  menge_g: 20,  lieferant: "Transgourmet", preis_pro_g: 0.006, cost: 20  * 0.006 },
      { name: "Eiswürfel",       menge_g: 80,  lieferant: "Transgourmet", preis_pro_g: 0.0002,cost: 80  * 0.0002 },
    ], verpackung_eur: 0.18, vk_in_brutto: 4.50, vk_out_brutto: 4.50 },

  // ICED DRINKS — Iced Matcha
  { id: "ice_matcha", name: "Iced Matcha Latte", gruppe: "Iced Drinks", untergruppe: "Iced Matcha",
    zutaten: [
      { name: "Matcha-Pulver",  menge_g: 3,   lieferant: "Transgourmet", preis_pro_g: 0.18,  cost: 3   * 0.18 },
      { name: "Milch",          menge_g: 220, lieferant: "Transgourmet", preis_pro_g: 0.0012,cost: 220 * 0.0012 },
      { name: "Honig",          menge_g: 10,  lieferant: "Transgourmet", preis_pro_g: 0.012, cost: 10  * 0.012 },
    ], verpackung_eur: 0.18, vk_in_brutto: 5.20, vk_out_brutto: 5.20 },

  // ICED DRINKS — Frozen Iced Tea
  { id: "ice_frozen", name: "Frozen Peach Iced Tea", gruppe: "Iced Drinks", untergruppe: "Frozen Iced Tea",
    zutaten: [
      { name: "Schwarztee",   menge_g: 200, lieferant: "Transgourmet", preis_pro_g: 0.002, cost: 200 * 0.002 },
      { name: "Pfirsich TK",  menge_g: 60,  lieferant: "Transgourmet", preis_pro_g: 0.005, cost: 60  * 0.005 },
      { name: "Eiswürfel",    menge_g: 120, lieferant: "Transgourmet", preis_pro_g: 0.0002,cost: 120 * 0.0002 },
    ], verpackung_eur: 0.18, vk_in_brutto: 4.90, vk_out_brutto: 4.90 },

  // ICED DRINKS — Refresher
  { id: "ice_refresh", name: "Berry Refresher", gruppe: "Iced Drinks", untergruppe: "Refresher",
    zutaten: [
      { name: "Beerenmix TK", menge_g: 60,  lieferant: "Transgourmet", preis_pro_g: 0.009, cost: 60  * 0.009 },
      { name: "Sprudelwasser",menge_g: 250, lieferant: "Transgourmet", preis_pro_g: 0.0004,cost: 250 * 0.0004 },
      { name: "Limette",      menge_g: 10,  lieferant: "Transgourmet", preis_pro_g: 0.005, cost: 10  * 0.005 },
    ], verpackung_eur: 0.18, vk_in_brutto: 4.50, vk_out_brutto: 4.50 },

  // BOWLS
  { id: "bow_acai", name: "Acai Classic Bowl", gruppe: "Bowls", untergruppe: null,
    zutaten: [
      { name: "Acai-Sorbet",       menge_g: 150, lieferant: "Transgourmet", preis_pro_g: 0.012, cost: 150 * 0.012 },
      { name: "Banane",            menge_g: 80,  lieferant: "Transgourmet", preis_pro_g: 0.0018,cost: 80  * 0.0018 },
      { name: "Granola",           menge_g: 30,  lieferant: "Transgourmet", preis_pro_g: 0.008, cost: 30  * 0.008 },
      { name: "Heidelbeeren frisch",menge_g:30,  lieferant: "Transgourmet", preis_pro_g: 0.014, cost: 30  * 0.014 },
      { name: "Erdnussbutter",     menge_g: 15,  lieferant: "Transgourmet", preis_pro_g: 0.011, cost: 15  * 0.011 },
    ], verpackung_eur: 0.22, vk_in_brutto: 8.90, vk_out_brutto: 8.90 },

  { id: "bow_buddha", name: "Buddha Bowl", gruppe: "Bowls", untergruppe: null,
    zutaten: [
      { name: "Reis",            menge_g: 120, lieferant: "Transgourmet", preis_pro_g: 0.0028, cost: 120 * 0.0028 },
      { name: "Falafel",         menge_g: 60,  lieferant: "Transgourmet", preis_pro_g: 0.012,  cost: 60  * 0.012 },
      { name: "Hummus",          menge_g: 40,  lieferant: "Transgourmet", preis_pro_g: 0.009,  cost: 40  * 0.009 },
      { name: "Mixsalat",        menge_g: 60,  lieferant: "Transgourmet", preis_pro_g: 0.0048, cost: 60  * 0.0048 },
      { name: "Avocado",         menge_g: 50,  lieferant: "Transgourmet", preis_pro_g: 0.012,  cost: 50  * 0.012 },
      { name: "Tahini-Dressing", menge_g: 20,  lieferant: "Transgourmet", preis_pro_g: 0.008,  cost: 20  * 0.008 },
    ], verpackung_eur: 0.32, vk_in_brutto: 9.90, vk_out_brutto: 9.90 },

  // WRAPS
  { id: "wrap_caesar", name: "Caesar Chicken Wrap", gruppe: "Wraps", untergruppe: null,
    zutaten: [
      { name: "Tortilla Wrap natur",   menge_g: 1,  lieferant: "Transgourmet", preis_pro_g: 0.324, cost: 0.324 },
      { name: "Frischkäse",            menge_g: 15, lieferant: "Transgourmet", preis_pro_g: 0.013, cost: 15 * 0.013 },
      { name: "Mixsalat",              menge_g: 60, lieferant: "Transgourmet", preis_pro_g: 0.0048,cost: 60 * 0.0048 },
      { name: "Halbgetrocknete Tomate",menge_g: 25, lieferant: "Transgourmet", preis_pro_g: 0.013, cost: 25 * 0.013 },
      { name: "Grana Padano",          menge_g: 20, lieferant: "Transgourmet", preis_pro_g: 0.019, cost: 20 * 0.019 },
      { name: "Hähnchen",              menge_g: 50, lieferant: "Transgourmet", preis_pro_g: 0.0072,cost: 50 * 0.0072 },
      { name: "Caesar Dressing",       menge_g: 20, lieferant: "Transgourmet", preis_pro_g: 0.006, cost: 20 * 0.006 },
    ], verpackung_eur: 0.15, vk_in_brutto: 7.95, vk_out_brutto: 7.95 },

  { id: "wrap_falafel", name: "Falafel Oriental Wrap", gruppe: "Wraps", untergruppe: null,
    zutaten: [
      { name: "Tortilla Wrap Spinat", menge_g: 1,  lieferant: "Transgourmet", preis_pro_g: 0.29, cost: 0.29 },
      { name: "Hummus",               menge_g: 30, lieferant: "Transgourmet", preis_pro_g: 0.009,cost: 30 * 0.009 },
      { name: "Falafel",              menge_g: 60, lieferant: "Transgourmet", preis_pro_g: 0.012,cost: 60 * 0.012 },
      { name: "Mixsalat",             menge_g: 50, lieferant: "Transgourmet", preis_pro_g: 0.0048,cost: 50 * 0.0048 },
      { name: "Rotkohl",              menge_g: 20, lieferant: "Transgourmet", preis_pro_g: 0.003,cost: 20 * 0.003 },
      { name: "Tahini-Dressing",      menge_g: 15, lieferant: "Transgourmet", preis_pro_g: 0.008,cost: 15 * 0.008 },
    ], verpackung_eur: 0.15, vk_in_brutto: 7.50, vk_out_brutto: 7.50 },

  // KAMPAGNE
  { id: "kam_thai", name: "Thai Curry Bowl (Kampagne)", gruppe: "Kampagnen", untergruppe: null,
    zutaten: [
      { name: "Reis",              menge_g: 130, lieferant: "Transgourmet", preis_pro_g: 0.0028, cost: 130 * 0.0028 },
      { name: "Hähnchen",          menge_g: 70,  lieferant: "Transgourmet", preis_pro_g: 0.0072, cost: 70  * 0.0072 },
      { name: "Thai-Curry-Sauce",  menge_g: 80,  lieferant: "Transgourmet", preis_pro_g: 0.011,  cost: 80  * 0.011 },
      { name: "Erdnüsse",          menge_g: 10,  lieferant: "Transgourmet", preis_pro_g: 0.015,  cost: 10  * 0.015 },
      { name: "Koriander",         menge_g: 5,   lieferant: "Transgourmet", preis_pro_g: 0.012,  cost: 5   * 0.012 },
    ], verpackung_eur: 0.32, vk_in_brutto: 9.90, vk_out_brutto: 9.90,
    kampagne_start: "2026-04-15", kampagne_ende: "2026-06-30" },
];

