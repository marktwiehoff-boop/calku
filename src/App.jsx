import { useState, useMemo, useRef, useEffect } from "react";
import {
  Download, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronRight,
  RotateCcw, Calendar, Search, Plus, Trash2, Info, TrendingUp, Package,
  Pencil, X, Lock, Check
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import Papa from "papaparse";
import { verarbeitePreisimport, erkenneSpalten, spaltenSignatur } from "./preisimport.js";
import rezeptdatenbankJson from "./data/rezeptdatenbank.json";
import smoothiesV3 from "./data/smoothies_v3.json";
import juicesV3 from "./data/juices_v3.json";
import refresherV1 from "./data/refresher_v1.json";
import bowlsV2 from "./data/bowls_v2.json";
import wrapsV1 from "./data/wraps_v1.json";
import icedDrinksV1 from "./data/iced_drinks_v1.json";
import standAktuell from "./data/stand_2026-06-05.json"; // Aktueller Stand inkl. Susannes Korrekturen (05.06.2026)
import {
  cloudEnabled, isWriter, signInWithGoogle, signOut,
  loadKalkulation, saveKalkulation, subscribeKalkulation, supabase,
} from "./supabase";
import naehrwerteJson from "./data/naehrwerte.json";
import inventurJson from "./data/inventur.json";
import logoWeiss from "./assets/logo-weiss.png";
import BonsTab from "./BonsTab.jsx";
import { bonStatus } from "./bon.js";

// ============================================================
//  FORMATTER (de-DE)
// ============================================================
const fmtEUR  = v => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const fmtEUR0 = v => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
const fmtPct  = v => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0) + " %";
const fmtNum  = v => new Intl.NumberFormat("de-DE").format(Math.round(v || 0));
const fmtNum2 = v => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const fmtMenge = v => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v || 0);
const fmtDate = d => d ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "—";

// ============================================================
//  STAMMDATEN: Warengruppen + Schwellwerte
// ============================================================
// Mark hat verbindlich vorgegeben:
//   Smoothies / Juices / Iced Drinks: max. 24% Wareneinsatz, darüber rot
//   Bowls / Wraps / Kampagnen:        max. 26% Wareneinsatz, darüber rot
// Binäre Ampel ohne Gelb-Puffer.
const SCHWELLWERTE = {
  "Smoothies":   { rot: 24 },
  "Juices":      { rot: 24 },
  "Iced Drinks": { rot: 24 },
  "Bowls":       { rot: 26 },
  "Wraps":       { rot: 26 },
  "Kampagnen":   { rot: 26 },
  "Archiv":      { rot: 30 },
};

const WARENGRUPPEN  = ["Smoothies", "Juices", "Iced Drinks", "Bowls", "Wraps", "Kampagnen"];
const ICED_SUBGROUPS = ["Classic Iced Matcha", "Sweet Iced Matcha", "Frozen Iced Tea", "Refresher", "Iced Coffee Lattes"];
const BOWL_SUBGROUPS = ["Salatbowls", "Kartoffelbowls", "Reisbowls"];
// Untergruppen je Warengruppe (für Reiter-Unterfilter + Edit-Dialog)
const SUBGROUPS_BY_GRUPPE = { "Iced Drinks": ICED_SUBGROUPS, "Bowls": BOWL_SUBGROUPS };
// Default-Untergruppe, wenn am Produkt keine gesetzt ist
const DEFAULT_UNTERGRUPPE = { "Bowls": "Salatbowls" };
const untergruppeVon = (p) => p.untergruppe || DEFAULT_UNTERGRUPPE[p.gruppe] || null;

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
const BOWL_VARIANTEN = [
  { key: "salat",     label: "Salatbowl",     kurz: "Salat",     untergruppe: "Salatbowls",     idSuffix: "",           nameZusatz: "" },
  { key: "kartoffel", label: "Kartoffelbowl", kurz: "Kartoffel", untergruppe: "Kartoffelbowls", idSuffix: "_kartoffel", nameZusatz: "Kartoffel" },
  { key: "reis",      label: "Reisbowl",      kurz: "Reis",      untergruppe: "Reisbowls",      idSuffix: "_reis",      nameZusatz: "Reis" },
];
const BOWL_VARIANTE = Object.fromEntries(BOWL_VARIANTEN.map(v => [v.key, v]));
const BOWL_GROESSEN = [["normal", "Normal"], ["klein", "Klein"]];

// Vorgabe, solange im Dokument keine Basis gepflegt ist. Mengen: Rezeptur-
// Entscheidung Mark 03./05.09.2026 (Salatmix 100 g Salatbowl, 50 g Kartoffel-
// und Reisbowl; Kartoffeln gegart 230 g, Basissauce 40 g, Röstzwiebeln 5 g;
// Reis 150 g). Klein = zwei Drittel auf 5 g gerundet, Salatmix klein halbiert
// — bitte im Bowls-Tab bestätigen. Preise aus den CALKU-Rezepten (Quark
// Kartoffel Bowl, Korean Glaze Bowl) bzw. der TG-Einkaufspreisliste.
const DEFAULT_BOWL_BASIS = {
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
const PL_FILLER = new Set([
  "tk", "ig", "bio", "immergrün", "immergruen", "frisch", "natur", "geröstet", "geroestet",
  "gekocht", "gegart", "gerieben", "gehackt", "vegan", "veg", "art", "stk", "mit", "und",
  "der", "die", "das", "topping", "sorte", "gross", "groß", "klein", "hausgem", "hausgemacht",
]);
function ztCompact(s) {
  return String(s || "").toLowerCase()
    .replace(/[,(].*$/, "")            // alles ab Komma/Klammer abschneiden
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-zäöüß ]/g, " ")
    .split(/\s+/).filter(t => t && !PL_FILLER.has(t)).join("");
}
const sortChars = (s) => s.split("").sort().join("");
function buildPlIndex(priceList) {
  return Object.values(priceList || {})
    .map(e => ({ proG: e?.price_per_gram_ml, comp: ztCompact(e?.ingredient_name || "") }))
    .filter(e => e.comp && e.proG);
}
// Liefert preis_pro_g aus der Preisliste oder 0. Reihenfolge: exakt > Präfix > Anagramm > Teilstring.
function findPreisProG(name, plIndex) {
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
const MWST_SPEISEN  = 0.07;
const MWST_GETRAENK = 0.19;

// Vorgabe je Warengruppe. Kampagnen sind gemischt - Bagel, Korean Glaze
// Bowl, Acai und Frozen Yoghurt sind Speisen, ein Dragon Fruit Refresher
// ist es nicht. Deshalb steht dort 7 % als Vorgabe, und der Satz laesst
// sich am einzelnen Rezept uebersteuern.
const MWST_GRUPPE = {
  "Smoothies":   MWST_SPEISEN,
  "Juices":      MWST_GETRAENK,
  "Iced Drinks": MWST_GETRAENK,
  "Bowls":       MWST_SPEISEN,
  "Wraps":       MWST_SPEISEN,
  "Kampagnen":   MWST_SPEISEN,
};

// Satz eines Produkts: ein am Rezept hinterlegter Wert schlaegt die Vorgabe.
function mwstSatz(p) {
  const eigen = +(p && p.mwst_satz);
  if (eigen === MWST_SPEISEN || eigen === MWST_GETRAENK) return eigen;
  return MWST_GRUPPE[p && p.gruppe] ?? MWST_GETRAENK;
}
const SCHWUND_PCT = 3.0; // Sicherheitspuffer Soll → Soll-inkl-Schwund

// ============================================================
//  AMPEL-LOGIK
// ============================================================
function ampelFarbe(quote, gruppe) {
  const s = SCHWELLWERTE[gruppe] || SCHWELLWERTE["Archiv"];
  if (quote > s.rot) return { stufe: "rot",   bg: "bg-red-50",   text: "text-red-800",   border: "border-red-300",   dot: "bg-red-500" };
  return                    { stufe: "gruen", bg: "bg-green-50", text: "text-green-800", border: "border-green-300", dot: "bg-green-500" };
}

// ============================================================
//  GRÖßEN-GRUPPIERUNG (Smoothies, Juices)
// ============================================================
// Erkennt am Produktname-Ende eine Füllmenge ("400ml", "0,3l", "300 ml")
// und trennt sie vom Basis-Namen ("Erdbeerliebe 400ml" → "Erdbeerliebe" + "400 ml").
const GRUPPIERBARE = new Set(["Smoothies", "Juices"]);

function extractSize(name, gruppe) {
  if (!GRUPPIERBARE.has(gruppe)) return { base: name, size: null };
  const mMl = name.match(/^(.+?)\s+(\d+)\s*ml\s*$/i);
  if (mMl) return { base: mMl[1].trim(), size: `${mMl[2]} ml` };
  const mL = name.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)\s*l\s*$/i);
  if (mL) return { base: mL[1].trim(), size: `${mL[2].replace(".", ",")} l` };
  return { base: name, size: null };
}

function sizeToMl(size) {
  if (!size) return 0;
  const ml = size.match(/^(\d+)\s*ml/i);
  if (ml) return +ml[1];
  const l = size.match(/^(\d+(?:[,.]\d+)?)\s*l/i);
  if (l) return parseFloat(l[1].replace(",", ".")) * 1000;
  return 0;
}

function gruppiereProdukte(produkte, gruppe) {
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

function fmtRange(arr, formatter) {
  if (arr.length === 0) return "—";
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (Math.abs(min - max) < 0.005) return formatter(min);
  return `${formatter(min)} – ${formatter(max)}`;
}

// ============================================================
//  MAPPING: alte Excel-Kategorien → neue Hierarchie
// ============================================================
function mapToWarengruppe(altKategorie, rezeptName) {
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
function normalizeRecipe(raw, priceList) {
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
function ausbeuteFaktor(z) {
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
const EINHEITEN = [
  { key: "g",   menge: "g",   preis: "€/kg"  },
  { key: "ml",  menge: "ml",  preis: "€/l"   },
  { key: "stk", menge: "Stk", preis: "€/Stk" },
];
const EINHEIT = Object.fromEntries(EINHEITEN.map(e => [e.key, e]));
function zutatEinheit(z) {
  const e = z && z.einheit;
  return e === "stk" || e === "ml" ? e : "g";
}
const istStueck = (z) => zutatEinheit(z) === "stk";
// Menge in der Einheit der Zeile
function zutatMenge(z) {
  return istStueck(z) ? (+(z && z.menge_stk) || 0) : (+(z && z.menge_g) || 0);
}
// Preis in der Anzeige-Einheit der Zeile: €/kg bzw. €/l, bei Stück €/Stk
function zutatPreisAnzeige(z) {
  return istStueck(z) ? (+(z && z.preis_je_stueck) || 0) : (+(z && z.preis_pro_g) || 0) * 1000;
}

function zutatKosten(z) {
  if (istStueck(z)) {
    return ((+(z && z.menge_stk) || 0) * (+(z && z.preis_je_stueck) || 0)) / ausbeuteFaktor(z);
  }
  return ((+(z && z.menge_g) || 0) * (+(z && z.preis_pro_g) || 0)) / ausbeuteFaktor(z);
}

// Der eine Weg, eine Rezeptzeile nach einer Änderung konsistent zu machen:
// Stück-Zeilen bekommen ihr Gramm-Äquivalent, jede Zeile neue Kosten.
function normalisiereZutat(z) {
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
function mitMenge(z, menge) {
  const m = Math.max(0, +menge || 0);
  return normalisiereZutat(istStueck(z) ? { ...z, menge_stk: m } : { ...z, menge_g: m });
}
// Anzeigepreis einer Zeile setzen (€/kg, €/l oder €/Stk) und neu rechnen
function mitPreis(z, preisAnzeige) {
  const p = Math.max(0, +preisAnzeige || 0);
  return normalisiereZutat(istStueck(z) ? { ...z, preis_je_stueck: p } : { ...z, preis_pro_g: p / 1000 });
}
// Einheit wechseln. Die Zahlen auf dem Bildschirm bleiben stehen, nur die
// Einheit dahinter ändert sich: aus „1 g · 0,28 €/kg“ (so stand das Ei
// bisher da) wird „1 Stk · 0,28 €/Stk“.
function mitEinheit(z, einheit, artikel) {
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
const PREISBASEN = [["gramm", "pro Gramm"], ["stueck", "Stück"], ["ml100", "pro 100 ml"]];
const STUECK_EINHEITEN = new Set(["stück", "stueck", "stk", "stk.", "st", "st.", "stck"]);

function preisbasisAuto(a) {
  const einheit = String((a && a.unit) || "").toLowerCase();
  if (einheit === "ml" || einheit === "l") return "ml100";
  if (einheit === "g" || einheit === "kg" || einheit === "kiste") return "gramm";
  if (STUECK_EINHEITEN.has(einheit)) return "stueck";
  if ((+(a && a.package_size) || 0) <= 5) return "stueck";
  return "gramm";
}

function istStueckArtikel(a) {
  return !!a && ((a.preisbasis || preisbasisAuto(a)) === "stueck");
}

// Stueckpreis eines Stueck-Artikels: Packungspreis / Stueck je Packung
// (Eier: 8,45 EUR / 30 = 0,28 EUR; Gurke: 1,00 EUR / 1 = 1,00 EUR).
function stueckpreis(a) {
  if (!istStueckArtikel(a)) return null;
  const preis = +(a && a.package_price) || 0;
  const anzahl = +(a && a.package_size) || 1;
  return preis > 0 ? preis / Math.max(1, anzahl) : null;
}

function stueckgewicht(a) {
  if (!istStueckArtikel(a)) return null;
  const manuell = +(a && a.gewicht_je_stueck_g) || 0;
  if (manuell > 0) return manuell;
  const preis = stueckpreis(a);
  const proG = +(a && a.price_per_gram_ml) || 0;
  return preis > 0 && proG > 0 ? preis / proG : null;
}

function berechne(produkt) {
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
function bowlBasisOderDefault(basis) {
  return basis && basis.varianten ? basis : DEFAULT_BOWL_BASIS;
}

// Größe einer Bowl: explizit (p.groesse) oder aus dem Namen („… Klein“).
function bowlGroesse(p) {
  if (p?.groesse === "klein" || p?.groesse === "normal") return p.groesse;
  return /\bklein\b/i.test(p?.name || "") ? "klein" : "normal";
}

// Welche Basen bietet eine Bowl? Explizit (p.varianten), sonst aus der
// Untergruppe (Reisbowls → nur Reis), sonst: steckt eine Basiszutat schon im
// Rezept selbst (Quark Kartoffel Bowl), ist es genau diese Variante — alles
// andere ist eine Bowl mit wählbarer Basis (Salat / Kartoffel / Reis).
function bowlVarianten(p, basis) {
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
function basisWaehlbar(p, basis) {
  const v = bowlVarianten(p, basis);
  return !!v && v.length > 1;
}

// Untergruppe in der Kassen-Sicht: Einzelvarianten tragen ihre Basis, auch
// wenn am Produkt keine Untergruppe gepflegt ist (Quark Kartoffel Bowl).
function bowlUntergruppe(p, basis) {
  const v = bowlVarianten(p, basis);
  if (v && v.length === 1) return BOWL_VARIANTE[v[0]].untergruppe;
  return untergruppeVon(p);
}

function istSalatZutat(z, basis) {
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
function zutatMengeVariante(z, variante, p, basis) {
  const ausnahme = z?.menge_je_variante?.[variante];
  if (ausnahme != null && ausnahme !== "") return Math.max(0, +ausnahme || 0);
  if (variante !== "salat" && istSalatZutat(z, basis)) {
    const regel = bowlBasisOderDefault(basis).salat?.menge?.[bowlGroesse(p)]?.[variante];
    if (regel != null && regel !== "") return Math.max(0, +regel || 0);
  }
  return zutatMenge(z);
}

// Zeilen der zentralen Basis für eine Variante und Größe, als Rezeptzeilen.
function basisZutaten(variante, p, basis) {
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
function variantenName(name, v) {
  if (!v.nameZusatz) return name;
  const m = String(name || "").match(/^(.*?)(\s+(?:Normal|Klein))$/i);
  return m ? `${m[1]} ${v.nameZusatz}${m[2]}` : `${name} ${v.nameZusatz}`;
}

// Eine Variante als eigenständiges Produkt — berechne() rechnet sie wie
// jedes andere. Genau so landet sie in produkte_aufgeloest.
function bowlVariante(p, variante, basis) {
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
function aufgeloesteProdukte(produkte, basis) {
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
function dokumentZumSpeichern({ mix, produkte, bowlBasis, artikel, geloescht, bonVorlagen, importMappings }) {
  return {
    mix, produkte,
    bowl_basis: bowlBasis,
    // abgeleitet, bei jedem Speichern neu geschrieben - nie von Hand pflegen
    produkte_aufgeloest: aufgeloesteProdukte(produkte, bowlBasis),
    artikel, geloescht, bon_vorlagen: bonVorlagen, import_mappings: importMappings,
  };
}

// Datenpflege-Befunde für den Bowls-Tab: Ei noch in Gramm, Varianten-
// Duplikate aus dem Import vom 03.09.2026 (eigene Produkte je Basis).
const EI_MUSTER = /^(ei|eier)\b/i;
const EI_GEWICHT_G = 50; // ein Ei = 50 g (bisherige Rezeptur, so rechnet auch der Bestellvorschlag)
function pflegeBefunde(produkte, basis) {
  const eier = [];
  for (const p of produkte || []) {
    (p.zutaten || []).forEach((z, i) => {
      if (EI_MUSTER.test((z.name || "").trim()) && !istStueck(z)) eier.push({ produkt: p, index: i, zutat: z });
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
  return { eier, duplikate };
}

// ============================================================
//  DEMO-DATEN (laden bei App-Start, werden durch JSON-Upload ersetzt)
// ============================================================
const DEMO_PRODUKTE = [
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

// ============================================================
//  KOMPONENTEN
// ============================================================
function KPICard({ title, value, sub, stufe }) {
  const styles = {
    rot:   "bg-red-50    border-red-300    text-red-800",
    gruen: "bg-green-50  border-green-300  text-green-800",
    info:  "bg-blue-50   border-blue-300   text-blue-800",
    grau:  "bg-gray-50   border-gray-200   text-gray-800",
  };
  return (
    <div className={`border rounded-xl p-4 ${styles[stufe || "grau"]}`}>
      <div className="text-xs font-medium opacity-70 uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-bold mt-1 leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

function AmpelDot({ quote, gruppe }) {
  const a = ampelFarbe(quote, gruppe);
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${a.dot}`} title={`Schwellwert ${gruppe}: rot > ${SCHWELLWERTE[gruppe].rot}%`} />;
}

// Editierbarer Zahlen-Input (Inline) — stopPropagation, damit Klick ins Feld nicht die Zeile zuklappt
function EditNum({ value, onChange, step = "0.01", min = "0", suffix, width = "w-20" }) {
  return (
    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        type="number" step={step} min={min} value={value}
        onChange={e => onChange(e.target.value)}
        className={`${width} text-right tabular-nums bg-transparent border-b border-gray-200 hover:border-gray-400 focus:border-emerald-600 focus:outline-none px-1 py-0.5`}
      />
      {suffix && <span className="text-gray-500">{suffix}</span>}
    </span>
  );
}

// readOnly: abgeleitete Zeilen (Bowl-Variante in der Kassen-Sicht) zeigen nur;
// bearbeitet wird das Grundrezept unter „Alle“ bzw. im Bearbeiten-Dialog.
function ProduktZeile({ p, calc, gruppe, expanded, onToggle, onUpdate, onEdit, onDelete, displayName, indent, readOnly, hinweis }) {
  const aIn  = ampelFarbe(calc.we_in,  gruppe);
  const aOut = ampelFarbe(calc.we_out, gruppe);
  const editierbar = !readOnly && typeof onUpdate === "function";

  const updateZutat = (idx, field, value) => {
    const zutaten = p.zutaten.map((z, i) => {
      if (i !== idx) return z;
      return field === "menge" ? mitMenge(z, value) : mitPreis(z, value);
    });
    onUpdate({ zutaten });
  };
  const hatBasis = (p.zutaten || []).some(z => z.basis);

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          <div className={`flex items-center gap-2 ${indent ? "pl-8" : ""}`}>
            {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            <span className={`${indent ? "text-gray-700" : "font-medium text-gray-800"}`}>{displayName || p.name}</span>
            {p.untergruppe && <span className="text-xs text-gray-400">({p.untergruppe})</span>}
            {hinweis && <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">{hinweis}</span>}
            <span className="ml-2 inline-flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(p); }}
                className="text-gray-300 hover:text-emerald-600 p-1" title="Bearbeiten">
                <Pencil size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Rezept "${p.name}" wirklich löschen?`)) onDelete && onDelete(p.basis_produkt_id || p.id); }}
                className="text-gray-300 hover:text-red-600 p-1" title="Löschen">
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.wareneinsatz)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(p.vk_in_brutto)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-500 text-xs">{fmtEUR(calc.vk_in_netto)}</td>
        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={calc.we_in} gruppe={gruppe} />
            {fmtPct(calc.we_in)}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.db_in)}</td>
        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={calc.we_out} gruppe={gruppe} />
            {fmtPct(calc.we_out)}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.db_out)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide flex items-center gap-2">
              Zutaten <span className="text-gray-400 normal-case font-normal">
                {editierbar ? "— Mengen und Preise sind editierbar" : "— abgeleitet aus dem Grundrezept; bearbeiten unter „Alle“ oder über den Stift"}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left  px-2 py-1 font-medium">Zutat</th>
                  <th className="text-right px-2 py-1 font-medium">Menge</th>
                  <th className="text-right px-2 py-1 font-medium">Preis</th>
                  <th className="text-right px-2 py-1 font-medium">Kosten</th>
                  <th className="text-left  px-2 py-1 font-medium">Lieferant</th>
                </tr>
              </thead>
              <tbody>
                {p.zutaten.map((z, i) => {
                  const e = EINHEIT[zutatEinheit(z)];
                  const ohneGewicht = istStueck(z) && !(+z.gramm_je_stueck > 0);
                  return (
                  <tr key={i} className={`border-t border-gray-100 ${z.basis ? "text-gray-500 bg-emerald-50/30" : ""}`}>
                    <td className="px-2 py-1 text-gray-700">
                      {z.name}
                      {z.basis && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">Basis</span>}
                      {ohneGewicht && (
                        <span className="ml-1.5 text-[10px] text-amber-700"
                          title="g/Stück fehlt — ohne Gramm-Äquivalent fehlt die Zutat im Bestellvorschlag. Pflege im Bearbeiten-Dialog oder im Tab Einkaufspreise.">
                          ⚠ g/Stk fehlt
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editierbar && !z.basis
                        ? <EditNum value={zutatMenge(z)} step="1" suffix={e.menge} width="w-16" onChange={v => updateZutat(i, "menge", v)} />
                        : <span>{fmtMenge(zutatMenge(z))} <span className="text-gray-500">{e.menge}</span></span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editierbar && !z.basis
                        ? <EditNum value={+zutatPreisAnzeige(z).toFixed(2)} step="0.01" suffix={e.preis} width="w-20" onChange={v => updateZutat(i, "preis", v)} />
                        : <span>{fmtNum2(zutatPreisAnzeige(z))} <span className="text-gray-500">{e.preis}</span></span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums"
                        title={z.ausbeute_prozent && z.ausbeute_prozent < 100
                          ? `inkl. Ausbeute ${z.ausbeute_prozent} % (Pflege im Tab Einkaufspreise)` : undefined}>
                      {fmtEUR(z.cost)}{z.ausbeute_prozent && z.ausbeute_prozent < 100 ? "*" : ""}
                    </td>
                    <td className="px-2 py-1 text-gray-500">{z.lieferant}</td>
                  </tr>
                  );
                })}
                <tr className="border-t border-gray-300 font-medium">
                  <td className="px-2 py-1">Material</td>
                  <td colSpan={2} />
                  <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(calc.material)}</td>
                  <td />
                </tr>
                <tr className="text-gray-600">
                  <td className="px-2 py-1">+ Verpackung</td>
                  <td colSpan={2} className="text-right">
                    {editierbar
                      ? <EditNum value={+(p.verpackung_eur || 0).toFixed(2)} step="0.01" suffix="€" width="w-16"
                          onChange={v => onUpdate({ verpackung_eur: Math.max(0, +v || 0) })} />
                      : <span className="tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</span>}
                  </td>
                  <td />
                  <td />
                </tr>
                <tr className="font-semibold text-gray-800">
                  <td className="px-2 py-1">= Wareneinsatz außer Haus</td>
                  <td colSpan={2} />
                  <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(calc.wareneinsatz)}</td>
                  <td />
                </tr>
                {p.zutaten.some(z => z.ausbeute_prozent && z.ausbeute_prozent < 100) && (
                  <tr>
                    <td colSpan={5} className="px-2 pt-1 text-[11px] text-gray-400">
                      * inkl. Ausbeute — zentral gepflegt im Tab „Einkaufspreise".
                    </td>
                  </tr>
                )}
                {hatBasis && (
                  <tr>
                    <td colSpan={5} className="px-2 pt-1 text-[11px] text-gray-400">
                      Basis-Zeilen kommen aus der zentralen Basis-Rezeptur (Bowls-Tab, oben) und gelten für alle Bowls mit wählbarer Basis.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// Sammelzeile für eine Sorte (z. B. „Erdbeerliebe" mit 3 Größen) — gruppierter Modus
function SortenGruppeZeile({ sorte, gruppe, expanded, onToggle, expandedProdukt, onToggleProdukt, onUpdate, onEdit, onDelete }) {
  const calcs = sorte.items.map(p => ({ p, c: berechne(p) }));
  const weInArr  = calcs.map(x => x.c.we_in);
  const weOutArr = calcs.map(x => x.c.we_out);
  const wareArr  = calcs.map(x => x.c.wareneinsatz);
  const vkInArr      = calcs.map(x => x.p.vk_in_brutto);
  const vkInNettoArr = calcs.map(x => x.c.vk_in_netto);
  const dbInArr  = calcs.map(x => x.c.db_in);
  const dbOutArr = calcs.map(x => x.c.db_out);

  // Ampel-Farbe = schlechtester (höchster) WE-Wert in der Gruppe
  const worstWeIn  = Math.max(...weInArr);
  const worstWeOut = Math.max(...weOutArr);
  const aIn  = ampelFarbe(worstWeIn,  gruppe);
  const aOut = ampelFarbe(worstWeOut, gruppe);

  return (
    <>
      <tr className="border-b border-gray-200 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown size={14} className="text-emerald-700" />
              : <ChevronRight size={14} className="text-emerald-700" />}
            <span className="font-semibold text-gray-800">{sorte.base}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(wareArr, fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(vkInArr, fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmtRange(vkInNettoArr, fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstWeIn} gruppe={gruppe} />
            {fmtRange(weInArr, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(dbInArr, fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstWeOut} gruppe={gruppe} />
            {fmtRange(weOutArr, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(dbOutArr, fmtEUR)}</td>
      </tr>
      {expanded && calcs.map(({ p, c }) => (
        <ProduktZeile
          key={p.id}
          p={p}
          calc={c}
          gruppe={gruppe}
          displayName={p._size || p.name}
          indent
          expanded={expandedProdukt === p.id}
          onToggle={() => onToggleProdukt(p.id)}
          onUpdate={(updates) => onUpdate(p.id, updates)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

// ============================================================
//  BOWLS: eine Zeile je Bowl, darunter die Varianten Salat / Kartoffel / Reis
// ============================================================
function BowlZeile({ p, gruppe, basis, expanded, onToggle, onUpdate, onEdit, onDelete, canEdit }) {
  const keys = bowlVarianten(p, basis) || ["salat"];
  const varianten = keys.map(k => {
    const vp = bowlVariante(p, k, basis);
    return { key: k, def: BOWL_VARIANTE[k], vp, c: berechne(vp) };
  });
  const groesse = bowlGroesse(p);
  const arr = (f) => varianten.map(f);
  const weIn = arr(x => x.c.we_in), weOut = arr(x => x.c.we_out);
  const worstIn = Math.max(...weIn), worstOut = Math.max(...weOut);
  const aIn = ampelFarbe(worstIn, gruppe), aOut = ampelFarbe(worstOut, gruppe);
  const editierbar = canEdit && typeof onUpdate === "function";

  // Salat-Spalte = Menge des Rezepts; Kartoffel-/Reis-Spalte = Ausnahme nur
  // für diese Bowl (leer = zurück zur Regel bzw. zur Rezeptmenge).
  const updateZutat = (idx, field, value, variante) => {
    if (!editierbar) return;
    const zutaten = p.zutaten.map((z, i) => {
      if (i !== idx) return z;
      if (field === "preis") return mitPreis(z, value);
      if (variante === "salat") return mitMenge(z, value);
      const mjv = { ...(z.menge_je_variante || {}) };
      if (value === "" || value == null) delete mjv[variante];
      else mjv[variante] = Math.max(0, +value || 0);
      const next = { ...z, menge_je_variante: mjv };
      if (!Object.keys(mjv).length) delete next.menge_je_variante;
      return next;
    });
    onUpdate({ zutaten });
  };

  // VK je Variante: Salat = VK des Rezepts; Kartoffel/Reis nur, wenn er
  // abweicht (sonst gilt der VK des Rezepts).
  const updateVk = (variante, wert) => {
    if (!editierbar) return;
    const v = Math.max(0, +wert || 0);
    if (variante === "salat") { onUpdate({ vk_in_brutto: v, vk_out_brutto: v }); return; }
    const vkv = { ...(p.vk_varianten || {}) };
    if (v > 0 && Math.abs(v - (+p.vk_out_brutto || 0)) > 0.004) vkv[variante] = { vk_in_brutto: v, vk_out_brutto: v };
    else delete vkv[variante];
    onUpdate({ vk_varianten: Object.keys(vkv).length ? vkv : undefined });
  };

  const basisZeilen = varianten.filter(x => x.key !== "salat")
    .flatMap(x => basisZutaten(x.key, p, basis).map(bz => ({ ...bz, _variante: x.key })));
  const th = (text, right = true, key) => (
    <th key={key} className={`${right ? "text-right" : "text-left"} px-2 py-1 font-medium`}>{text}</th>
  );

  return (
    <>
      <tr className="border-b border-gray-200 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {expanded ? <ChevronDown size={14} className="text-emerald-700" /> : <ChevronRight size={14} className="text-emerald-700" />}
            <span className="font-semibold text-gray-800">{p.name}</span>
            <span className="text-xs text-gray-400">({varianten.map(x => x.def.kurz).join(" · ")})</span>
            <span className="ml-2 inline-flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(p); }}
                className="text-gray-300 hover:text-emerald-600 p-1" title="Bearbeiten">
                <Pencil size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Rezept "${p.name}" wirklich löschen?`)) onDelete && onDelete(p.id); }}
                className="text-gray-300 hover:text-red-600 p-1" title="Löschen">
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.wareneinsatz), fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.vp.vk_in_brutto), fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmtRange(arr(x => x.c.vk_in_netto), fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstIn} gruppe={gruppe} />
            {fmtRange(weIn, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.db_in), fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstOut} gruppe={gruppe} />
            {fmtRange(weOut, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.db_out), fmtEUR)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="space-y-4">
              {/* Varianten-Kennzahlen: so, wie der Gast bestellt */}
              <div>
                <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide">
                  Varianten <span className="text-gray-400 normal-case font-normal">— so, wie der Gast bestellt · Größe {groesse === "klein" ? "Klein" : "Normal"}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      {th("Variante", false, "v")}{th("Material", true, "m")}{th("Verpackung", true, "p")}{th("WE OUT €", true, "w")}
                      {th("VK brutto", true, "vk")}{th("WE % IN", true, "wi")}{th("DB IN €", true, "di")}{th("WE % OUT", true, "wo")}{th("DB OUT €", true, "do")}
                    </tr>
                  </thead>
                  <tbody>
                    {varianten.map(x => {
                      const ai = ampelFarbe(x.c.we_in, gruppe), ao = ampelFarbe(x.c.we_out, gruppe);
                      const eigenerVk = x.key !== "salat" && !!p.vk_varianten?.[x.key];
                      return (
                        <tr key={x.key} className="border-t border-gray-100">
                          <td className="px-2 py-1 font-medium text-gray-700">
                            {x.def.label} <span className="text-gray-400 font-normal font-mono text-[10px]">{x.vp.id}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.material)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</td>
                          <td className="px-2 py-1 text-right tabular-nums font-medium">{fmtEUR(x.c.wareneinsatz)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {editierbar
                              ? <EditNum value={+(x.vp.vk_out_brutto || 0).toFixed(2)} step="0.05" suffix="€" width="w-16" onChange={v => updateVk(x.key, v)} />
                              : fmtEUR(x.vp.vk_out_brutto)}
                            {eigenerVk && <span className="ml-1 text-[10px] text-emerald-700" title="eigener VK dieser Variante">✎</span>}
                          </td>
                          <td className={`px-2 py-1 text-right tabular-nums font-semibold ${ai.text}`}>
                            <span className="inline-flex items-center gap-1"><AmpelDot quote={x.c.we_in} gruppe={gruppe} />{fmtPct(x.c.we_in)}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.db_in)}</td>
                          <td className={`px-2 py-1 text-right tabular-nums font-semibold ${ao.text}`}>
                            <span className="inline-flex items-center gap-1"><AmpelDot quote={x.c.we_out} gruppe={gruppe} />{fmtPct(x.c.we_out)}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.db_out)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Zutaten mit einer Mengen- und Kostenspalte je Variante */}
              <div>
                <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide">
                  Zutaten <span className="text-gray-400 normal-case font-normal">— Menge je Variante · Kartoffel/Reis grau = abgeleitet (Rezeptmenge bzw. Salatmix-Regel), eingetragen = Ausnahme dieser Bowl</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      {th("Zutat", false, "z")}
                      {varianten.map(x => th(`Menge ${x.def.kurz}`, true, `m_${x.key}`))}
                      {th("Preis", true, "p")}
                      {varianten.map(x => th(`Kosten ${x.def.kurz}`, true, `k_${x.key}`))}
                      {th("Lieferant", false, "l")}
                    </tr>
                  </thead>
                  <tbody>
                    {p.zutaten.map((z, i) => {
                      const e = EINHEIT[zutatEinheit(z)];
                      const salat = istSalatZutat(z, basis);
                      const ohneGewicht = istStueck(z) && !(+z.gramm_je_stueck > 0);
                      return (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1 text-gray-700">
                            {z.name}
                            {salat && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1" title="Salatmix-Regel: in Kartoffel- und Reisbowl weniger — zentral in der Basis-Rezeptur">Regel</span>}
                            {ohneGewicht && <span className="ml-1.5 text-[10px] text-amber-700" title="g/Stück fehlt — ohne Gramm-Äquivalent fehlt die Zutat im Bestellvorschlag.">⚠ g/Stk fehlt</span>}
                          </td>
                          {varianten.map(x => {
                            const menge = zutatMengeVariante(z, x.key, p, basis);
                            const ausnahme = z.menge_je_variante?.[x.key] != null;
                            const abgeleitet = x.key !== "salat" && !ausnahme;
                            return (
                              <td key={x.key} className={`px-2 py-1 text-right tabular-nums ${abgeleitet ? "text-gray-400" : ""}`}>
                                {editierbar ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <EditNum value={menge} step="1" suffix={e.menge} width="w-14" onChange={v => updateZutat(i, "menge", v, x.key)} />
                                    {ausnahme && (
                                      <button onClick={ev => { ev.stopPropagation(); updateZutat(i, "menge", "", x.key); }}
                                        title="Ausnahme löschen — zurück zur Regel" className="text-gray-300 hover:text-emerald-700">
                                        <RotateCcw size={10} />
                                      </button>
                                    )}
                                  </span>
                                ) : <span>{fmtMenge(menge)} {e.menge}</span>}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1 text-right tabular-nums">
                            {editierbar
                              ? <EditNum value={+zutatPreisAnzeige(z).toFixed(2)} step="0.01" suffix={e.preis} width="w-20" onChange={v => updateZutat(i, "preis", v)} />
                              : <span>{fmtNum2(zutatPreisAnzeige(z))} {e.preis}</span>}
                          </td>
                          {varianten.map(x => (
                            <td key={x.key} className="px-2 py-1 text-right tabular-nums">
                              {fmtEUR(zutatKosten(mitMenge(z, zutatMengeVariante(z, x.key, p, basis))))}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-gray-500">{z.lieferant}</td>
                        </tr>
                      );
                    })}
                    {basisZeilen.map((bz, i) => (
                      <tr key={`b${i}`} className="border-t border-gray-100 text-gray-500 bg-emerald-50/30">
                        <td className="px-2 py-1">
                          {bz.name}
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">Basis</span>
                        </td>
                        {varianten.map(x => (
                          <td key={x.key} className="px-2 py-1 text-right tabular-nums">{x.key === bz._variante ? `${fmtMenge(bz.menge_g)} g` : "—"}</td>
                        ))}
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum2(bz.preis_pro_g * 1000)} €/kg</td>
                        {varianten.map(x => (
                          <td key={x.key} className="px-2 py-1 text-right tabular-nums">{x.key === bz._variante ? fmtEUR(bz.cost) : "—"}</td>
                        ))}
                        <td className="px-2 py-1">{bz.lieferant}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-300 font-medium">
                      <td className="px-2 py-1">Material</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td />
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.material)}</td>)}
                      <td />
                    </tr>
                    <tr className="text-gray-600">
                      <td className="px-2 py-1">+ Verpackung</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td className="px-2 py-1 text-right">
                        {editierbar
                          ? <EditNum value={+(p.verpackung_eur || 0).toFixed(2)} step="0.01" suffix="€" width="w-16" onChange={v => onUpdate({ verpackung_eur: Math.max(0, +v || 0) })} />
                          : <span className="tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</span>}
                      </td>
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</td>)}
                      <td />
                    </tr>
                    <tr className="font-semibold text-gray-800">
                      <td className="px-2 py-1">= Wareneinsatz außer Haus</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td />
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.wareneinsatz)}</td>)}
                      <td />
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1">
                  Basis-Zeilen kommen aus der zentralen Basis-Rezeptur (oben im Tab) und gelten für alle Bowls mit wählbarer Basis.
                  Salatmix folgt der Regel dort; eine eingetragene Kartoffel-/Reis-Menge ist eine Ausnahme nur für diese Bowl.
                  Beim Speichern entstehen daraus die Kassenartikel <span className="font-mono">{p.id}</span>, <span className="font-mono">{p.id}_kartoffel</span>, <span className="font-mono">{p.id}_reis</span>.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Zentrale Basis-Rezeptur: einmal pflegen, gilt für alle Bowls mit wählbarer Basis.
function BowlBasisPanel({ basis, onChange, canEdit, anzahlBowls }) {
  const [offen, setOffen] = useState(false);
  const b = bowlBasisOderDefault(basis);
  const editierbar = canEdit && typeof onChange === "function";
  const set = (patch) => editierbar && onChange({ ...b, ...patch, version: 1 });

  const setSalatMenge = (groesse, variante, wert) => {
    const menge = { ...(b.salat?.menge || {}) };
    menge[groesse] = { ...(menge[groesse] || {}), [variante]: Math.max(0, +wert || 0) };
    set({ salat: { ...(b.salat || {}), menge } });
  };
  const setSalatZutaten = (text) =>
    set({ salat: { ...(b.salat || {}), zutaten: text.split(",").map(s => s.trim()).filter(Boolean) } });
  const zeilen = (variante) => b.varianten?.[variante]?.zutaten || [];
  const setZeilen = (variante, zutaten) =>
    set({ varianten: { ...(b.varianten || {}), [variante]: { ...(b.varianten?.[variante] || {}), zutaten } } });
  const setZeile = (variante, idx, patch) =>
    setZeilen(variante, zeilen(variante).map((z, i) => (i === idx ? { ...z, ...patch } : z)));
  const setZeileMenge = (variante, idx, groesse, wert) =>
    setZeile(variante, idx, { menge: { ...(zeilen(variante)[idx]?.menge || {}), [groesse]: Math.max(0, +wert || 0) } });
  const addZeile = (variante) =>
    setZeilen(variante, [...zeilen(variante), { name: "", lieferant: "Transgourmet", preis_pro_g: 0, menge: { normal: 0, klein: 0 } }]);
  const removeZeile = (variante, idx) => setZeilen(variante, zeilen(variante).filter((_, i) => i !== idx));
  const kosten = (variante, groesse) =>
    zeilen(variante).reduce((s, z) => s + (+(z.menge?.[groesse]) || 0) * (+z.preis_pro_g || 0), 0);
  const inputCls = "border border-gray-200 rounded px-1.5 py-1 text-xs bg-white";

  return (
    <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
      <button onClick={() => setOffen(o => !o)} className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-emerald-50/50">
        <span className="flex items-center gap-2">
          {offen ? <ChevronDown size={14} className="text-emerald-700" /> : <ChevronRight size={14} className="text-emerald-700" />}
          <span className="text-sm font-semibold text-gray-800">Basis-Rezeptur: Salat / Kartoffel / Reis</span>
          <span className="text-xs text-gray-400">· gilt für {anzahlBowls} Bowls mit wählbarer Basis</span>
        </span>
        <span className="text-xs text-gray-500 tabular-nums">
          Kartoffelbasis {fmtEUR(kosten("kartoffel", "normal"))} / {fmtEUR(kosten("kartoffel", "klein"))} ·
          Reisbasis {fmtEUR(kosten("reis", "normal"))} / {fmtEUR(kosten("reis", "klein"))} <span className="text-gray-400">(Normal / Klein)</span>
        </span>
      </button>
      {offen && (
        <div className="px-4 pb-4 space-y-4 text-xs">
          <p className="text-gray-500">
            Eine Bowl ist ein Rezept. In der Kasse gibt es sie als Salat-, Kartoffel- und Reisbowl: gleiche Zutaten, nur der Salatmix
            schrumpft in Kartoffel- und Reisbowl, und die Basis kommt dazu. Was hier steht, gilt für alle Bowls mit wählbarer Basis —
            einmal pflegen statt in jeder Bowl. Änderungen wirken sofort auf alle Varianten; zum Sichern oben „Speichern“.
          </p>

          <div className="border border-gray-100 rounded-lg p-3">
            <div className="font-medium text-gray-700 mb-2">Salatmix in Kartoffel- und Reisbowl</div>
            <div className="flex flex-wrap gap-4 items-end">
              <label className="flex flex-col text-gray-600">
                Zutat(en), kommagetrennt
                {editierbar
                  ? <input value={(b.salat?.zutaten || []).join(", ")} onChange={e => setSalatZutaten(e.target.value)} className={`${inputCls} mt-1 w-48`} />
                  : <span className="mt-1 text-gray-800">{(b.salat?.zutaten || []).join(", ")}</span>}
              </label>
              {["kartoffel", "reis"].map(v => ["normal", "klein"].map(g => (
                <label key={v + g} className="flex flex-col text-gray-600">
                  {BOWL_VARIANTE[v].label} · {g === "klein" ? "Klein" : "Normal"}
                  <span className="mt-1">
                    {editierbar
                      ? <EditNum value={+(b.salat?.menge?.[g]?.[v] ?? 0)} step="5" suffix="g" width="w-14" onChange={val => setSalatMenge(g, v, val)} />
                      : <span className="text-gray-800 tabular-nums">{fmtMenge(b.salat?.menge?.[g]?.[v] ?? 0)} g</span>}
                  </span>
                </label>
              )))}
            </div>
            <p className="text-gray-400 mt-2">Die Salatbowl behält die Salatmix-Menge des Rezepts (Normal 100 g). Die Klein-Werte sind eine Vorgabe — bitte bestätigen.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["kartoffel", "reis"].map(v => (
              <div key={v} className="border border-gray-100 rounded-lg p-3">
                <div className="font-medium text-gray-700 mb-2">{BOWL_VARIANTE[v].label}: Basis kommt dazu</div>
                <table className="w-full">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left px-1 py-1 font-medium">Zutat</th>
                      <th className="text-right px-1 py-1 font-medium">Normal</th>
                      <th className="text-right px-1 py-1 font-medium">Klein</th>
                      <th className="text-right px-1 py-1 font-medium">Preis</th>
                      <th className="text-right px-1 py-1 font-medium">Kosten N / K</th>
                      {editierbar && <th className="w-6" />}
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen(v).map((z, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-1 py-1">
                          {editierbar
                            ? <input value={z.name || ""} onChange={e => setZeile(v, i, { name: e.target.value })} className={`${inputCls} w-full`} placeholder="Zutat wie in der Preisliste" />
                            : <span className="text-gray-800">{z.name}</span>}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+(z.menge?.normal || 0)} step="5" suffix="g" width="w-14" onChange={val => setZeileMenge(v, i, "normal", val)} />
                            : `${fmtMenge(z.menge?.normal)} g`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+(z.menge?.klein || 0)} step="5" suffix="g" width="w-14" onChange={val => setZeileMenge(v, i, "klein", val)} />
                            : `${fmtMenge(z.menge?.klein)} g`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+((z.preis_pro_g || 0) * 1000).toFixed(2)} step="0.01" suffix="€/kg" width="w-16" onChange={val => setZeile(v, i, { preis_pro_g: Math.max(0, +val || 0) / 1000 })} />
                            : `${fmtNum2((z.preis_pro_g || 0) * 1000)} €/kg`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums text-gray-600">
                          {fmtEUR((+(z.menge?.normal) || 0) * (+z.preis_pro_g || 0))} / {fmtEUR((+(z.menge?.klein) || 0) * (+z.preis_pro_g || 0))}
                        </td>
                        {editierbar && (
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeZeile(v, i)} className="text-gray-300 hover:text-red-600" title="Zeile entfernen"><Trash2 size={12} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t border-gray-300 font-medium">
                      <td className="px-1 py-1">Basis gesamt</td>
                      <td colSpan={3} />
                      <td className="px-1 py-1 text-right tabular-nums">{fmtEUR(kosten(v, "normal"))} / {fmtEUR(kosten(v, "klein"))}</td>
                      {editierbar && <td />}
                    </tr>
                  </tbody>
                </table>
                {editierbar && (
                  <button onClick={() => addZeile(v)} className="mt-2 flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium">
                    <Plus size={12} /> Zutat
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-gray-400">
            Vorgabe der Mengen: Rezeptur-Entscheidung 03./05.09.2026 (Kartoffeln gegart 230 g, Basissauce 40 g, Röstzwiebeln 5 g, Reis 150 g;
            Klein zwei Drittel). Preise: CALKU-Rezepte Quark Kartoffel Bowl / Korean Glaze Bowl bzw. TG-Preisliste — „Preise aus Liste ziehen“ im
            Tab Einkaufspreise füllt fehlende Preise auch hier.
          </p>
        </div>
      )}
    </div>
  );
}

// Was die Daten noch nicht sauber abbilden - mit Knopf zum Umstellen.
function DatenpflegeHinweis({ befunde, canEdit, onEiUmstellen, onDuplikateEntfernen }) {
  const { eier, duplikate } = befunde || { eier: [], duplikate: [] };
  if (!eier.length && !duplikate.length) return null;
  const namen = (arr, f) => { const n = [...new Set(arr.map(f))]; return n.slice(0, 4).join(", ") + (n.length > 4 ? " …" : ""); };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-3">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-amber-700" /> Datenpflege</div>
      {eier.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs leading-relaxed max-w-3xl">
            <strong>Ei steht noch in Gramm</strong> in {eier.length} Rezeptzeile{eier.length === 1 ? "" : "n"} ({namen(eier, x => x.produkt.name)}).
            Ein Ei ist ein Stück mit Stückpreis. Die Umstellung setzt die Einheit auf Stück, den Stückpreis aus der Preisliste
            (Eier: 8,45 € je 30 = 0,28 €/Stk) und 50 g je Ei als Gramm-Äquivalent für Bestellvorschlag und Bons.
          </span>
          {canEdit && (
            <button onClick={onEiUmstellen} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
              Ei auf Stück umstellen
            </button>
          )}
        </div>
      )}
      {duplikate.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs leading-relaxed max-w-3xl">
            <strong>{duplikate.length} Varianten-Duplikate</strong> aus dem Import vom 03.09.2026 ({namen(duplikate, p => p.name)}):
            Kartoffel- und Reisvarianten entstehen jetzt aus dem Grundrezept, die eigenen Produkte dafür sind doppelt und würden im
            Bestellvorschlag mit derselben id kollidieren.
          </span>
          {canEdit && (
            <button onClick={() => onDuplikateEntfernen(duplikate.map(p => p.id))} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
              Duplikate entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProduktTabelle({ produkte, gruppe, onUpdate, onEdit, onDelete, gruppiert, bowlBasis, bowlModus, canEdit = true, produkteById }) {
  const [expanded, setExpanded] = useState(null);
  const [expandedSorte, setExpandedSorte] = useState(null);

  const sorten = useMemo(() => {
    if (!gruppiert) return null;
    return gruppiereProdukte(produkte, gruppe);
  }, [produkte, gruppe, gruppiert]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-600">
              <th className="text-left  px-3 py-2 font-medium">{gruppiert ? "Sorte / Größe" : bowlModus ? "Bowl (Salat · Kartoffel · Reis)" : "Produkt"}</th>
              <th className="text-right px-3 py-2 font-medium">Wareneinsatz OUT €</th>
              <th className="text-right px-3 py-2 font-medium">VK IN brutto</th>
              <th className="text-right px-3 py-2 font-medium">netto</th>
              <th className="text-right px-3 py-2 font-medium">WE % IN</th>
              <th className="text-right px-3 py-2 font-medium">DB IN €</th>
              <th className="text-right px-3 py-2 font-medium">WE % OUT</th>
              <th className="text-right px-3 py-2 font-medium">DB OUT €</th>
            </tr>
          </thead>
          <tbody>
            {produkte.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">Keine Produkte in dieser Warengruppe.</td></tr>
            )}

            {gruppiert && sorten?.map(sorte => (
              <SortenGruppeZeile
                key={sorte.base}
                sorte={sorte}
                gruppe={gruppe}
                expanded={expandedSorte === sorte.base}
                onToggle={() => setExpandedSorte(expandedSorte === sorte.base ? null : sorte.base)}
                expandedProdukt={expanded}
                onToggleProdukt={(id) => setExpanded(expanded === id ? null : id)}
                onUpdate={onUpdate}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}

            {!gruppiert && produkte.map(p => {
              if (bowlModus && basisWaehlbar(p, bowlBasis)) {
                return (
                  <BowlZeile
                    key={p.id}
                    p={p}
                    gruppe={gruppe}
                    basis={bowlBasis}
                    expanded={expanded === p.id}
                    onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                    onUpdate={(updates) => onUpdate(p.id, updates)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canEdit={canEdit}
                  />
                );
              }
              // Kassen-Sicht: abgeleitete Variante (basis_produkt_id) - nur
              // zeigen, bearbeiten ueber das Grundrezept.
              const virtuell = !!p.basis_produkt_id;
              const calc = berechne(p);
              return (
                <ProduktZeile
                  key={p.id}
                  p={p}
                  calc={calc}
                  gruppe={gruppe}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onUpdate={virtuell ? null : (updates) => onUpdate(p.id, updates)}
                  readOnly={virtuell}
                  hinweis={virtuell ? "Variante" : null}
                  onEdit={virtuell ? (vp) => onEdit && onEdit((produkteById && produkteById[vp.basis_produkt_id]) || vp) : onEdit}
                  onDelete={onDelete}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarengruppenTab({ produkte, gruppe, onUpdate, onEdit, onDelete, onNeu,
                           bowlBasis, onBowlBasis, canEdit = true, befunde, onEiUmstellen, onDuplikateEntfernen }) {
  const [subFilter, setSubFilter] = useState("Alle");
  const subgroups = SUBGROUPS_BY_GRUPPE[gruppe] || null;
  const istBowls = gruppe === "Bowls";

  // Bowls: die Kassen-Sicht (je Variante ein Produkt) fuer Unterfilter und
  // Kennzahlen; unter "Alle" steht jede Bowl einmal mit ihren Varianten.
  const aufgeloest = useMemo(() => (istBowls ? aufgeloesteProdukte(produkte, bowlBasis) : produkte),
                             [produkte, bowlBasis, istBowls]);
  const produkteById = useMemo(() => Object.fromEntries(produkte.map(p => [p.id, p])), [produkte]);
  const untergruppe = (p) => (istBowls ? bowlUntergruppe(p, bowlBasis) : untergruppeVon(p));

  const gefiltert = useMemo(() => {
    if (!subgroups || subFilter === "Alle") return produkte;
    return aufgeloest.filter(p => untergruppe(p) === subFilter);
  }, [produkte, aufgeloest, subgroups, subFilter, bowlBasis]);

  const statsBasis = (!subgroups || subFilter === "Alle") ? aufgeloest : gefiltert;
  const stats = useMemo(() => {
    const calced = statsBasis.map(p => ({ p, c: berechne(p) }));
    const n = calced.length;
    if (n === 0) return { n: 0, weOut: 0, dbOut: 0, ueberSchwelle: 0 };
    // Steuerungsgroesse ist das Ausser-Haus-Geschaeft (7 % MwSt.). Die
    // Im-Haus-Werte (19 %) bleiben in der Produkttabelle daneben stehen.
    const weOut = calced.reduce((s, x) => s + x.c.we_out, 0) / n;
    const dbOut = calced.reduce((s, x) => s + x.c.db_out, 0) / n;
    const schwelle = SCHWELLWERTE[gruppe].rot;
    const ueberSchwelle = calced.filter(x => x.c.we_out > schwelle).length;
    return { n, weOut, dbOut, ueberSchwelle };
  }, [statsBasis, gruppe]);

  const stufeWeOut = stats.weOut > SCHWELLWERTE[gruppe].rot ? "rot" : "gruen";
  const anzahlBasisBowls = istBowls ? produkte.filter(p => basisWaehlbar(p, bowlBasis)).length : 0;

  return (
    <div className="space-y-4">
      {subgroups && (
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {["Alle", ...subgroups].map(s => {
            const anzahl = s === "Alle" ? produkte.length : aufgeloest.filter(p => untergruppe(p) === s).length;
            return (
              <button key={s} onClick={() => setSubFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  subFilter === s ? "bg-green-700 text-white shadow-sm" : "text-gray-600 hover:bg-white"
                }`}>{s} <span className={subFilter === s ? "text-green-200" : "text-gray-400"}>· {anzahl}</span></button>
            );
          })}
        </div>
      )}

      {istBowls && (
        <DatenpflegeHinweis befunde={befunde} canEdit={canEdit}
          onEiUmstellen={onEiUmstellen} onDuplikateEntfernen={onDuplikateEntfernen} />
      )}
      {istBowls && (
        <BowlBasisPanel basis={bowlBasis} onChange={onBowlBasis} canEdit={canEdit} anzahlBowls={anzahlBasisBowls} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title={istBowls ? "Kassenartikel" : "Produkte"} value={fmtNum(stats.n)}
                 sub={istBowls ? `${produkte.length} Bowls · je Variante gezählt` : gruppe} stufe="info" />
        <KPICard title="Ø Wareneinsatz OUT" value={fmtPct(stats.weOut)}
                 sub={`Schwellwert: ${SCHWELLWERTE[gruppe].rot} % · 7 % MwSt.`} stufe={stufeWeOut} />
        <KPICard title="Ø Deckungsbeitrag OUT" value={fmtEUR(stats.dbOut)} sub="pro Produkt, netto (7 % MwSt.)" stufe="info" />
        <KPICard title="Über Schwellwert" value={`${stats.ueberSchwelle} / ${stats.n}`}
                 sub={`> ${SCHWELLWERTE[gruppe].rot} % WE (außer Haus)`}
                 stufe={stats.ueberSchwelle > 0 ? "rot" : "gruen"} />
      </div>

      <ProduktTabelle produkte={gefiltert} gruppe={gruppe} onUpdate={onUpdate} onEdit={onEdit} onDelete={onDelete}
        gruppiert={GRUPPIERBARE.has(gruppe)}
        bowlBasis={bowlBasis} bowlModus={istBowls && subFilter === "Alle"} canEdit={canEdit} produkteById={produkteById} />

      <div className="flex justify-end">
        <button onClick={() => onNeu && onNeu(gruppe)}
          className="flex items-center gap-1.5 text-sm bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800">
          <Plus size={14} /> Neues Rezept in „{gruppe}"
        </button>
      </div>
    </div>
  );
}

// ============================================================
//  KAMPAGNEN-TAB (mit Datumssteuerung)
// ============================================================
function KampagnenTab({ produkte, setProdukte, onEdit, onDelete, onNeu, alleProdukte = [], onImport }) {
  const heute = new Date();
  const OHNE = "(Ohne Oberbegriff)";
  const obFor = (p) => p.kampagne || p.alte_kategorie || OHNE;

  // Produkte nach Oberbegriff (Kampagne) bündeln
  const kampagnen = useMemo(() => {
    const map = new Map();
    for (const p of produkte) {
      const ob = obFor(p);
      if (!map.has(ob)) map.set(ob, []);
      map.get(ob).push(p);
    }
    return Array.from(map.entries()).map(([name, items]) => {
      const start = items.find(i => i.kampagne_start)?.kampagne_start || "";
      const ende  = items.find(i => i.kampagne_ende)?.kampagne_ende || "";
      const s = start ? new Date(start) : null;
      const e = ende ? new Date(ende) : null;
      const aktiv = (!s || s <= heute) && (!e || e >= heute);
      const calcs = items.map(berechne);
      const avgWe = calcs.length ? calcs.reduce((x, c) => x + c.we_out, 0) / calcs.length : 0;
      const sumDb = calcs.reduce((x, c) => x + c.db_out, 0);
      return { name, items, start, ende, aktiv, avgWe, sumDb };
    }).sort((a, b) => (Number(b.aktiv) - Number(a.aktiv)) || a.name.localeCompare(b.name, "de"));
  }, [produkte]);

  // Datum auf alle Artikel der Kampagne anwenden
  const setKampagneDatum = (kampagneName, feld, wert) => {
    setProdukte(prev => prev.map(p => obFor(p) === kampagneName ? { ...p, [feld]: wert || null } : p));
  };

  // Kampagne umbenennen (Oberbegriff auf allen Artikeln ändern)
  const [editName, setEditName] = useState(null); // { old, value }
  const commitRename = () => {
    if (!editName) return;
    const neu = editName.value.trim();
    const alt = editName.old;
    if (neu && neu !== alt) {
      setProdukte(prev => prev.map(p => obFor(p) === alt ? { ...p, kampagne: neu } : p));
    }
    setEditName(null);
  };

  const neueKampagne = () => {
    const name = (prompt("Name der neuen Kampagne (Oberbegriff):", "Sommerkampagne") || "").trim();
    if (!name) return;
    onNeu && onNeu("Kampagnen", name);
  };

  // Import bestehender Rezepte in eine Kampagne
  const [importOpen, setImportOpen] = useState(false);
  const [importSuche, setImportSuche] = useState("");
  const [importSel, setImportSel] = useState(null);
  const [importKampagne, setImportKampagne] = useState("");
  const importTreffer = alleProdukte
    .filter(p => (p.name || "").toLowerCase().includes(importSuche.trim().toLowerCase()))
    .slice(0, 200);

  return (
    <div className="space-y-5">
      {kampagnen.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Noch keine Kampagnen angelegt. Starte unten mit „Neue Kampagne anlegen".
        </div>
      )}

      {kampagnen.map(k => {
        const ampel = ampelFarbe(k.avgWe, "Kampagnen");
        return (
          <div key={k.name} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Kampagnen-Kopf */}
            <div className={`px-4 py-3 border-b border-gray-100 ${k.aktiv ? "bg-emerald-50" : "bg-gray-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar size={16} className={k.aktiv ? "text-emerald-600" : "text-gray-400"} />
                  {editName?.old === k.name ? (
                    <span className="flex items-center gap-1">
                      <input autoFocus value={editName.value}
                        onChange={e => setEditName({ ...editName, value: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditName(null); }}
                        className="border border-emerald-300 rounded px-2 py-0.5 text-sm font-semibold bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                      <button onClick={commitRename} title="Übernehmen" className="text-emerald-700 hover:text-emerald-900 p-0.5"><Check size={14} /></button>
                      <button onClick={() => setEditName(null)} title="Abbrechen" className="text-gray-400 hover:text-gray-600 p-0.5"><X size={14} /></button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-gray-800">{k.name}</span>
                      {k.name !== OHNE && (
                        <button onClick={() => setEditName({ old: k.name, value: k.name })} title="Kampagne umbenennen"
                          className="text-gray-300 hover:text-emerald-700 p-0.5"><Pencil size={12} /></button>
                      )}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${k.aktiv ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                    {k.aktiv ? "aktiv" : "inaktiv"}
                  </span>
                  <span className="text-xs text-gray-500">· {k.items.length} {k.items.length === 1 ? "Artikel" : "Artikel"}</span>
                </div>
                {k.name !== OHNE && (
                  <div className="flex items-end gap-2">
                    <label className="text-xs text-gray-600 flex flex-col">Start
                      <input type="date" value={k.start || ""} onChange={e => setKampagneDatum(k.name, "kampagne_start", e.target.value)}
                        className="mt-0.5 border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                    </label>
                    <label className="text-xs text-gray-600 flex flex-col">Ende
                      <input type="date" value={k.ende || ""} onChange={e => setKampagneDatum(k.name, "kampagne_ende", e.target.value)}
                        className="mt-0.5 border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                    </label>
                  </div>
                )}
              </div>
              {/* Rollup */}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs">
                <span className={`font-medium ${ampel.text}`}>Ø Wareneinsatz {fmtPct(k.avgWe)}</span>
                <span className="text-gray-600">Σ Deckungsbeitrag (außer Haus) {fmtEUR(k.sumDb)}</span>
                {k.start && <span className="text-gray-500">{fmtDate(k.start)} – {k.ende ? fmtDate(k.ende) : "offen"}</span>}
              </div>
            </div>

            {/* Artikel der Kampagne */}
            <div className="divide-y divide-gray-100">
              {k.items.map(p => {
                const c = berechne(p);
                const a = ampelFarbe(c.we_out, "Kampagnen");
                return (
                  <div key={p.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.dot}`} />
                    <span className="flex-1 min-w-[150px] text-sm font-medium text-gray-800">{p.name || "(ohne Name)"}</span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      WE {fmtEUR(c.wareneinsatz)} · VK {fmtEUR(p.vk_out_brutto)} · WE-Quote {fmtPct(c.we_out)} · DB {fmtEUR(c.db_out)}
                    </span>
                    <button onClick={() => onEdit && onEdit(p)} title="Bearbeiten"
                      className="text-gray-300 hover:text-emerald-700 p-0.5"><Pencil size={13} /></button>
                    <button onClick={() => { if (confirm(`"${p.name}" löschen?`)) onDelete && onDelete(p.id); }} title="Löschen"
                      className="text-gray-300 hover:text-red-600 p-0.5"><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>

            {/* Artikel hinzufügen */}
            <div className="px-4 py-2 bg-gray-50/60">
              <button onClick={() => onNeu && onNeu("Kampagnen", k.name === OHNE ? null : k.name, k.start || null, k.ende || null)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1">
                <Plus size={13} /> Artikel zur Kampagne hinzufügen
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => { setImportOpen(true); setImportSel(null); setImportSuche(""); setImportKampagne(""); }}
          className="flex items-center gap-1.5 text-sm bg-white border border-green-700 text-green-800 px-3 py-2 rounded-lg hover:bg-green-50">
          <Plus size={14} /> Rezept übernehmen
        </button>
        <button onClick={neueKampagne}
          className="flex items-center gap-1.5 text-sm bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800">
          <Plus size={14} /> Neue Kampagne anlegen
        </button>
      </div>

      {importOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Rezept in Kampagne übernehmen</h3>
              <button onClick={() => setImportOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input value={importSuche} onChange={e => setImportSuche(e.target.value)} placeholder="Rezept suchen …"
                  className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm" />
              </div>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-60 overflow-auto">
                {importTreffer.length === 0 && (
                  <div className="px-3 py-6 text-center text-gray-400 text-sm">Kein Rezept gefunden.</div>
                )}
                {importTreffer.map(p => (
                  <button key={p.id} onClick={() => setImportSel(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${importSel === p.id ? "bg-emerald-50" : ""}`}>
                    <span className="font-medium text-gray-800">{p.name || "(ohne Name)"}</span>
                    <span className="text-xs text-gray-400">{p.gruppe}{p.untergruppe ? ` · ${p.untergruppe}` : ""}</span>
                  </button>
                ))}
              </div>
              <label className="block text-xs font-medium text-gray-600">
                Ziel-Kampagne (Oberbegriff)
                <input list="kampagnen-namen" value={importKampagne} onChange={e => setImportKampagne(e.target.value)}
                  placeholder="z. B. Sommerkampagne" className="mt-1 w-full border border-gray-200 rounded px-3 py-2 text-sm" />
                <datalist id="kampagnen-namen">
                  {kampagnen.filter(k => k.name !== OHNE).map(k => <option key={k.name} value={k.name} />)}
                </datalist>
              </label>
              <p className="text-[11px] text-gray-400">Es wird eine <strong>Kopie</strong> angelegt — das Original bleibt unverändert. Preise/VK werden mitkopiert.</p>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setImportOpen(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
              <button disabled={!importSel || !importKampagne.trim()}
                onClick={() => { onImport?.(importSel, importKampagne); setImportOpen(false); }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed">
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  SYSTEM-WARENEINSATZ-TAB (Mix-Kalkulator)
// ============================================================
function SystemWeTab({ produkte, mix, setMix }) {
  // Pro Warengruppe: Ø WE-Quote (OUT, 7 % MwSt.) und Anzahl Produkte
  const gruppenStats = useMemo(() => {
    return WARENGRUPPEN.map(g => {
      const ps = produkte.filter(p => p.gruppe === g);
      if (ps.length === 0) return { gruppe: g, anzahl: 0, we_quote: 0 };
      const sum = ps.reduce((s, p) => s + berechne(p).we_out, 0);
      return { gruppe: g, anzahl: ps.length, we_quote: sum / ps.length };
    });
  }, [produkte]);

  const summeMix = WARENGRUPPEN.reduce((s, g) => s + (mix[g] || 0), 0);
  const sollWe = gruppenStats.reduce((s, gs) => {
    const anteil = (mix[gs.gruppe] || 0) / 100;
    return s + gs.we_quote * anteil;
  }, 0);
  const sollInklSchwund = sollWe + SCHWUND_PCT;

  const updateMix = (g, val) => {
    const v = Math.max(0, Math.min(100, +val || 0));
    setMix(prev => ({ ...prev, [g]: v }));
  };

  const verteilen = () => {
    const each = +(100 / WARENGRUPPEN.length).toFixed(1);
    const next = {};
    WARENGRUPPEN.forEach((g, i) => next[g] = i === WARENGRUPPEN.length - 1 ? 100 - each * (WARENGRUPPEN.length - 1) : each);
    setMix(next);
  };

  const chartData = gruppenStats.map(gs => ({
    name: gs.gruppe,
    "Ø WE %": +gs.we_quote.toFixed(1),
    "Anteil %": +(mix[gs.gruppe] || 0).toFixed(1),
    "Beitrag zum Soll": +(gs.we_quote * (mix[gs.gruppe] || 0) / 100).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Package size={16} className="text-emerald-600" /> Produktmix-Verteilung
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Wie viel Prozent des Gesamtumsatzes entfallen auf jede Warengruppe? Summe muss 100 % ergeben.
            </p>
          </div>
          <button onClick={verteilen}
            className="text-xs text-emerald-700 hover:text-emerald-800 underline whitespace-nowrap">
            Gleichmäßig verteilen
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {gruppenStats.map(gs => (
            <div key={gs.gruppe} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{gs.gruppe}</span>
                <span className="text-xs text-gray-400">{gs.anzahl} Produkte · Ø {fmtPct(gs.we_quote)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100" step="0.5"
                  value={mix[gs.gruppe] || 0}
                  onChange={e => updateMix(gs.gruppe, e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-right text-sm">
          Mix-Summe: <span className={`font-semibold tabular-nums ${
            Math.abs(summeMix - 100) < 0.1 ? "text-green-700" : "text-red-700"
          }`}>{fmtPct(summeMix)}</span>
          {Math.abs(summeMix - 100) >= 0.1 && (
            <span className="ml-2 text-xs text-red-600">⚠ Sollte exakt 100 % ergeben</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Soll-Wareneinsatz" value={fmtPct(sollWe)}
                 sub="gewichtet aus Produktmix" stufe="info" />
        <KPICard title="+ Schwund / Abschreibung" value={fmtPct(SCHWUND_PCT)}
                 sub="Sicherheitspuffer (max. tolerabel)" stufe="grau" />
        <KPICard title="Soll inkl. Schwund" value={fmtPct(sollInklSchwund)}
                 sub="Ist-WE darüber = Warnung" stufe="rot" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Warengruppen-Beitrag zur Soll-Quote</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} unit=" %" />
            <Tooltip
              formatter={(v, n) => [`${(+v).toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`, n]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Anteil %"        fill="#86efac" radius={[4,4,0,0]} />
            <Bar dataKey="Ø WE %"          fill="#16a34a" radius={[4,4,0,0]} />
            <Bar dataKey="Beitrag zum Soll" fill="#2d6a4f" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          „Beitrag zum Soll" = Ø WE % × Anteil %. Die Summe aller Beiträge ergibt den Soll-Wareneinsatz.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm">
        <Info size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="text-amber-900">
          <strong>Lesart:</strong> Der Soll-Wareneinsatz (z.B. {fmtPct(sollWe)}) ist der theoretisch perfekte Wert
          aus deinem Produktmix. Da Schwund (Abschreibung, Bruch, Verderb) immer entsteht, addieren wir pauschal
          {" "}{fmtPct(SCHWUND_PCT)} als Sicherheitspuffer. Der resultierende Wert ({fmtPct(sollInklSchwund)})
          ist die rote Linie: Liegt der gemessene Ist-Wareneinsatz darüber, läuft etwas aus dem Ruder.
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  IMPORT-MODAL (CSV-Preisliste)
// ============================================================
// ============================================================
//  EDIT-MODAL pro Produkt (Name, Warengruppe, Zutaten, VK, Verpackung)
// ============================================================
function leeresProdukt(gruppe, kampagne = null, start = null, ende = null) {
  return {
    id: `neu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    gruppe: gruppe || "Smoothies",
    untergruppe: null,
    kampagne: gruppe === "Kampagnen" ? (kampagne || null) : null,
    zutaten: [],
    verpackung_eur: 0.18,
    vk_in_brutto: 0,
    vk_out_brutto: 0,
    kampagne_start: start,
    kampagne_ende: ende,
  };
}

function ProduktEditModal({ open, produkt, priceList, bowlBasis, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(produkt);

  // Form-State bei Wechsel des Produkts neu initialisieren
  const produktKey = produkt?.id || "neu";
  const [lastKey, setLastKey] = useState(produktKey);
  if (produktKey !== lastKey) {
    setForm(produkt);
    setLastKey(produktKey);
  }

  if (!open || !form) return null;

  const priceEntries = Object.values(priceList || {});
  const setF = (patch) => setForm({ ...form, ...patch });

  // Ganze Zeile ersetzen (nicht mischen) - Einheitswechsel raeumt Felder ab.
  const replaceZutat = (idx, zeile) => {
    setForm({ ...form, zutaten: form.zutaten.map((z, i) => (i === idx ? zeile : z)) });
  };

  const handleNameChange = (idx, name) => {
    // Wenn der eingegebene Name exakt einer Preisliste-Zutat entspricht, übernehme Preis automatisch
    const treffer = priceList[name.toLowerCase()];
    let next = { ...form.zutaten[idx], name };
    if (treffer) {
      next.lieferant = "Transgourmet";
      // Artikel-Eigenschaften aus der Preisliste mitnehmen (zentral gepflegt)
      next.ausbeute_prozent = treffer.ausbeute_prozent ?? null;
      if (istStueckArtikel(treffer)) {
        // Stück-Artikel (Eier, Wraps): die Zeile rechnet in Stück mit Stückpreis
        next = mitEinheit(next, "stk", treffer);
        next.gramm_je_stueck = stueckgewicht(treffer) || next.gramm_je_stueck || null;
        const sp = stueckpreis(treffer);
        if (sp != null) next.preis_je_stueck = sp;
      } else {
        if (istStueck(next)) next = mitEinheit(next, "g", treffer);
        next.gramm_je_stueck = null;
        if (treffer.price_per_gram_ml != null) next.preis_pro_g = treffer.price_per_gram_ml;
      }
    }
    replaceZutat(idx, normalisiereZutat(next));
  };

  const handleMengeChange = (idx, menge) => replaceZutat(idx, mitMenge(form.zutaten[idx], menge));
  const handlePreisChange = (idx, preis) => replaceZutat(idx, mitPreis(form.zutaten[idx], preis));
  const handleEinheitChange = (idx, einheit) => {
    const z = form.zutaten[idx];
    replaceZutat(idx, mitEinheit(z, einheit, priceList[(z.name || "").toLowerCase()]));
  };
  const handleGewichtChange = (idx, g) =>
    replaceZutat(idx, normalisiereZutat({ ...form.zutaten[idx], gramm_je_stueck: Math.max(0, +g || 0) || null }));

  // Bowls: angebotene Basen und Groesse
  const varianten = form.gruppe === "Bowls" ? (bowlVarianten(form, bowlBasis) || []) : [];
  const toggleVariante = (key) => {
    let neu = varianten.includes(key) ? varianten.filter(k => k !== key) : [...varianten, key];
    if (!neu.length) return;                                                   // mindestens eine
    neu = BOWL_VARIANTEN.map(v => v.key).filter(k => neu.includes(k));         // feste Reihenfolge
    const einzel = neu.length === 1 ? BOWL_VARIANTE[neu[0]] : null;
    setF({ varianten: neu, untergruppe: einzel ? einzel.untergruppe : null });
  };
  const setVkVariante = (key, wert) => {
    const vkv = { ...(form.vk_varianten || {}) };
    const v = Math.max(0, +wert || 0);
    if (wert === "" || v <= 0) delete vkv[key]; else vkv[key] = { vk_in_brutto: v, vk_out_brutto: v };
    setF({ vk_varianten: Object.keys(vkv).length ? vkv : undefined });
  };

  const addZutat = () => {
    setForm({
      ...form,
      zutaten: [...form.zutaten, { name: "", menge_g: 0, lieferant: "Transgourmet",
                                   preis_pro_g: 0, cost: 0,
                                   ausbeute_prozent: null, gramm_je_stueck: null }],
    });
  };

  const removeZutat = (idx) => {
    setForm({ ...form, zutaten: form.zutaten.filter((_, i) => i !== idx) });
  };

  const calc = berechne(form);
  const aOut = ampelFarbe(calc.we_out, form.gruppe);
  const istNeu = !produkt?.name || produkt.id === form.id && produkt.name === "";

  const handleSave = () => {
    if (!form.name.trim()) { alert("Bitte einen Produktnamen eingeben."); return; }
    onSave({ ...form, zutaten: (form.zutaten || []).map(normalisiereZutat) });
    onClose();
  };

  const handleDelete = () => {
    if (!confirm(`Rezept "${form.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    onDelete(form.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Pencil className="text-emerald-600" size={20} />
            {istNeu ? "Neues Rezept anlegen" : `Rezept bearbeiten: ${produkt.name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Stammdaten */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-600 flex flex-col md:col-span-2">
              Produktname
              <input type="text" value={form.name} onChange={e => setF({ name: e.target.value })}
                placeholder="z. B. Acai Classic Bowl"
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
            </label>
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Warengruppe
              <select value={form.gruppe} onChange={e => setF({ gruppe: e.target.value, untergruppe: SUBGROUPS_BY_GRUPPE[e.target.value] ? form.untergruppe : null })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                {WARENGRUPPEN.map(g => <option key={g} value={g}>{g}</option>)}
                <option value="Archiv">Archiv</option>
              </select>
            </label>
          </div>

          {form.gruppe === "Bowls" ? (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs font-medium text-gray-600 flex flex-col">
                  Größe
                  <select value={bowlGroesse(form)} onChange={e => setF({ groesse: e.target.value })}
                    className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                    {BOWL_GROESSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 font-normal">Bestimmt die Basismengen (Kartoffeln 230 g normal / 155 g klein usw.).</span>
                </label>
                <div className="md:col-span-2 text-xs font-medium text-gray-600">
                  Angeboten als
                  <div className="mt-1 flex flex-wrap gap-2">
                    {BOWL_VARIANTEN.map(v => (
                      <label key={v.key} className="inline-flex items-center gap-1.5 font-normal text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={varianten.includes(v.key)} onChange={() => toggleVariante(v.key)} /> {v.label}
                      </label>
                    ))}
                  </div>
                  <span className="block text-[11px] text-gray-400 mt-1 font-normal">
                    {varianten.length > 1
                      ? "Basis wählbar: das Rezept unten ist die Salatbowl. Kartoffel- und Reisbowl entstehen daraus mit der zentralen Basis-Rezeptur (Bowls-Tab) — nichts doppelt pflegen."
                      : "Eine Variante: das Rezept unten ist komplett, inklusive Basis."}
                  </span>
                </div>
              </div>
              {varianten.length > 1 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <span className="text-xs text-gray-600 md:col-span-2">VK je Variante (brutto, optional) — leer = wie der VK des Rezepts</span>
                  {varianten.filter(k => k !== "salat").map(k => (
                    <label key={k} className="text-xs font-medium text-gray-600 flex flex-col">
                      {BOWL_VARIANTE[k].label}
                      <input type="number" step="0.05" min="0" placeholder={form.vk_out_brutto ? String(form.vk_out_brutto) : "wie oben"}
                        value={form.vk_varianten?.[k]?.vk_out_brutto ?? ""}
                        onChange={e => setVkVariante(k, e.target.value)}
                        className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : SUBGROUPS_BY_GRUPPE[form.gruppe] && (
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Untergruppe
              <select value={form.untergruppe || DEFAULT_UNTERGRUPPE[form.gruppe] || ""} onChange={e => setF({ untergruppe: e.target.value || null })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white w-full md:w-1/3">
                {!DEFAULT_UNTERGRUPPE[form.gruppe] && <option value="">— keine —</option>}
                {SUBGROUPS_BY_GRUPPE[form.gruppe].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          {form.gruppe === "Kampagnen" && (
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Kampagne (Oberbegriff)
              <input type="text" value={form.kampagne || ""} onChange={e => setF({ kampagne: e.target.value || null })}
                placeholder="z. B. Sommerkampagne"
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white w-full md:w-1/2" />
              <span className="text-[11px] text-gray-400 mt-1">Artikel mit gleichem Oberbegriff werden zu einer Kampagne gebündelt.</span>
            </label>
          )}

          {form.gruppe === "Kampagnen" && (
            <div className="grid grid-cols-2 gap-3 md:w-1/2">
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                Kampagnen-Start
                <input type="date" value={form.kampagne_start || ""} onChange={e => setF({ kampagne_start: e.target.value || null })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
              </label>
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                Kampagnen-Ende
                <input type="date" value={form.kampagne_ende || ""} onChange={e => setF({ kampagne_ende: e.target.value || null })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
              </label>
            </div>
          )}

          {/* Verkaufspreise */}
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Verkaufspreise (brutto)</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                VK IN (Im Haus)
                <input type="number" step="0.10" min="0" value={form.vk_in_brutto}
                  onChange={e => setF({ vk_in_brutto: Math.max(0, +e.target.value || 0) })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
              </label>
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                VK OUT (Außer Haus)
                <input type="number" step="0.10" min="0" value={form.vk_out_brutto}
                  onChange={e => setF({ vk_out_brutto: Math.max(0, +e.target.value || 0) })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
              </label>
            </div>
            <label className="text-xs font-medium text-gray-600 flex flex-col mt-3">
              MwSt.-Satz
              <select value={mwstSatz(form)}
                onChange={e => setF({ mwst_satz: +e.target.value })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                <option value={MWST_SPEISEN}>7 % — Speisen, Açaí, Smoothies, Frozen Yoghurt</option>
                <option value={MWST_GETRAENK}>19 % — übrige Getränke</option>
              </select>
              <span className="mt-1 text-[11px] text-gray-400 font-normal">
                Gilt im Haus wie außer Haus. Vorgabe kommt aus der Warengruppe.
              </span>
            </label>
          </div>

          {/* Zutaten */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Zutaten ({form.zutaten.length})</h4>
              <button onClick={addZutat}
                className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-2.5 py-1.5 rounded hover:bg-emerald-700">
                <Plus size={12} /> Zutat hinzufügen
              </button>
            </div>
            <datalist id="zutat-liste">
              {priceEntries.map(p => (
                <option key={p.ingredient_name} value={p.ingredient_name}>
                  {istStueckArtikel(p) && stueckpreis(p) != null
                    ? `${fmtNum2(stueckpreis(p))} €/Stk`
                    : `${((p.price_per_gram_ml || 0) * 1000).toFixed(2)} €/kg`}
                </option>
              ))}
            </datalist>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Zutat (aus Preisliste wählen)</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Menge</th>
                    <th className="text-left px-2 py-1.5 font-medium w-16">Einheit</th>
                    <th className="text-right px-2 py-1.5 font-medium w-32">Preis</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20" title="Gramm je Stück — Gramm-Äquivalent für Bestellvorschlag und Bons">g/Stk</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Kosten</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.zutaten.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-400">Noch keine Zutaten. Klick auf „Zutat hinzufügen".</td></tr>
                  )}
                  {form.zutaten.map((z, i) => {
                    const e = EINHEIT[zutatEinheit(z)];
                    const stk = istStueck(z);
                    return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">
                        <input list="zutat-liste" type="text" value={z.name}
                          onChange={ev => handleNameChange(i, ev.target.value)}
                          placeholder="Tippen oder aus Liste wählen…"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="1" min="0" value={zutatMenge(z)}
                          onChange={ev => handleMengeChange(i, ev.target.value)}
                          className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={zutatEinheit(z)} onChange={ev => handleEinheitChange(i, ev.target.value)}
                          className="border border-gray-200 rounded px-1 py-1 text-xs bg-white" title="g, ml oder Stück (Ei, Wrap: Stück mit Stückpreis)">
                          {EINHEITEN.map(u => <option key={u.key} value={u.key}>{u.menge}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <input type="number" step="0.01" min="0" value={+zutatPreisAnzeige(z).toFixed(2)}
                            onChange={ev => handlePreisChange(i, ev.target.value)}
                            className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
                          <span className="text-gray-400 w-9 text-left">{e.preis}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {stk ? (
                          <input type="number" step="1" min="0" value={z.gramm_je_stueck || ""} placeholder="g"
                            onChange={ev => handleGewichtChange(i, ev.target.value)}
                            title="Gramm je Stück — ohne diesen Wert fehlt die Zutat im Bestellvorschlag (Gramm-Äquivalent)"
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white ${(+z.gramm_je_stueck > 0) ? "border-gray-200" : "border-amber-400"}`} />
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700"
                          title={z.ausbeute_prozent && z.ausbeute_prozent < 100
                            ? `inkl. Ausbeute ${z.ausbeute_prozent} % (Pflege im Tab Einkaufspreise)` : undefined}>
                        {fmtEUR(z.cost)}{z.ausbeute_prozent && z.ausbeute_prozent < 100 ? "*" : ""}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeZutat(i)}
                          className="text-gray-400 hover:text-red-600 p-1" title="Zutat entfernen">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Tipp: Beim Wählen einer Zutat aus der Liste wird der Preis automatisch übernommen. Du kannst Preis und Menge danach noch anpassen.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Stück-Zutaten (Ei, Wrap): Einheit „Stk“ und Preis je Stück. „g/Stk“ ist das Gramm-Äquivalent für Bestellvorschlag und Bons (Ei: 50 g).
              Ausbeute wird zentral im Tab „Einkaufspreise" gepflegt und wirkt hier automatisch (Kosten mit * sind inkl. Ausbeute).
            </p>
          </div>

          {/* Verpackung + Ergebnis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Verpackung (€)
              <input type="number" step="0.01" min="0" value={+form.verpackung_eur.toFixed(2)}
                onChange={e => setF({ verpackung_eur: Math.max(0, +e.target.value || 0) })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
            </label>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Wareneinsatz OUT</div>
              <div className="text-lg font-bold tabular-nums">{fmtEUR(calc.wareneinsatz)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 border ${aOut.bg} ${aOut.border}`}>
              <div className={`text-xs uppercase tracking-wide ${aOut.text}`}>WE % OUT · DB OUT</div>
              <div className={`text-lg font-bold tabular-nums ${aOut.text}`}>
                {fmtPct(calc.we_out)} · {fmtEUR(calc.db_out)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-between items-center sticky bottom-0 bg-white">
          <div>
            {!istNeu && (
              <button onClick={handleDelete}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 px-3 py-2 hover:bg-red-50 rounded">
                <Trash2 size={14} /> Rezept löschen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
            <button onClick={handleSave}
              className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
              {istNeu ? "Anlegen" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ open, onClose, onImport, mappings = {}, onMappingMerken }) {
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({ name: "", preis: "", einheit: "", artNr: "" });
  // Signatur der gerade geladenen Dateiform + Hinweis, ob die Zuordnung aus
  // dem Gedaechtnis kam (dann fragt der Dialog dieselbe Form nie wieder).
  const [signatur, setSignatur] = useState("");
  const [ausGedaechtnis, setAusGedaechtnis] = useState(false);
  // Preissemantik: die TG-Artikelliste (Artikel/Artikelkurztext/VKP-ME/
  // Kundenpreis) fuehrt den Preis JE GEBINDE - die alte Annahme "EUR pro kg"
  // haette dort selbst bei Treffern falsche Preise geschrieben.
  const [semantik, setSemantik] = useState("gebinde");
  const [ergebnis, setErgebnis] = useState(null);
  const fileRef = useRef(null);

  if (!open) return null;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const uebernehmen = (res) => {
        const cols = res.meta?.fields || [];
        setPreview({ rows: res.data.slice(0, 5), cols, all: res.data });

        // 1. Gedaechtnis: dieselbe Dateiform schon einmal importiert? Dann
        //    genau die Zuordnung von damals - inkl. Preissemantik. Fehlt auch
        //    nur eine der gemerkten Spalten in der Datei, ist die Erinnerung
        //    wertlos und wir erkennen neu (sonst importierte der Dialog
        //    stillschweigend gegen eine Spalte, die es nicht mehr gibt).
        const sig = spaltenSignatur(cols);
        setSignatur(sig);
        const gemerkt = mappings[sig];
        const vollstaendig = gemerkt && ["name", "preis", "einheit", "artNr"]
          .every(k => !gemerkt[k] || cols.includes(gemerkt[k]));
        if (gemerkt && vollstaendig) {
          setMapping({
            name: gemerkt.name || "", preis: gemerkt.preis || "",
            einheit: gemerkt.einheit || "", artNr: gemerkt.artNr || "",
          });
          if (gemerkt.semantik) setSemantik(gemerkt.semantik);
          setAusGedaechtnis(true);
          return;
        }
        // 2. Sonst inhaltsbasiert erkennen (siehe preisimport.js) - die
        //    Kopfzeile allein hat bei "Artikeltext1" und den drei
        //    Preis-Spalten nicht getragen.
        setAusGedaechtnis(false);
        setMapping(erkenneSpalten(cols, res.data));
    };

    // Erst als UTF-8 lesen. Steht danach das Ersatzzeichen im Text, war die
    // Datei ANSI (Excel-Standard beim CSV-Export) - dann als windows-1252
    // erneut lesen. Sonst sind alle Umlaute kaputt und Artikel wie
    // "Erdnuesse" finden ihren Stamm-Eintrag nicht mehr.
    const lesen = (encoding) => Papa.parse(f, {
      header: true, skipEmptyLines: true, encoding,
      complete: (res) => {
        const probe = (res.meta?.fields || []).join("|")
          + res.data.slice(0, 50).map(r => Object.values(r).join("|")).join("|");
        if (!encoding && probe.includes("�")) { lesen("windows-1252"); return; }
        uebernehmen(res);
      },
    });
    lesen(undefined);
  };

  const importieren = () => {
    if (!preview || !mapping.name || !mapping.preis) return;
    const aktualisierungen = preview.all
      .map(r => ({
        name:    r[mapping.name],
        preis:   parseFloat((r[mapping.preis] || "").toString().replace(",", ".")),
        einheit: r[mapping.einheit] || "kg",
        artNr:   r[mapping.artNr]   || null,
      }))
      .filter(r => r.name && !isNaN(r.preis));
    // Die tatsaechlich benutzte Zuordnung merken - auch die von Hand
    // korrigierte. Beim naechsten Upload derselben Dateiform fragt der Dialog
    // dann nicht noch einmal.
    if (signatur && onMappingMerken) onMappingMerken(signatur, mapping, semantik);
    const bericht = onImport(aktualisierungen, semantik);
    setPreview(null);
    setAusGedaechtnis(false);
    setErgebnis(bericht || null);
  };

  const schliessen = () => {
    setErgebnis(null); setPreview(null); setAusGedaechtnis(false); setSignatur("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-600" size={20} /> Transgourmet-Preisliste importieren
          </h2>
          <button onClick={schliessen} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {ergebnis ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Preise geändert", wert: ergebnis.geaendert, farbe: "text-green-700" },
                  { label: "unverändert (Stempel neu)", wert: ergebnis.unveraendert, farbe: "text-gray-700" },
                  { label: "ohne Treffer im Stamm", wert: ergebnis.ohneMatch.length, farbe: ergebnis.ohneMatch.length ? "text-amber-600" : "text-gray-700" },
                  { label: "Veraltet-Kandidaten", wert: ergebnis.veraltet.length, farbe: ergebnis.veraltet.length ? "text-red-600" : "text-gray-700" },
                ].map(k => (
                  <div key={k.label} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className={`text-xl font-bold tabular-nums ${k.farbe}`}>{k.wert}</div>
                  </div>
                ))}
              </div>
              {ergebnis.pruefen.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Ohne alten Gebindepreis übernommen, bitte prüfen: {ergebnis.pruefen.join(", ")}
                </p>
              )}
              {ergebnis.ohneMatch.length > 0 && (
                <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
                  CSV-Zeilen ohne Treffer im CALKU-Stamm (weder Nummer noch Name) — zum Kopieren:
                  <textarea readOnly rows={Math.min(6, ergebnis.ohneMatch.length)}
                    className="border border-gray-200 rounded-lg p-2 text-xs font-mono"
                    value={ergebnis.ohneMatch.map(z => `${z.artNr || "?"}  ${z.name || "?"}  ${z.preis}`).join("\n")} />
                </label>
              )}
              {ergebnis.veraltet.length > 0 && (
                <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
                  Stammartikel, deren Nummer in der CSV fehlt — veraltete Nummern ODER Artikel, die diese Liste
                  gar nicht führt (z. B. Frische bei der Trockensortiment-Liste). Nachpflegeliste:
                  <textarea readOnly rows={Math.min(6, ergebnis.veraltet.length)}
                    className="border border-gray-200 rounded-lg p-2 text-xs font-mono"
                    value={ergebnis.veraltet.map(a => `${a.article_number || "?"}  ${a.ingredient_name}`).join("\n")} />
                </label>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Änderungen sind übernommen — zum Sichern oben „Speichern".
                </span>
                <button onClick={schliessen}
                  className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
                  Fertig
                </button>
              </div>
            </>
          ) : !preview ? (
            <>
              <p className="text-sm text-gray-600">
                Lade die aktuelle Transgourmet-Preisliste als CSV hoch (Export aus shop.transgourmet.de).
                Die App erkennt die Spalten automatisch — du kannst sie danach bestätigen.
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg
                           file:border-0 file:text-sm file:font-medium file:bg-green-700 file:text-white
                           hover:file:bg-green-800 cursor-pointer" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { k: "name",    label: "Artikelname *" },
                  { k: "preis",   label: "Preis *" },
                  { k: "einheit", label: "Einheit" },
                  { k: "artNr",   label: "Artikelnummer" },
                ].map(f => (
                  <label key={f.k} className="text-xs font-medium text-gray-600 flex flex-col">
                    {f.label}
                    <select value={mapping[f.k]}
                      onChange={e => { setAusGedaechtnis(false); setMapping({ ...mapping, [f.k]: e.target.value }); }}
                      className="mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">— Spalte wählen —</option>
                      {preview.cols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {ausGedaechtnis && (
                <p className="text-xs text-gray-500">
                  Zuordnung übernommen aus dem letzten Import dieser Dateiform — änderbar, die Änderung wird gemerkt.
                </p>
              )}

              {(!mapping.name || !mapping.preis) && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {!mapping.name
                    ? `Die Spalte mit dem Artikelnamen wurde nicht automatisch erkannt. Bitte oben unter „Artikelname" die richtige Spalte wählen, bei Transgourmet-Listen ist das meist „Artikeltext1". Danach lässt sich der Import starten.`
                    : `Bitte oben unter „Preis" die richtige Spalte wählen, danach lässt sich der Import starten.`}
                </p>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">Vorschau (erste 5 Zeilen)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-t border-gray-200">
                      <tr>{preview.cols.map(c => <th key={c} className="text-left px-2 py-1 text-gray-600 font-medium">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {preview.cols.map(c => <td key={c} className="px-2 py-1 text-gray-700">{r[c]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-4 text-sm text-gray-700 border border-gray-200 rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="semantik" checked={semantik === "gebinde"}
                    onChange={() => setSemantik("gebinde")} />
                  Preis je Gebinde/VE (TG-Artikelliste, „Kundenpreis" — Standard)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="semantik" checked={semantik === "grundpreis"}
                    onChange={() => setSemantik("grundpreis")} />
                  Preis je kg/l (Grundpreisliste)
                </label>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{preview.all.length} Zeilen werden importiert</span>
                <div className="flex gap-2">
                  <button onClick={() => setPreview(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Zurück</button>
                  <button onClick={importieren} disabled={!mapping.name || !mapping.preis}
                    className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:bg-gray-300">
                    Preise übernehmen
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  NÄHRWERTABELLE-TAB
//  Quelle: NWT_Stand_08.10.2025.xlsx → naehrwerte.json
//  Werte pro 100 g/ml. Allergene aggregiert (Gluten umfasst Weizen/Roggen/…).
// ============================================================
const ALLE_ALLERGENE = [
  "Gluten", "Milch", "Eier", "Soja", "Schalenfrüchte",
  "Sesam", "Erdnüsse", "Sellerie", "Senf", "Fisch", "Lupinen", "Schwefeldioxid",
];

// ============================================================
//  INVENTUR — Liste pro Lieferant, händisch ausfüllbar (PDF-Druck)
//  Quelle: Inventurliste - 05.2026.xlsx → inventur.json
// ============================================================
function InventurTab({ inventur }) {
  const heute = new Date().toISOString().slice(0, 10);
  const [filiale, setFiliale]   = useState("");
  const [datum,   setDatum]     = useState(heute);
  const [bearbeiter, setBearbeiter] = useState("");
  const [mengen,  setMengen]    = useState({});
  const [filter,  setFilter]    = useState(""); // Lieferant-Filter: "Alle" | "BUNZL" | "TRANSGOURMET"
  const [suche,   setSuche]     = useState("");

  const setMenge = (artnr, v) => setMengen(m => ({ ...m, [artnr]: v }));
  const resetMengen = () => {
    if (window.confirm("Alle eingetragenen Mengen löschen?")) setMengen({});
  };
  const druckNoetig = () => window.print();

  const gesamtArtikel = useMemo(() => {
    let n = 0;
    for (const L of inventur.lieferanten) for (const g of L.untergruppen) n += g.artikel.length;
    return n;
  }, [inventur]);

  const summe = useMemo(() => {
    let s = 0;
    for (const L of inventur.lieferanten) {
      for (const g of L.untergruppen) {
        for (const a of g.artikel) {
          const m = parseFloat(String(mengen[a.artikelnr] || "").replace(",", "."));
          if (!isNaN(m) && a.preis_stk) s += m * a.preis_stk;
        }
      }
    }
    return s;
  }, [inventur, mengen]);

  const sichtbarerInhalt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return inventur.lieferanten
      .filter(L => !filter || filter === "Alle" || L.name === filter)
      .map(L => ({
        ...L,
        untergruppen: L.untergruppen.map(g => ({
          ...g,
          artikel: g.artikel.filter(a =>
            !q || a.bezeichnung.toLowerCase().includes(q) || a.artikelnr.includes(q)
          ),
        })).filter(g => g.artikel.length > 0),
      }))
      .filter(L => L.untergruppen.length > 0);
  }, [inventur, filter, suche]);

  return (
    <div className="space-y-4 inventur-druckbereich">
      {/* Druck-Stylesheet — wirkt global, blendet App-Chrome aus */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 10mm 12mm 10mm; }
          html, body { background: white !important; }
          .inventur-no-print { display: none !important; }
          .inventur-druckkopf { display: block !important; }
          /* App-Chrome ausblenden */
          .app-chrome-header,
          .app-chrome-nav,
          .app-chrome-footer { display: none !important; }
          /* Tabelle kompakt */
          .inventur-druckbereich { font-size: 9.5pt; }
          .inventur-druckbereich h2 { font-size: 13pt; }
          .inventur-druckbereich h3 { font-size: 11pt; }
          .inventur-druckbereich table { border-collapse: collapse; width: 100%; }
          .inventur-druckbereich tbody tr { page-break-inside: avoid; }
          .inventur-druckbereich .gruppe-block { page-break-inside: avoid; }
          /* Eingabefeld → schreibbare Linie */
          .inventur-menge-input {
            border: none !important;
            border-bottom: 1px solid #444 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 1px 2px !important;
            width: 60px !important;
          }
          .inventur-eingabe {
            border: none !important;
            border-bottom: 1px solid #444 !important;
            border-radius: 0 !important;
            background: transparent !important;
            min-width: 120px;
          }
          .inventur-lieferant-header {
            background: #2E7D32 !important;
            color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .inventur-summe-card {
            background: #E8F5E9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        @media screen {
          .inventur-druckkopf { display: none; }
        }
      `}</style>

      {/* DRUCK-KOPF (nur bei Print sichtbar) */}
      <div className="inventur-druckkopf" style={{ marginBottom: 8 }}>
        <table style={{ width: "100%", borderBottom: "2px solid #2E7D32", paddingBottom: 6 }}>
          <tbody>
            <tr>
              <td style={{ fontSize: "18pt", fontWeight: "bold", color: "#2E7D32" }}>
                immergrün · INVENTUR
              </td>
              <td style={{ textAlign: "right", fontSize: "10pt" }}>
                <div><b>Filiale:</b> {filiale || "_________________________"}</div>
                <div><b>Datum:</b> {datum ? new Date(datum).toLocaleDateString("de-DE") : "___________"}</div>
                <div><b>Bearbeiter/in:</b> {bearbeiter || "_________________________"}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* BILDSCHIRM-KOPF — Filter, Eingaben, Buttons */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 inventur-no-print">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Filiale</span>
              <input type="text" value={filiale} onChange={e => setFiliale(e.target.value)}
                placeholder="z. B. Hannover Bahnhof"
                className="inventur-eingabe border border-gray-300 rounded px-3 py-2 text-sm min-w-[200px]" />
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Inventur-Datum</span>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Bearbeiter/in</span>
              <input type="text" value={bearbeiter} onChange={e => setBearbeiter(e.target.value)}
                placeholder="Name"
                className="inventur-eingabe border border-gray-300 rounded px-3 py-2 text-sm min-w-[180px]" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={resetMengen}
              className="bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 text-gray-700">
              <RotateCcw size={14} /> Mengen leeren
            </button>
            <button onClick={druckNoetig}
              className="bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
              <Download size={14} /> Drucken / PDF
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-gray-100">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Artikel oder Artikelnummer …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Lieferant</span>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="">Alle ({gesamtArtikel})</option>
              {inventur.lieferanten.map(L => {
                const n = L.untergruppen.reduce((s, g) => s + g.artikel.length, 0);
                return <option key={L.name} value={L.name}>{L.name} ({n})</option>;
              })}
            </select>
          </label>
        </div>
      </div>

      {/* Summen-Karte */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 inventur-summe-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Inventurwert (kalkuliert)</div>
            <div className="text-3xl font-bold text-emerald-900 tabular-nums">{fmtEUR(summe)}</div>
          </div>
          <div className="text-xs text-emerald-700">
            {Object.values(mengen).filter(v => v && parseFloat(String(v).replace(",", ".")) > 0).length} Artikel
            mit Menge erfasst<br/>
            Quelle: Inventurliste {inventur.stand}
          </div>
        </div>
      </div>

      {/* Tabellen pro Lieferant → Untergruppe → Artikel */}
      {sichtbarerInhalt.map(L => (
        <div key={L.name} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <h2 className="inventur-lieferant-header bg-green-800 text-white px-4 py-2.5 font-bold text-base">
            {L.name}
          </h2>
          {L.untergruppen.map(g => (
            <div key={g.name} className="gruppe-block">
              <h3 className="bg-emerald-50 text-emerald-900 px-4 py-1.5 font-semibold text-sm border-b border-emerald-100">
                {g.name} <span className="text-emerald-600 font-normal text-xs">· {g.artikel.length} Artikel</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Art.-Nr.</th>
                      <th className="text-left px-3 py-1.5 font-medium">Bezeichnung</th>
                      <th className="text-left px-3 py-1.5 font-medium w-20">VE</th>
                      <th className="text-right px-3 py-1.5 font-medium w-24">Preis / Stk</th>
                      <th className="text-right px-3 py-1.5 font-medium w-28">Menge</th>
                      <th className="text-right px-3 py-1.5 font-medium w-28">Wert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.artikel.map(a => {
                      const raw = mengen[a.artikelnr] || "";
                      const m = parseFloat(String(raw).replace(",", "."));
                      const w = !isNaN(m) && a.preis_stk ? m * a.preis_stk : null;
                      return (
                        <tr key={a.artikelnr} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-500 text-xs tabular-nums">{a.artikelnr}</td>
                          <td className="px-3 py-1.5 text-gray-800">{a.bezeichnung}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{a.ve}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                            {a.preis_stk != null ? fmtEUR(a.preis_stk) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={raw}
                              onChange={e => setMenge(a.artikelnr, e.target.value)}
                              className="inventur-menge-input w-24 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                            {w !== null ? fmtEUR(w) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {sichtbarerInhalt.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Keine Artikel — Filter/Suche anpassen.
        </div>
      )}

      {/* Druck-Fußzeile */}
      <div className="inventur-druckkopf" style={{ marginTop: 12, borderTop: "1px solid #ccc", paddingTop: 6, fontSize: "9pt" }}>
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td><b>Inventurwert kalkuliert:</b> {fmtEUR(summe)}</td>
              <td style={{ textAlign: "right" }}>Unterschrift: ______________________________</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 inventur-no-print">
        Tipp: Filiale + Datum + Bearbeiter/in eintragen → „Drucken / PDF" klicken → Drucker-Dialog
        bietet „Als PDF speichern" an. Mengen werden im Shop händisch in die Listenfelder eingetragen.
      </p>
    </div>
  );
}

// ============================================================
//  EINKAUFSPREISE — Zutaten aus dem priceList, gruppiert
// ============================================================
const EINKAUF_UNTERGRUPPEN = [
  "Frische",
  "Tiefkühl",
  "Molkerei & Vegan",
  "Proteine",
  "Saucen & Dressings",
  "Sirupe & Süßes",
  "Säfte & Getränke",
  "Brot & Wraps",
  "Trockenwaren & Toppings",
  "Verpackung",
  "Sonstiges",
];

function kategorisiereZutat(name) {
  const n = (name || "").toLowerCase().trim();
  if (!n) return "Sonstiges";

  // Edge-Cases (überstimmen alle Patterns)
  if (n === "agavendicksaft") return "Sirupe & Süßes";
  if (n === "tortilla chips") return "Trockenwaren & Toppings";

  // Verpackung zuerst (Becher, Deckel, Besteck, etc.)
  if (/becher|deckel|strohhalm|trinkhalm|löffel|gabel|messer|serviette|einwickelpapier|faltenbeutel|salatschale|aufwärmschälchen|tragetasche|^verpackung$/.test(n)) return "Verpackung";

  // Tiefkühl (TK-Marker, Sorbet, Eis, Crushed Ice, frostige Halbfertige)
  if (/^tk\s|\stk\s|\stk$|tiefkühl|sorbet|joghurt\s?eis|ice cream|frappe weiß|frappepulver|crushed ice|crusheis|falafel tk|bulgur köfte/.test(n)) return "Tiefkühl";

  // Säfte & Getränke (Saft/Nektar/Schorle/Cola/Tee/Limonade/Wasser/Mischungen für Getränke)
  if (/saft\b|nektar|schorle|cola\b|fuze tea|pfanner|eistee|cold brew|kaffee frappe|lemonade|^getränke$|^wasser$|vio (still|medium)|monin cloudy|zitronenlimonade|frozen iced tea zutaten|^pfirsich mischung$|^maracuja mischung$|^hibiskus himbeere mischung$/.test(n)) return "Säfte & Getränke";

  // Sirupe & Süßes (Monin/Teisseire/Honig/Agave/Karamell/Schoko/Erdnussbutter)
  if (/sirup|honig\b|agavendicksaft|karamell|cinnamon plum|schokoladensoße|erdnussbutter/.test(n)) return "Sirupe & Süßes";

  // Saucen, Dressings, Pürees, Hummus, Dips, Aufstriche
  if (/sauce|dressing|vinaigrette|dip\b|aufstrich|püree|hummus|teriyaki|chipotle|sylter art|caesar/.test(n)) return "Saucen & Dressings";

  // Molkerei & Vegane Alternativen
  if (/h-milch|hafermilch|kokosmilch|mandeldrink|^milch$|alpro|frischkäse|gran moravia|kräuterquark|violife/.test(n)) return "Molkerei & Vegan";

  // Proteine (Tofu, Chicken, Pulled, Eier, Pulver)
  if (/sesam tofu|chicken flakes|pulled (beef|lachs)|hähnchen|^eier$|vanille (eiweiß|protein)|^protein\b|kollagen/.test(n)) return "Proteine";

  // Brot & Wraps
  if (/^wrap|tortilla|baguette|focaccia/.test(n)) return "Brot & Wraps";

  // Trockenwaren & Toppings (Reis, Quinoa, Hafer, Nüsse, Croutons, Pulver, Öl)
  if (/jasminreis|reis gekocht|garkartoffel|quinoa|haferflocke|körnermix|sesamkörner|kräutercrouton|röstzwiebel|^erdnüsse$|oreo|pistazien topping|matcha pulver|spirulina|traubenkernöl|datteln/.test(n)) return "Trockenwaren & Toppings";

  // Frische (Obst, Gemüse, Kräuter)
  if (/mixsalat|spinat|tomate|cherrytomate|gurke|möhre|möhren|rotkohl|rote bete|^mais|banane|orange|^zitrone|apfel|äpfel|jalapen|ingwer|^minze$|edamame/.test(n)) return "Frische";

  return "Sonstiges";
}

// Frisch gepresste Säfte: Preis hängt von der Auspressquote (Nettomenge) ab.
const FRISCH_ARTIKEL = [
  { key: "apfel",   label: "Äpfel",    zutat: "Frischer Apfelsaft" },
  { key: "orange",  label: "Orangen",  zutat: "Frischer Orangensaft" },
  { key: "karotte", label: "Karotten", zutat: "Karottensaft" },
];
const FRISCH_INIT = { apfel: { preis: "", netto: "" }, orange: { preis: "", netto: "" }, karotte: { preis: "", netto: "" } };
const parseDe = (s) => { const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return isNaN(n) || n < 0 ? 0 : n; };

function EinkaufspreiseTab({ priceList, produkte = [], onFrischpreise, onAddArtikel, onPreisAbgleich, onDeleteArtikel, onUpdateArtikel, onAltAusbeute, onSpeichern, speichernMsg, canEdit = true }) {
  const [suche, setSuche]       = useState("");
  const [gruppe, setGruppe]     = useState("Alle");
  const [sortBy, setSortBy]     = useState("name");
  const [sortDir, setSortDir]   = useState("asc");
  const [frischOpen, setFrischOpen] = useState(false);
  const [frisch, setFrisch]     = useState(FRISCH_INIT);
  const [frischMsg, setFrischMsg] = useState("");
  const [artikelOpen, setArtikelOpen] = useState(false);
  const [neuArt, setNeuArt]     = useState({ name: "", artNr: "", einheit: "kg", preis: "", menge: "" });
  const [artMsg, setArtMsg]     = useState("");
  const [abgleichMsg, setAbgleichMsg] = useState("");

  // aktueller €/g je Zutat (aus den Rezepturen) – für die Anzeige „aktuell"
  const aktuellerProG = useMemo(() => {
    const m = {};
    for (const p of produkte) for (const z of (p.zutaten || [])) {
      if (m[z.name] == null && z.preis_pro_g != null) m[z.name] = z.preis_pro_g;
    }
    return m;
  }, [produkte]);

  const frischUebernehmen = () => {
    const list = [];
    for (const a of FRISCH_ARTIKEL) {
      const preis = parseDe(frisch[a.key].preis);
      const netto = parseDe(frisch[a.key].netto);
      if (preis > 0 && netto > 0) list.push({ name: a.zutat, proG: preis / netto });
    }
    if (!list.length) { setFrischMsg("Bitte für mindestens einen Artikel Preis und Nettomenge eingeben."); return; }
    onFrischpreise?.(list);
    setFrischMsg(`✓ ${list.length} Artikel aktualisiert. Zum Sichern oben „Speichern".`);
  };

  const artikelSpeichern = () => {
    const name = neuArt.name.trim();
    const preis = parseDe(neuArt.preis), menge = parseDe(neuArt.menge);
    if (!name) { setArtMsg("Bitte einen Artikelnamen eingeben."); return; }
    if (preis <= 0 || menge <= 0) { setArtMsg("Bitte Einkaufspreis und Menge (> 0) eingeben."); return; }
    const proG = preis / menge;
    onAddArtikel?.({
      ingredient_name: name,
      article_number: neuArt.artNr.trim(),
      unit: neuArt.einheit,
      package_size: menge,
      package_price: preis,
      net_weight: menge,
      price_per_gram_ml: proG,
      manuell: true,
    });
    const proKg = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(proG * 1000);
    setArtMsg(`✓ „${name}" angelegt (${proKg} €/kg). Sofort als Zutat nutzbar. Zum Sichern oben „Speichern".`);
    setNeuArt({ name: "", artNr: "", einheit: "kg", preis: "", menge: "" });
  };

  const zutaten = useMemo(() => {
    const arr = Object.values(priceList || {});
    return arr.map(z => ({
      name:           z.ingredient_name || "",
      art:            z.article_number ? String(z.article_number).replace(/\.0$/, "") : "",
      einheit:        z.unit || "",
      packGroesse:    z.package_size ?? null,
      packPreis:      z.package_price ?? null,
      preisProGramm:  z.price_per_gram_ml ?? null,
      ausbeute:       z.ausbeute_prozent ?? null,
      preisbasis:     z.preisbasis ?? null,
      gewichtJeStueck: z.gewicht_je_stueck_g ?? null,
      untergruppe:    kategorisiereZutat(z.ingredient_name),
    }));
  }, [priceList]);

  // Ausbeute und g/Stück werden HIER zentral gepflegt (Eigenschaft des
  // Artikels, nicht der Rezeptzeile) und wirken sofort auf alle Rezepturen.
  const ausbeuteZellen = (z) => (
    <>
      <td className="px-3 py-2 text-right">
        {canEdit ? (
          <input type="number" min="1" max="100" step="1"
            key={`a_${z.name}_${z.ausbeute ?? 100}`}
            defaultValue={z.ausbeute ?? 100}
            onBlur={e => { const v = +e.target.value;
              onUpdateArtikel?.(z.name, { ausbeute_prozent: v >= 1 && v < 100 ? v : null }); }}
            className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
        ) : <span className="tabular-nums text-xs">{z.ausbeute ?? 100} %</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {(() => {
          const art = { unit: z.einheit, package_size: z.packGroesse,
                        package_price: z.packPreis, price_per_gram_ml: z.preisProGramm,
                        preisbasis: z.preisbasis, gewicht_je_stueck_g: z.gewichtJeStueck };
          const basis = z.preisbasis || preisbasisAuto(art);
          const gewicht = stueckgewicht({ ...art, preisbasis: basis });
          const jeStueck = stueckpreis({ ...art, preisbasis: basis });
          const fmt0 = (v) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v);
          return (
            <div className="flex flex-col items-end gap-0.5">
              {canEdit ? (
                <select value={basis}
                  onChange={e => onUpdateArtikel?.(z.name, { preisbasis: e.target.value })}
                  className="border border-gray-200 rounded px-1 py-1 text-xs bg-white">
                  {PREISBASEN.map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
                </select>
              ) : <span className="text-xs">{(PREISBASEN.find(p => p[0] === basis) || ["", "—"])[1]}</span>}
              {basis === "stueck" && (
                <span className="text-[10px] text-gray-400 tabular-nums inline-flex items-center gap-1">
                  {canEdit ? (
                    <input type="number" min="0" step="1"
                      key={`g_${z.name}_${z.gewichtJeStueck ?? ""}`}
                      defaultValue={z.gewichtJeStueck ?? ""}
                      placeholder={gewicht ? `≈ ${fmt0(gewicht)}` : "?"}
                      onBlur={e => { const v = +e.target.value; onUpdateArtikel?.(z.name, { gewicht_je_stueck_g: v > 0 ? v : null }); }}
                      title="Gramm je Stück — leer = rechnerisch aus Stückpreis ÷ Preis pro Gramm. Pflegen, wo die Liste keinen Grammpreis kennt (Eier: 50 g)."
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[10px] text-right bg-white" />
                  ) : (gewicht ? `≈ ${fmt0(gewicht)}` : "—")}
                  g/Stück{jeStueck != null && <span> · {fmtNum2(jeStueck)} €/Stk</span>}
                </span>
              )}
            </div>
          );
        })()}
      </td>
    </>
  );

  const gruppenZaehlung = useMemo(() => {
    const z = {};
    for (const u of EINKAUF_UNTERGRUPPEN) z[u] = 0;
    for (const it of zutaten) z[it.untergruppe] = (z[it.untergruppe] || 0) + 1;
    return z;
  }, [zutaten]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    let arr = zutaten.filter(z => {
      if (gruppe !== "Alle" && z.untergruppe !== gruppe) return false;
      if (q && !z.name.toLowerCase().includes(q) && !z.art.includes(q)) return false;
      return true;
    });

    // Sortierung: erst nach Untergruppe (in fester Reihenfolge), dann nach Spalte
    const gruppenIdx = (g) => {
      const i = EINKAUF_UNTERGRUPPEN.indexOf(g);
      return i === -1 ? 999 : i;
    };
    arr.sort((a, b) => {
      if (gruppe === "Alle") {
        const gd = gruppenIdx(a.untergruppe) - gruppenIdx(b.untergruppe);
        if (gd !== 0) return gd;
      }
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else if (va === null || va === "") cmp = 1;
      else if (vb === null || vb === "") cmp = -1;
      else cmp = String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [zutaten, suche, gruppe, sortBy, sortDir]);

  const sortHeader = (key, label, align = "right") => (
    <th className={`text-${align} px-3 py-2 font-medium cursor-pointer hover:bg-gray-100`}
        onClick={() => {
          if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else { setSortBy(key); setSortDir(align === "right" ? "desc" : "asc"); }
        }}>
      {label}{sortBy === key && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );

  const fmtPreis = (v) =>
    v == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);

  const fmtPreisProG = (v) => {
    if (v == null) return "—";
    // sehr kleine Werte als €/kg umrechnen für Lesbarkeit
    const proKg = v * 1000;
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)} €/g  ·  ${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(proKg)} €/kg`;
  };

  // Gruppierte Ausgabe wenn "Alle" gewählt — sonst flache Liste
  const renderTabelle = () => {
    if (gruppe !== "Alle") {
      return (
        <tbody>
          {sichtbar.length === 0 && (
            <tr><td colSpan={canEdit ? 9 : 8} className="px-3 py-8 text-center text-gray-400 text-sm">
              Keine Treffer. Filter anpassen.
            </td></tr>
          )}
          {sichtbar.map((z, i) => (
            <tr key={`${z.name}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-800">{z.name}</td>
              <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">{z.art || "—"}</td>
              <td className="px-3 py-2 text-gray-500 text-xs">{z.einheit || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{z.packGroesse != null ? `${new Intl.NumberFormat("de-DE").format(z.packGroesse)} ${z.einheit || ""}` : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtPreis(z.packPreis)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600 text-xs">{fmtPreisProG(z.preisProGramm)}</td>
              {ausbeuteZellen(z)}
              {canEdit && (
                <td className="px-2 py-2 text-center">
                  <button onClick={() => { if (confirm(`Artikel „${z.name}" wirklich aus der Preisliste löschen?`)) onDeleteArtikel?.(z.name); }}
                    className="text-gray-300 hover:text-red-600 p-1" title="Artikel löschen">
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      );
    }
    // Gruppiert
    const bloecke = [];
    let aktuelleGruppe = null;
    let buffer = [];
    const flush = () => {
      if (aktuelleGruppe && buffer.length) {
        bloecke.push(
          <tbody key={aktuelleGruppe}>
            <tr className="bg-emerald-50">
              <td colSpan={canEdit ? 9 : 8} className="px-3 py-2 text-xs font-semibold text-emerald-900 uppercase tracking-wide">
                {aktuelleGruppe} <span className="text-emerald-600 font-normal">· {buffer.length}</span>
              </td>
            </tr>
            {buffer}
          </tbody>
        );
      }
    };
    for (const [i, z] of sichtbar.entries()) {
      if (z.untergruppe !== aktuelleGruppe) {
        flush();
        aktuelleGruppe = z.untergruppe;
        buffer = [];
      }
      buffer.push(
        <tr key={`${z.name}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="px-3 py-2 text-gray-800">{z.name}</td>
          <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">{z.art || "—"}</td>
          <td className="px-3 py-2 text-gray-500 text-xs">{z.einheit || "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums">{z.packGroesse != null ? `${new Intl.NumberFormat("de-DE").format(z.packGroesse)} ${z.einheit || ""}` : "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtPreis(z.packPreis)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-gray-600 text-xs">{fmtPreisProG(z.preisProGramm)}</td>
          {ausbeuteZellen(z)}
          {canEdit && (
            <td className="px-2 py-2 text-center">
              <button onClick={() => { if (confirm(`Artikel „${z.name}" wirklich aus der Preisliste löschen?`)) onDeleteArtikel?.(z.name); }}
                className="text-gray-300 hover:text-red-600 p-1" title="Artikel löschen">
                <Trash2 size={13} />
              </button>
            </td>
          )}
        </tr>
      );
    }
    flush();
    if (bloecke.length === 0) {
      return (
        <tbody>
          <tr><td colSpan={canEdit ? 9 : 8} className="px-3 py-8 text-center text-gray-400 text-sm">
            Keine Treffer. Filter anpassen.
          </td></tr>
        </tbody>
      );
    }
    return <>{bloecke}</>;
  };

  const fmtKg = (proG) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(proG * 1000);
  const fmtG  = (proG) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(proG);

  return (
    <div className="space-y-4">
      {/* Eigene Preise pflegen */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-800">Eigene Preise pflegen</span> — neuen Einkaufsartikel anlegen oder Frischpress-Preise setzen.
            <span className="block text-xs text-amber-600 mt-1">
              Ausbeute %: Wie viel der eingekauften Ware im Produkt ankommt (geschälte Ananas ≈ 60). Bei Presswaren ist es die Auspressquote in ml je Gramm Einkauf: 40 heißt, aus 1 kg Möhren werden 400 ml Saft — so wird aus dem Kilopreis der Milliliterpreis. Wirkt sofort auf alle Rezepturen mit dieser Zutat; der Preis muss dann der reine Einkaufspreis sein, sonst wird der Verschnitt doppelt gerechnet.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => {
                const n = onPreisAbgleich?.() ?? 0;
                setAbgleichMsg(n > 0
                  ? `✓ ${n} Zutatenpreise in die Rezepturen übernommen — zum Sichern oben „Speichern".`
                  : "Alle Rezept-Zutaten haben bereits einen Preis — nichts zu übernehmen.");
              }}
              className="bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0"
              title="Zutaten ohne Preis tolerant mit der Preisliste abgleichen und Preise ziehen">
              <RotateCcw size={14} /> Preise aus Liste ziehen
            </button>
            <button onClick={() => onAltAusbeute?.()}
              className="bg-white border border-amber-400 text-amber-700 hover:bg-amber-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0"
              title="Aus der alten Excel-Liste steckt bei manchen Frischwaren der Verschnitt noch IM Listenpreis (Apfel: netto 1,25 €/kg, Liste 2,08 €/kg). Diese Bereinigung setzt den Preis auf netto zurück und trägt den Faktor in die Ausbeute-Spalte ein — Rezeptkosten bleiben unverändert.">
              Alt-Ausbeuten bereinigen
            </button>
            <button onClick={() => { setArtikelOpen(o => !o); setArtMsg(""); }}
              className="bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
              <Plus size={14} /> Neuer Artikel
            </button>
            <button onClick={() => { setFrischOpen(o => !o); setFrischMsg(""); }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
              <Pencil size={14} /> Frischpress-Preise
            </button>
          </div>
        </div>
      )}

      {canEdit && abgleichMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span>{abgleichMsg}</span>
          <button onClick={() => setAbgleichMsg("")} className="text-emerald-400 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}

      {canEdit && artikelOpen && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Neuer Einkaufsartikel</h3>
              <p className="text-xs text-gray-500 mt-0.5">Eigenen Artikel + Preis anlegen (z. B. für eine Kampagne). €/g = Einkaufspreis ÷ Menge. Sofort als Zutat verwendbar.</p>
            </div>
            <button onClick={() => setArtikelOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <label className="md:col-span-4 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Artikelname *</span>
              <input value={neuArt.name} onChange={e => setNeuArt(s => ({ ...s, name: e.target.value }))}
                placeholder="z. B. Sommer-Sirup Pfirsich"
                className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            </label>
            <label className="md:col-span-2 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Artikel-Nr.</span>
              <input value={neuArt.artNr} onChange={e => setNeuArt(s => ({ ...s, artNr: e.target.value }))}
                placeholder="optional" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
            </label>
            <label className="md:col-span-2 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Einheit</span>
              <select value={neuArt.einheit} onChange={e => setNeuArt(s => ({ ...s, einheit: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                <option value="kg">kg</option><option value="l">l</option><option value="Stk.">Stk.</option>
              </select>
            </label>
            <label className="md:col-span-2 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Einkaufspreis (€)</span>
              <input value={neuArt.preis} inputMode="decimal" onChange={e => setNeuArt(s => ({ ...s, preis: e.target.value }))}
                placeholder="z. B. 8,90" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
            </label>
            <label className="md:col-span-2 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">für Menge (g/ml)</span>
              <input value={neuArt.menge} inputMode="decimal" onChange={e => setNeuArt(s => ({ ...s, menge: e.target.value }))}
                placeholder="z. B. 1000" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-700">{artMsg}</span>
            <button onClick={artikelSpeichern}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-medium">Artikel anlegen</button>
          </div>
        </div>
      )}

      {canEdit && frischOpen && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Frischpress-Preise · Auspressquote</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Einkaufspreis ÷ ausgepresste Nettomenge = €/g. Wird auf alle Rezepturen mit dieser Zutat angewendet.
              </p>
            </div>
            <button onClick={() => setFrischOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="space-y-2">
            {FRISCH_ARTIKEL.map(a => {
              const row = frisch[a.key];
              const preis = parseDe(row.preis), netto = parseDe(row.netto);
              const proG = (preis > 0 && netto > 0) ? preis / netto : null;
              const cur = aktuellerProG[a.zutat];
              return (
                <div key={a.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-2.5">
                  <div className="md:col-span-3">
                    <div className="text-sm font-medium text-gray-800">{a.label}</div>
                    <div className="text-xs text-gray-400">
                      {a.zutat}{cur != null && ` · aktuell ${fmtKg(cur)} €/kg`}
                    </div>
                  </div>
                  <label className="md:col-span-3 flex flex-col">
                    <span className="text-[11px] text-gray-500 mb-0.5">Einkaufspreis (€)</span>
                    <input value={row.preis} inputMode="decimal" placeholder="z. B. 12,50"
                      onChange={e => setFrisch(f => ({ ...f, [a.key]: { ...f[a.key], preis: e.target.value } }))}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                  </label>
                  <label className="md:col-span-3 flex flex-col">
                    <span className="text-[11px] text-gray-500 mb-0.5">Nettomenge (g/ml)</span>
                    <input value={row.netto} inputMode="decimal" placeholder="z. B. 3000"
                      onChange={e => setFrisch(f => ({ ...f, [a.key]: { ...f[a.key], netto: e.target.value } }))}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                  </label>
                  <div className="md:col-span-3 text-right">
                    <div className="text-sm font-semibold text-emerald-700 tabular-nums">{proG != null ? `${fmtKg(proG)} €/kg` : "—"}</div>
                    <div className="text-[11px] text-gray-400 tabular-nums">{proG != null ? `${fmtG(proG)} €/g` : "Preis & Menge eingeben"}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-emerald-700">{frischMsg}</span>
            <div className="flex gap-2">
              <button onClick={() => { setFrisch(FRISCH_INIT); setFrischMsg(""); }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1.5">
                <RotateCcw size={14} /> Zurücksetzen
              </button>
              <button onClick={frischUebernehmen}
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
                Preise übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter-Leiste */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="z. B. Mango, Becher, Artikelnummer …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Untergruppe</span>
            <select value={gruppe} onChange={e => setGruppe(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="Alle">Alle ({zutaten.length})</option>
              {EINKAUF_UNTERGRUPPEN.map(g => (
                <option key={g} value={g} disabled={!gruppenZaehlung[g]}>
                  {g} ({gruppenZaehlung[g] || 0})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setGruppe("Alle")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              gruppe === "Alle"
                ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
            }`}>
            Alle
          </button>
          {EINKAUF_UNTERGRUPPEN.filter(g => gruppenZaehlung[g] > 0).map(g => (
            <button key={g} onClick={() => setGruppe(g)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                gruppe === g
                  ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
              }`}>
              {g} <span className="text-gray-400">· {gruppenZaehlung[g]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {sichtbar.length} von {zutaten.length} Zutaten
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                {sortHeader("name",            "Zutat",              "left")}
                {sortHeader("art",             "Artikel-Nr.",        "left")}
                {sortHeader("einheit",         "Einheit",            "left")}
                {sortHeader("packGroesse",     "Packungsgröße")}
                {sortHeader("packPreis",       "Packungspreis")}
                {sortHeader("preisProGramm",   "Preis / g · / kg")}
                {sortHeader("ausbeute",        "Ausbeute %")}
                {sortHeader("preisbasis",      "Berechnung", "left")}
                {canEdit && <th className="w-10"></th>}
              </tr>
            </thead>
            {renderTabelle()}
          </table>
        </div>
      </div>

      {canEdit && onSpeichern && (
        <div className="flex items-center gap-3 pt-2">
          <button onClick={onSpeichern}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2.5 text-sm font-semibold flex items-center gap-2">
            <Download size={14} /> Speichern
          </button>
          {speichernMsg && <span className="text-xs text-gray-500">{speichernMsg}</span>}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Einkaufspreise werden in den Kalkulationen pro Zutat verwendet. Quelle: aktive Preisliste
        (rezeptdatenbank + smoothies v3 + juices v3 + refresher v1). Über „CSV-Preise" im Header
        lassen sich neue Lieferantenpreise importieren.
      </p>
    </div>
  );
}

function NaehrwerteTab({ produkte }) {
  const [suche, setSuche]       = useState("");
  const [gruppe, setGruppe]     = useState("Alle");
  const [alOhne, setAlOhne]     = useState([]); // ausgewählte „ohne …"-Filter
  const [sortBy, setSortBy]     = useState("name");
  const [sortDir, setSortDir]   = useState("asc");

  const toggleOhne = (a) => setAlOhne(alOhne.includes(a) ? alOhne.filter(x => x !== a) : [...alOhne, a]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    let arr = produkte.filter(p => {
      if (gruppe !== "Alle" && p.gruppe !== gruppe) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.groesse || "").toLowerCase().includes(q)) return false;
      // „ohne X" — Produkt muss frei von X sein
      for (const a of alOhne) if (p.allergene.includes(a)) return false;
      return true;
    });
    arr.sort((a, b) => {
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [produkte, suche, gruppe, alOhne, sortBy, sortDir]);

  const sortHeader = (key, label, align = "right") => (
    <th className={`text-${align} px-3 py-2 font-medium cursor-pointer hover:bg-gray-100`}
        onClick={() => {
          if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else { setSortBy(key); setSortDir(align === "right" ? "desc" : "asc"); }
        }}>
      {label}{sortBy === key && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filter-Leiste */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="z. B. Caesar, Mango, 0,5l …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Warengruppe</span>
            <select value={gruppe} onChange={e => setGruppe(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="Alle">Alle ({produkte.length})</option>
              {WARENGRUPPEN.map(g => {
                const n = produkte.filter(p => p.gruppe === g).length;
                return <option key={g} value={g} disabled={n === 0}>{g} ({n})</option>;
              })}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-gray-600">Nur Produkte ohne:</span>
          {ALLE_ALLERGENE.map(a => (
            <button key={a} onClick={() => toggleOhne(a)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                alOhne.includes(a)
                  ? "bg-red-100 border-red-300 text-red-800"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
              }`}>
              {alOhne.includes(a) ? "✓ ohne " : "ohne "}{a}
            </button>
          ))}
          {alOhne.length > 0 && (
            <button onClick={() => setAlOhne([])}
              className="text-xs text-gray-500 hover:text-gray-800 underline ml-2">Zurücksetzen</button>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {sichtbar.length} von {produkte.length} Produkten · Werte pro 100 g / 100 ml ·
        Quelle: NWT-Excel Stand 08.10.2025
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                {sortHeader("name",    "Produkt",       "left")}
                {sortHeader("groesse", "Größe",         "left")}
                {sortHeader("gruppe",  "Gruppe",        "left")}
                {sortHeader("kcal",    "kcal")}
                {sortHeader("kh",      "KH g")}
                {sortHeader("zucker",  "Zucker g")}
                {sortHeader("eiweiss", "Eiweiß g")}
                {sortHeader("fett",    "Fett g")}
                {sortHeader("salz",    "Salz g")}
                <th className="text-left px-3 py-2 font-medium">Allergene</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                  Keine Treffer. Filter anpassen.
                </td></tr>
              )}
              {sichtbar.map((p, i) => (
                <tr key={`${p.name}_${p.groesse}_${p.gruppe}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{p.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p.groesse || "—"}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p.gruppe}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{p.kcal != null ? Math.round(p.kcal) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.kh != null ? p.kh.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.zucker != null ? p.zucker.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.eiweiss != null ? p.eiweiss.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.fett != null ? p.fett.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.salz != null ? p.salz.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2">
                    {p.allergene.length === 0
                      ? <span className="text-xs text-gray-400">—</span>
                      : <div className="flex flex-wrap gap-1">
                          {p.allergene.map(a => (
                            <span key={a} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">{a}</span>
                          ))}
                        </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Nährwerte sind kalkulatorische Werte aus der zentralen NWT-Excel (Stand 08.10.2025).
        Allergen-Kennzeichnung gilt rechtlich nur am POS — Stand bei Lieferantenwechsel prüfen.
      </p>
    </div>
  );
}

// ============================================================
//  INITIAL STATE — aus rezeptdatenbank.json (146 Rezepte, 142 Zutaten)
// ============================================================
function buildInitialState(json, ...overrides) {
  const priceList = {};
  (json?.price_list || []).forEach(p => {
    if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
  });
  for (const ov of overrides) {
    (ov?.price_list || []).forEach(p => {
      if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
    });
  }

  // Pseudo-Rezepte aus der Excel-Konvertierung filtern (Tabellen-Header wie
  // „Steuersatz in Haus %", „IN"/„Out", „Wareneinsatz Durchschnitt …" wurden
  // beim Parsen fälschlich als Rezepte gespeichert).
  const istMuell = (name) => {
    const n = (name || "").trim().toLowerCase();
    if (n === "in" || n === "out" || n === "summe" || n === "mwst") return true;
    return n.includes("steuersatz") || n.includes("wareneinsatz durschnitt") ||
           n.includes("wareneinsatz durchschnitt") || n.includes("verkaufspreis");
  };

  let produkte = (json?.recipes || [])
    .filter(r => r.name && r.name.trim().length > 0 && !istMuell(r.name))
    .map(r => normalizeRecipe(r, priceList))
    .filter(p => p.gruppe !== "Archiv"); // Archiv-Tab wurde entfernt → diese Rezepte werden nicht mehr angezeigt

  // Pro Override: alle Produkte der dort definierten Gruppen ersetzen
  for (const ov of overrides) {
    if (!ov?.produkte) continue;
    const overrideGruppen = new Set(ov.produkte.map(p => p.gruppe));
    produkte = produkte.filter(p => !overrideGruppen.has(p.gruppe));
    produkte = [...produkte, ...ov.produkte];
  }

  return { produkte, priceList };
}

// Quellen, die ihre Warengruppe komplett ersetzen (kanonische Kalkulations-Excels):
// bowls_v2 (7 Normal + 7 Klein) ersetzt die Bowls-Gruppe komplett.
// wraps_v1 (8 Wraps) ersetzt die Wraps-Gruppe komplett.
// iced_drinks_v1 (2 Iced Coffee Latte + 3 Frozen Iced Tea) ersetzt die alten
// Junk-Einträge der Iced-Drinks-Gruppe; Refresher kommen via APPENDING dazu.
const REPLACING_OVERRIDES = [smoothiesV3, juicesV3, bowlsV2, wrapsV1, icedDrinksV1];
// Quellen, die nur hinzufügen (Untergruppen-Ergänzungen, Spezialprodukte):
const APPENDING_OVERRIDES = [refresherV1];

const INITIAL = (() => {
  try {
    let { produkte, priceList } = buildInitialState(rezeptdatenbankJson, ...REPLACING_OVERRIDES);
    for (const ov of APPENDING_OVERRIDES) {
      if (ov?.produkte) produkte = [...produkte, ...ov.produkte];
      if (ov?.price_list) {
        for (const p of ov.price_list) {
          if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
        }
      }
    }
    // Aktueller Stand (Susanne, 05.06.2026) ersetzt die gesamte Produktliste.
    // priceList bleibt aus rezeptdatenbank+Overrides (für CSV-Preisimport-Lookups).
    if (standAktuell?.produkte?.length) {
      produkte = standAktuell.produkte;
    }
    if (produkte.length === 0) throw new Error("Keine Rezepte gefunden");
    return { produkte, priceList };
  } catch (e) {
    console.warn("Rezeptdatenbank nicht ladbar, nutze Demo-Daten:", e);
    return { produkte: DEMO_PRODUKTE, priceList: {} };
  }
})();

// ============================================================
//  HAUPTKOMPONENTE
// ============================================================
export default function KalkulationsApp() {
  const [produkte, setProdukte] = useState(INITIAL.produkte);
  const [priceList, setPriceList] = useState(INITIAL.priceList);
  const [manuelleArtikel, setManuelleArtikel] = useState([]); // selbst angelegte Einkaufsartikel (persistiert)
  const [geloeschteArtikel, setGeloeschteArtikel] = useState([]); // gelöschte Einkaufsartikel (Namen, lowercase; persistiert, sonst kämen Basis-Artikel beim Neuladen zurück)
  const [aktiverTab, setAktiverTab] = useState("Smoothies");
  const [importOpen, setImportOpen] = useState(false);
  const [editProdukt, setEditProdukt] = useState(null); // null | "neu" | produktObjekt
  const [editGruppeDefault, setEditGruppeDefault] = useState(null);
  const [mix, setMix] = useState({
    "Smoothies": 22, "Juices": 8, "Iced Drinks": 15,
    "Bowls": 30, "Wraps": 22, "Kampagnen": 3,
  });
  const [letzterImport, setLetzterImport] = useState(null);
  // Bon-Vorlagen je Warengruppe + "_default"; leer = Fallback aus bon.js
  const [bonVorlagen, setBonVorlagen] = useState({});
  // Gemerkte Spaltenzuordnungen des Preisimports, je Dateiform (Signatur der
  // Spaltenliste) -> {name, preis, einheit, artNr, semantik}. Damit fragt der
  // Import-Dialog dieselbe TG-Exportform kein zweites Mal.
  const [importMappings, setImportMappings] = useState({});
  // Zentrale Basis-Rezeptur der Bowls (Salat / Kartoffel / Reis); persistiert
  // im Dokument als bowl_basis, Vorgabe bis zur ersten Pflege.
  const [bowlBasis, setBowlBasis] = useState(DEFAULT_BOWL_BASIS);
  const jsonRef = useRef(null);

  // Alles, was gespeichert wird - Cloud wie Export - kommt aus dieser einen Stelle.
  const dokument = () => dokumentZumSpeichern({
    mix, produkte, bowlBasis, artikel: manuelleArtikel, geloescht: geloeschteArtikel,
    bonVorlagen, importMappings,
  });

  // ---- Cloud / Auth (Supabase) ----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [cloudMsg, setCloudMsg] = useState("");
  const [cloudInfo, setCloudInfo] = useState(null); // { updated_at, updated_by }
  const email  = session?.user?.email || "";
  const writer = !cloudEnabled || isWriter(email); // lokaler Modus = Vollzugriff
  const seededRef = useRef(false);

  // Auth-Session beobachten
  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Daten aus der Cloud laden + Live-Sync, sobald eingeloggt
  useEffect(() => {
    if (!cloudEnabled || !session) return;
    let active = true;
    (async () => {
      try {
        const row = await loadKalkulation();
        if (!active) return;
        if (row?.data?.produkte) {
          setProdukte(row.data.produkte);
          if (row.data.mix) setMix(row.data.mix);
          if (row.data.artikel?.length) {
            setManuelleArtikel(row.data.artikel);
            setPriceList(prev => { const m = { ...prev }; for (const a of row.data.artikel) m[a.ingredient_name.toLowerCase()] = a; return m; });
          }
          if (row.data.geloescht?.length) {
            setGeloeschteArtikel(row.data.geloescht);
            setPriceList(prev => { const m = { ...prev }; for (const k of row.data.geloescht) delete m[k]; return m; });
          }
          if (row.data.bon_vorlagen) setBonVorlagen(row.data.bon_vorlagen);
          if (row.data.import_mappings) setImportMappings(row.data.import_mappings);
          if (row.data.bowl_basis?.varianten) setBowlBasis(row.data.bowl_basis);
          setCloudInfo({ updated_at: row.updated_at, updated_by: row.updated_by });
        } else if (isWriter(session.user?.email) && !seededRef.current) {
          // Erstbefüllung: aktuellen Stand (Susanne) in die Cloud schreiben
          seededRef.current = true;
          await saveKalkulation(dokument());
          setCloudMsg("Startdaten in die Cloud übertragen.");
        }
      } catch (e) {
        if (active) setCloudMsg("Cloud-Laden fehlgeschlagen: " + e.message);
      }
    })();
    const ch = subscribeKalkulation((data, by, at) => {
      if (!data?.produkte) return;
      setProdukte(data.produkte);
      if (data.mix) setMix(data.mix);
      if (data.artikel?.length) {
        setManuelleArtikel(data.artikel);
        setPriceList(prev => { const m = { ...prev }; for (const a of data.artikel) m[a.ingredient_name.toLowerCase()] = a; return m; });
      }
      if (data.geloescht) {
        setGeloeschteArtikel(data.geloescht);
        setPriceList(prev => { const m = { ...prev }; for (const k of data.geloescht) delete m[k]; return m; });
      }
      if (data.bon_vorlagen) setBonVorlagen(data.bon_vorlagen);
      if (data.import_mappings) setImportMappings(data.import_mappings);
      if (data.bowl_basis?.varianten) setBowlBasis(data.bowl_basis);
      setCloudInfo({ updated_at: at, updated_by: by });
    });
    return () => { active = false; try { supabase.removeChannel(ch); } catch (_) {} };
  }, [session]);

  const handleCloudSave = async () => {
    if (!writer) return;
    try {
      setCloudMsg("Speichere …");
      await saveKalkulation(dokument());
      setCloudMsg("✓ Gespeichert — für alle sichtbar");
      setTimeout(() => setCloudMsg(""), 3000);
    } catch (e) {
      setCloudMsg("Speichern fehlgeschlagen: " + e.message);
    }
  };

  const handleJsonUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const db = JSON.parse(ev.target.result);
        // Format 1: rezeptdatenbank.json mit price_list + recipes
        // Format 2: App-Export mit produkte + mix
        if (db.produkte) {
          setProdukte(db.produkte);
          if (db.mix) setMix(db.mix);
          if (db.bon_vorlagen) setBonVorlagen(db.bon_vorlagen);
          if (db.bowl_basis?.varianten) setBowlBasis(db.bowl_basis);
          alert(`${db.produkte.length} Produkte aus App-Export geladen.`);
          return;
        }
        const pl = {};
        (db.price_list || []).forEach(p => {
          if (p.ingredient_name) pl[p.ingredient_name.toLowerCase()] = p;
        });
        const normalized = (db.recipes || []).filter(r => r.name).map(r => normalizeRecipe(r, pl));
        setProdukte(normalized);
        setPriceList(pl);
        alert(`${normalized.length} Rezepte geladen.`);
      } catch (err) {
        alert("Fehler beim Laden der JSON: " + err.message);
      }
    };
    reader.readAsText(f);
  };

  // Neue Rezepte aus einer JSON-Datei einspielen ({produkte:[...]}).
  // Zutaten werden gegen die Preisliste angereichert (Preis, Ausbeute,
  // Stueckgewicht) und die Kosten ueber zutatKosten gerechnet. Vorhandene
  // Produkte (gleiche id oder gleicher Name) werden uebersprungen.
  const handleRezeptImport = (datei) => {
    const reader = new FileReader();
    reader.onload = () => {
      const roh = String(reader.result || "");
      // Haeufigster Fehlgriff: eine Excel-Rezeptur statt einer JSON-Importdatei.
      // xlsx/docx/zip beginnen alle mit "PK" - ohne diesen Hinweis kommt nur ein
      // unverstaendlicher Parserfehler ("Unexpected token 'P'").
      if (roh.startsWith("PK")) {
        setCloudMsg(`„${datei.name}“ ist eine Excel-Datei. „Rezepte importieren“ liest nur JSON-Importdateien. Excel-Rezepturen müssen vorher umgewandelt werden.`);
        return;
      }
      try {
        const daten = JSON.parse(reader.result);
        const neue = Array.isArray(daten.produkte) ? daten.produkte : [];
        // Optional: 'entfernen' = Liste von Produkt-ids, die die Importdatei
        // ersetzt (z. B. Korrektur falsch angelegter Varianten)
        const zuEntfernen = new Set(Array.isArray(daten.entfernen) ? daten.entfernen : []);
        if (!neue.length && !zuEntfernen.size) {
          setCloudMsg("Importdatei enthält keine Produkte."); return;
        }
        const basis = produkte.filter(p => !zuEntfernen.has(p.id));
        const entfernt = produkte.length - basis.length;
        const ids = new Set(basis.map(p => p.id));
        const namen = new Set(basis.map(p => (p.name || "").toLowerCase()));
        let uebersprungen = 0;
        const angereichert = [];
        for (const p of neue) {
          if (ids.has(p.id) || namen.has((p.name || "").toLowerCase())) {
            uebersprungen++; continue;
          }
          const zutaten = (p.zutaten || []).map(roh => {
            const z = { lieferant: "Transgourmet", ...roh };
            const treffer = priceList[(z.name || "").toLowerCase()];
            if (treffer) {
              if (istStueck(z)) {
                // Stück-Zeile ({einheit:"stk", menge_stk, preis_je_stueck}): Stückpreis aus dem Artikel
                if (!(z.preis_je_stueck > 0) && stueckpreis(treffer) != null) z.preis_je_stueck = stueckpreis(treffer);
              } else if (!(z.preis_pro_g > 0) && treffer.price_per_gram_ml != null) {
                z.preis_pro_g = treffer.price_per_gram_ml;
              }
              z.ausbeute_prozent = treffer.ausbeute_prozent ?? z.ausbeute_prozent ?? null;
              z.gramm_je_stueck = stueckgewicht(treffer) || z.gramm_je_stueck || null;
            }
            return normalisiereZutat(z);
          });
          angereichert.push({ verpackung_eur: 0, vk_in_brutto: 0, vk_out_brutto: 0,
            kampagne_start: null, kampagne_ende: null, untergruppe: null,
            ...p, zutaten });
        }
        if (angereichert.length || zuEntfernen.size) {
          setProdukte(prev => [...prev.filter(p => !zuEntfernen.has(p.id)), ...angereichert]);
        }
        setCloudMsg(`✓ ${angereichert.length} Rezepte importiert`
          + (entfernt ? `, ${entfernt} alte Varianten entfernt` : "")
          + (uebersprungen ? `, ${uebersprungen} schon vorhanden` : "")
          + ` — bitte prüfen und oben „Speichern".`);
      } catch (fehler) {
        setCloudMsg(`„${datei.name}“ ist keine gültige JSON-Importdatei (${fehler.message}).`);
      }
    };
    reader.readAsText(datei);
  };

  const handleJsonDownload = () => {
    const out = {
      meta: { generiert_am: new Date().toISOString(), version: "1.1", quelle: "kalkulations-app",
              stand: new Date().toISOString().slice(0, 10) },
      mix,
      produkte,
      bowl_basis: bowlBasis,
      // Kassen-Sicht: je Bowl-Variante ein Produkt (<id>, <id>_kartoffel, <id>_reis)
      produkte_aufgeloest: aufgeloesteProdukte(produkte, bowlBasis),
      // kompletter Artikelstamm inkl. Ausbeute/Preisbasis - Quelle fuer die
      // Bestell-App (igorder); dort werden die Zutatenwerte daraus gelesen
      artikel: Object.values(priceList),
      bon_vorlagen: bonVorlagen,
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `immergruen-kalkulation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Preislisten-Import: matcht ueber die Artikelnummer gegen den STAMM
  // (priceList), aktualisiert dort Preis + Pruefdatum und stempelt von da in
  // alle Rezepturen. Bis 08/2026 traf der Import nur namensgleiche
  // Rezeptzeilen und liess den Stamm auf dem Ur-Import von 03/2025 stehen -
  // Susannes Wochen-Upload kam deshalb nie an. Logik in preisimport.js
  // (getestet); Persistenz wie handleArtikelFelder ueber manuelleArtikel.
  const handlePriceImport = (aktualisierungen, semantik = "gebinde") => {
    const ergebnis = verarbeitePreisimport({ zeilen: aktualisierungen, priceList, semantik });
    const patches = ergebnis.patches;
    if (Object.keys(patches).length > 0) {
      setPriceList(prev => ({ ...prev, ...patches }));
      setManuelleArtikel(prev => [
        ...prev.filter(a => !patches[(a.ingredient_name || "").toLowerCase()]),
        ...Object.values(patches),
      ]);
      setProdukte(prev => prev.map(p => ({
        ...p,
        zutaten: (p.zutaten || []).map(z => {
          const neu = patches[(z.name || "").toLowerCase()];
          if (!neu) return z;
          if (istStueck(z)) {
            // Stück-Zeile: nur der Stückpreis des Artikels zählt, nicht der Grammpreis
            const sp = stueckpreis(neu);
            if (sp == null || Math.abs(sp - (+z.preis_je_stueck || 0)) < 1e-9) return z;
            return normalisiereZutat({ ...z, preis_je_stueck: sp });
          }
          if (!(+neu.price_per_gram_ml > 0) || neu.price_per_gram_ml === z.preis_pro_g) return z;
          return normalisiereZutat({ ...z, preis_pro_g: neu.price_per_gram_ml });
        }),
      })));
    }
    setLetzterImport({ datum: new Date(), anzahl: aktualisierungen.length,
                       veraendert: ergebnis.geaendert });
    setCloudMsg(`Preisimport: ${ergebnis.geaendert} geändert, ${ergebnis.unveraendert} bestätigt, `
      + `${ergebnis.ohneMatch.length} ohne Treffer — zum Sichern oben „Speichern".`);
    return ergebnis;
  };

  const handleProduktUpdate = (id, updates) => {
    setProdukte(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Frischpress-Preise: setzt für bestimmte Zutaten (z. B. Frischer Apfelsaft)
  // einen neuen Preis pro g und rechnet die Kosten aller betroffenen Rezepturen neu.
  // list: [{ name, proG }]
  const handleFrischpreise = (list) => {
    const map = {};
    list.forEach(u => { map[u.name.toLowerCase()] = u.proG; });
    setProdukte(prev => prev.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        const neuerProG = map[z.name.toLowerCase()];
        return neuerProG != null && !istStueck(z)
          ? normalisiereZutat({ ...z, preis_pro_g: neuerProG })
          : z;
      }),
    })));
  };

  const handleProduktNeu = (gruppe, kampagne = null, start = null, ende = null) => {
    setEditProdukt(leeresProdukt(gruppe, kampagne, start, ende));
  };

  // Individuellen Einkaufsartikel anlegen (z. B. für Kampagnen) – ergänzt die Preisliste.
  const handleAddArtikel = (artikel) => {
    const key = artikel.ingredient_name.toLowerCase();
    setPriceList(prev => ({ ...prev, [key]: artikel }));
    setManuelleArtikel(prev => [...prev.filter(a => a.ingredient_name.toLowerCase() !== key), artikel]);
    // Falls der Name zuvor gelöscht war: Löschvermerk aufheben, sonst verschwindet er beim nächsten Laden wieder
    setGeloeschteArtikel(prev => prev.filter(k => k !== key));
  };

  // Einkaufsartikel aus der Preisliste löschen. Rezepturen behalten ihre Preise
  // (die Preise sind pro Zutat in den Rezepten gespeichert) — der Artikel ist nur
  // nicht mehr in der Liste/Auswahl. Löschvermerk wird mit in die Cloud gespeichert.
  const handleDeleteArtikel = (name) => {
    const key = (name || "").toLowerCase();
    if (!key) return;
    setPriceList(prev => { const m = { ...prev }; delete m[key]; return m; });
    setManuelleArtikel(prev => prev.filter(a => a.ingredient_name.toLowerCase() !== key));
    setGeloeschteArtikel(prev => prev.includes(key) ? prev : [...prev, key]);
    setCloudMsg(`„${name}" aus der Preisliste entfernt — zum Sichern oben „Speichern".`);
  };

  // Artikel-Eigenschaften (Ausbeute, g/Stück) zentral pflegen. Die Werte sind
  // Eigenschaften des ARTIKELS, nicht der Rezeptzeile — sie werden hier gesetzt
  // und sofort in alle Rezepturen gestempelt, die die Zutat verwenden.
  // Persistenz wie handleAddArtikel: über manuelleArtikel in die Cloud.
  const handleArtikelFelder = (name, patch) => {
    const key = (name || "").toLowerCase();
    const alt = priceList[key];
    if (!alt) return;
    const neu = { ...alt, ...patch };
    // Stueckgewicht: gepflegtes gewicht_je_stueck_g, sonst rechnerisch
    // (Stueckpreis / Preis pro Gramm) - haengt von Preisbasis und Preisen ab
    neu.gramm_je_stueck = stueckgewicht(neu);
    setPriceList(prev => ({ ...prev, [key]: neu }));
    setManuelleArtikel(prev => [...prev.filter(a => a.ingredient_name.toLowerCase() !== key), neu]);
    setGeloeschteArtikel(prev => prev.filter(k => k !== key));
    setProdukte(prev => prev.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        if ((z.name || "").toLowerCase() !== key) return z;
        // Stueck-Zeilen behalten ihr Gewicht, wenn der Artikel keins liefert
        return normalisiereZutat({ ...z,
          ausbeute_prozent: neu.ausbeute_prozent ?? null,
          gramm_je_stueck: neu.gramm_je_stueck ?? (istStueck(z) ? z.gramm_je_stueck : null) ?? null });
      }),
    })));
    setCloudMsg(`„${name}" aktualisiert — Rezepturen neu gerechnet. Zum Sichern oben „Speichern".`);
  };

  // Alt-Ausbeuten aus der Excel-Aera herausloesen: Manche Frischartikel tragen
  // den Verschnitt noch IM Listenpreis (Apfel: netto 1,25 €/kg eingekauft,
  // Liste 2,08 €/kg = 60 % Ausbeute eingepreist). Diese Bereinigung setzt den
  // Listenpreis auf den echten Netto-Einkauf (Packungspreis / Packungsgroesse)
  // zurueck und traegt den Faktor in die Ausbeute-Spalte ein. Die Rezeptkosten
  // bleiben dadurch unveraendert: netto / Ausbeute = alter Preis.
  const handleAltAusbeuten = () => {
    const funde = [];
    const auffaellig = [];
    for (const [key, a] of Object.entries(priceList)) {
      if (a.ausbeute_prozent != null) continue;          // schon manuell gepflegt
      const einheit = String(a.unit || "").toLowerCase();
      let groesseG = null;
      if (einheit === "g" || einheit === "ml") groesseG = +a.package_size || null;
      else if (einheit === "kg" || einheit === "l") groesseG = (+a.package_size || 0) * 1000 || null;
      if (!groesseG || !(+a.package_price > 0) || !(+a.price_per_gram_ml > 0)) continue;
      const netto = a.package_price / groesseG;
      const ratio = a.price_per_gram_ml / netto;
      if (ratio >= 1.02 && ratio <= 5) {
        funde.push({ key, name: a.ingredient_name, alt: a.price_per_gram_ml,
                     netto, ausbeute: Math.round(1000 / ratio) / 10 });
      } else if (ratio < 0.98) {
        auffaellig.push(a.ingredient_name);
      }
    }
    if (!funde.length) {
      setCloudMsg("Keine Alt-Ausbeuten in den Listenpreisen gefunden — nichts zu tun."
        + (auffaellig.length ? ` (${auffaellig.length} Artikel liegen UNTER dem Netto-Einkauf — bitte manuell prüfen: ${auffaellig.slice(0, 5).join(", ")}…)` : ""));
      return;
    }
    const beispiele = funde.slice(0, 8).map(f => `${f.name} (${f.ausbeute} %)`).join(", ");
    if (!confirm(`${funde.length} Artikel tragen den Verschnitt noch im Listenpreis:\n${beispiele}${funde.length > 8 ? " …" : ""}\n\nJetzt bereinigen? Der Listenpreis wird auf den Netto-Einkauf zurückgesetzt, die Ausbeute-Spalte übernimmt den Faktor — die Rezeptkosten bleiben unverändert.`)) return;

    const map = {};
    funde.forEach(f => { map[f.key] = f; });

    setPriceList(prev => {
      const m = { ...prev };
      for (const f of funde) {
        m[f.key] = { ...m[f.key], price_per_gram_ml: f.netto, ausbeute_prozent: f.ausbeute };
      }
      return m;
    });
    setManuelleArtikel(prev => {
      const rest = prev.filter(a => !map[(a.ingredient_name || "").toLowerCase()]);
      const neue = funde.map(f => ({ ...(priceList[f.key] || {}),
        price_per_gram_ml: f.netto, ausbeute_prozent: f.ausbeute }));
      return [...rest, ...neue];
    });

    // Rezeptzeilen mitziehen — aber NUR wenn ihr Preis dem alten Listenpreis
    // entspricht (±2 %). Manuell abweichende Preise bleiben unangetastet,
    // sonst wuerden sich deren Kosten still veraendern.
    let zeilen = 0, uebersprungen = 0;
    setProdukte(prev => prev.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        const f = map[(z.name || "").toLowerCase()];
        if (!f || istStueck(z)) return z;
        const abweichung = Math.abs((z.preis_pro_g || 0) - f.alt) / f.alt;
        if (abweichung > 0.02) { uebersprungen++; return z; }
        zeilen++;
        return normalisiereZutat({ ...z, preis_pro_g: f.netto, ausbeute_prozent: f.ausbeute });
      }),
    })));
    setCloudMsg(`✓ ${funde.length} Artikel bereinigt, ${zeilen} Rezeptzeilen umgestellt`
      + (uebersprungen ? `, ${uebersprungen} Zeilen mit abweichendem Preis unangetastet` : "")
      + ` — Kosten unverändert. Zum Sichern oben „Speichern".`);
  };

  // Alle Zutaten ohne Preis tolerant gegen die Preisliste abgleichen und Preise ziehen.
  // Liefert die Anzahl übernommener Preise zurück (für die Rückmeldung am Button).
  const handlePreisAbgleich = () => {
    const plIndex = buildPlIndex(priceList);
    let count = 0;
    const next = produkte.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        if (istStueck(z) || (z.preis_pro_g || 0) > 0) return z;
        const proG = findPreisProG(z.name, plIndex);
        if (proG > 0) {
          count++;
          return normalisiereZutat({ ...z, preis_pro_g: proG });
        }
        return z;
      }),
    }));
    if (count > 0) setProdukte(next);
    // Basiszutaten der Bowls ohne Preis ebenso aus der Liste fuellen
    let basisCount = 0;
    const b = bowlBasisOderDefault(bowlBasis);
    const basisNeu = { ...b, varianten: Object.fromEntries(Object.entries(b.varianten || {}).map(([k, v]) => [k, {
      ...v,
      zutaten: (v.zutaten || []).map(z => {
        if ((+z.preis_pro_g || 0) > 0) return z;
        const proG = findPreisProG(z.name, plIndex);
        if (proG > 0) { basisCount++; return { ...z, preis_pro_g: proG }; }
        return z;
      }),
    }])) };
    if (basisCount > 0) setBowlBasis(basisNeu);
    setCloudMsg(count + basisCount > 0
      ? `✓ ${count} Zutatenpreise aus der Preisliste übernommen${basisCount ? ` (+ ${basisCount} in der Bowl-Basis)` : ""} — prüfen & „Speichern".`
      : "Keine weiteren Preise aus der Liste zuordenbar.");
    return count + basisCount;
  };

  // Datenpflege: Ei von Gramm auf Stück. Stückpreis aus dem Artikel „Eier“
  // (8,45 € je 30 = 0,28 €), 50 g je Ei als Gramm-Äquivalent - so rechnet
  // auch der Bestellvorschlag (Eimer 60 St = 3.000 g).
  const handleEiAufStueck = () => {
    if (!writer) return;
    const artikel = priceList["eier"]
      || Object.values(priceList).find(a => EI_MUSTER.test(a.ingredient_name || ""));
    const sp = artikel ? stueckpreis({ ...artikel, preisbasis: "stueck" }) : null;
    let zeilen = 0;
    const next = produkte.map(p => {
      let geaendert = false;
      const zutaten = (p.zutaten || []).map(z => {
        if (!EI_MUSTER.test((z.name || "").trim()) || istStueck(z)) return z;
        geaendert = true; zeilen++;
        const mengeG = +z.menge_g || 0;
        // 50 g = 1 Ei (bisherige Rezeptur); kleine Zahlen waren schon als Stück gemeint
        const stk = mengeG >= 20 ? Math.max(1, Math.round(mengeG / EI_GEWICHT_G)) : Math.max(1, Math.round(mengeG) || 1);
        const preisAlt = +z.preis_pro_g || 0;
        const preis = sp ?? (mengeG >= 20 ? preisAlt * EI_GEWICHT_G : preisAlt * 1000);
        return normalisiereZutat({ ...z, einheit: "stk", menge_stk: stk, preis_je_stueck: preis, gramm_je_stueck: EI_GEWICHT_G });
      });
      return geaendert ? { ...p, zutaten } : p;
    });
    if (!zeilen) { setCloudMsg("Keine Ei-Zeile in Gramm gefunden."); return; }
    setProdukte(next);
    if (artikel) {
      const key = (artikel.ingredient_name || "").toLowerCase();
      const neu = { ...artikel, preisbasis: "stueck", gewicht_je_stueck_g: +artikel.gewicht_je_stueck_g || EI_GEWICHT_G };
      neu.gramm_je_stueck = stueckgewicht(neu);
      setPriceList(prev => ({ ...prev, [key]: neu }));
      setManuelleArtikel(prev => [...prev.filter(a => (a.ingredient_name || "").toLowerCase() !== key), neu]);
    }
    setCloudMsg(`✓ Ei in ${zeilen} Rezeptzeile${zeilen === 1 ? "" : "n"} auf Stück umgestellt`
      + (sp != null ? ` (${fmtEUR(sp)} je Ei aus der Preisliste)` : "") + ` — prüfen und oben „Speichern".`);
  };

  // Datenpflege: eigene Kartoffel-/Reis-Produkte (Import 03.09.2026) entfernen -
  // die Varianten entstehen jetzt aus dem Grundrezept.
  const handleDuplikateEntfernen = (ids) => {
    if (!writer || !ids?.length) return;
    if (!confirm(`${ids.length} Varianten-Duplikate löschen? Kartoffel- und Reisvarianten entstehen ab jetzt aus dem Grundrezept.`)) return;
    const weg = new Set(ids);
    setProdukte(prev => prev.filter(p => !weg.has(p.id)));
    setCloudMsg(`✓ ${ids.length} Duplikate entfernt — oben „Speichern".`);
  };

  const befunde = useMemo(() => pflegeBefunde(produkte, bowlBasis), [produkte, bowlBasis]);

  const handleProduktSave = (produkt) => {
    setProdukte(prev => {
      const idx = prev.findIndex(p => p.id === produkt.id);
      if (idx === -1) return [...prev, produkt];
      return prev.map(p => p.id === produkt.id ? produkt : p);
    });
  };

  const handleProduktDelete = (id) => {
    setProdukte(prev => prev.filter(p => p.id !== id));
  };

  // Bon-Felder eines Rezepts setzen. Leerstring wird zu null, damit
  // "leer" ueberall dasselbe bedeutet (= Automatik).
  const handleBonFeld = (produktId, patch) => {
    if (!writer) return;
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => (p.id === produktId ? { ...p, ...sauber } : p)));
  };

  // Bon-Felder EINER Zutat (Kuechenmass, Handlungsanweisung) setzen.
  const handleBonZutat = (produktId, index, patch) => {
    if (!writer) return;
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => {
      if (p.id !== produktId) return p;
      const zutaten = (p.zutaten || []).map((z, i) => (i === index ? { ...z, ...sauber } : z));
      return { ...p, zutaten };
    }));
  };

  // Bestehendes Rezept als Kopie in eine Kampagne übernehmen.
  const handleKampagneImport = (produktId, kampagneName) => {
    setProdukte(prev => {
      const src = prev.find(p => p.id === produktId);
      if (!src) return prev;
      const kopie = {
        ...src,
        id: `kamp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        gruppe: "Kampagnen",
        untergruppe: null,
        kampagne: (kampagneName || "").trim() || null,
        zutaten: (src.zutaten || []).map(z => ({ ...z })),
        kampagne_start: null,
        kampagne_ende: null,
      };
      return [...prev, kopie];
    });
  };

  // Kassen-Sicht fuer verdichtete Kennzahlen: Bowls je Variante gezaehlt
  const produkteAufgeloest = useMemo(() => aufgeloesteProdukte(produkte, bowlBasis), [produkte, bowlBasis]);

  // System-Soll-WE (für globalen KPI im Header)
  const sollWeGlobal = useMemo(() => {
    return WARENGRUPPEN.reduce((s, g) => {
      const ps = produkteAufgeloest.filter(p => p.gruppe === g);
      if (ps.length === 0) return s;
      const avg = ps.reduce((x, p) => x + berechne(p).we_out, 0) / ps.length;
      return s + avg * (mix[g] || 0) / 100;
    }, 0);
  }, [produkteAufgeloest, mix]);

  const produkteImTab = useMemo(() => {
    if (aktiverTab === "Kampagnen")  return produkte.filter(p => p.gruppe === "Kampagnen");
    if (aktiverTab === "SystemWE")   return produkte;
    return produkte.filter(p => p.gruppe === aktiverTab);
  }, [produkte, aktiverTab]);

  const tabs = [
    ...WARENGRUPPEN.map(g => ({ id: g, label: g })),
    { id: "SystemWE",       label: "System-Wareneinsatz" },
    { id: "Naehrwerte",     label: "Nährwerttabelle" },
    { id: "Einkaufspreise", label: "Einkaufspreise" },
    { id: "Produktionsbons", label: "Produktionsbons" },
    { id: "Inventur",       label: "Inventur" },
  ];

  const bonsGepflegt = useMemo(() => produkte.filter(p => bonStatus(p) !== "auto").length, [produkte]);

  const inventurArtikelGesamt = useMemo(() => {
    let n = 0;
    for (const L of inventurJson.lieferanten) for (const g of L.untergruppen) n += g.artikel.length;
    return n;
  }, []);

  // ---- Auth-Gate (nur im Cloud-Modus) ----
  const FOREST_GRADIENT = "linear-gradient(135deg, #0d2818 0%, #1b4332 45%, #2d6a4f 100%)";
  const HEADER_GRADIENT = "linear-gradient(135deg, #1b4332 0%, #2d6a4f 40%, #40916c 100%)";
  if (cloudEnabled && !authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: FOREST_GRADIENT }}>
        <img src={logoWeiss} alt="immergrün" className="h-10 w-auto opacity-95" />
        <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        <p className="text-sm" style={{ color: "#cfe8d6" }}>Lädt …</p>
      </div>
    );
  }
  if (cloudEnabled && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: FOREST_GRADIENT }}>
        {/* Dekorative Akzent-Flächen in IG-Fresh / Bright */}
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-20" style={{ background: "#96c31e" }} />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full blur-3xl opacity-10" style={{ background: "#52b788" }} />

        <div className="relative w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <img src={logoWeiss} alt="immergrün" className="h-12 w-auto drop-shadow" />
          </div>

          <div className="bg-white rounded-3xl shadow-2xl px-8 py-9 text-center border-t-4" style={{ borderTopColor: "#96c31e" }}>
            <h1 className="text-6xl font-black tracking-tight leading-none" style={{ color: "#084b32" }}>
              CALKU<span style={{ color: "#96c31e" }}>.</span>
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] mt-3" style={{ color: "#40916c" }}>
              Wareneinsatz &amp; Kalkulation
            </p>
            <p className="text-gray-500 text-sm mt-4 mb-7 leading-relaxed">
              Interner Zugang für das immergrün-Team.<br />
              Bitte mit deinem immergrün-Google-Konto anmelden.
            </p>

            <button onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-0.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Mit Google anmelden
            </button>

            {cloudMsg && <p className="text-xs text-red-600 mt-4">{cloudMsg}</p>}

            <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
              <Lock size={12} /> Geschützter Bereich · nur @mein-immergruen.de
            </div>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: "#cfe8d6" }}>
            immergrün Franchise GmbH · Wareneinsatz &amp; Kalkulation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white app-chrome-header" style={{ background: HEADER_GRADIENT, borderBottom: "3px solid #96c31e" }}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={logoWeiss} alt="immergrün" className="h-12 w-auto" />
              <div>
                <h1 className="text-3xl font-black tracking-tight leading-none">
                  CALKU<span style={{ color: "#96c31e" }}>.</span>
                </h1>
                <p className="text-green-100 text-sm mt-1">
                  Wareneinsatz, Deckungsbeiträge, Soll-/Ist-Vergleich
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {writer && (
                  <label title="Neue Rezepte aus einer JSON-Importdatei einspielen (Preise/Ausbeuten werden aus der Preisliste ergänzt)"
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet size={14} /> Rezepte importieren
                    <input type="file" accept=".json,application/json" className="hidden"
                      onChange={e => { const f = e.target.files && e.target.files[0];
                        if (f) handleRezeptImport(f); e.target.value = ""; }} />
                  </label>
                )}
                {writer && (
                  <button onClick={() => setImportOpen(true)}
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet size={14} /> CSV-Preise
                  </button>
                )}
                {/* Ein Speichern-Button: im Cloud-Modus speichert er für alle (Supabase),
                    im lokalen Modus lädt er die Daten als JSON-Datei herunter. */}
                {cloudEnabled && writer && (
                  <button onClick={handleCloudSave}
                    className="bg-white text-green-800 hover:bg-green-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <Download size={14} /> Speichern
                  </button>
                )}
                {cloudEnabled && (
                  <button onClick={handleJsonDownload}
                    title="Aktuellen Stand als JSON-Datei herunterladen — u. a. als Quelle für die Bestell-App (igorder)"
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet size={14} /> Export
                  </button>
                )}
                {!cloudEnabled && (
                  <button onClick={handleJsonDownload}
                    className="bg-white text-green-800 hover:bg-green-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <Download size={14} /> Speichern
                  </button>
                )}
                {cloudEnabled && !writer && (
                  <span className="bg-white/15 rounded-lg px-3 py-2 text-sm font-medium">Nur-Lese-Zugriff</span>
                )}
                {cloudEnabled && session && (
                  <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/30">
                    <span className="text-xs text-green-100 max-w-[180px] truncate" title={email}>{email}</span>
                    <button onClick={signOut}
                      className="bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-2 text-xs font-medium">Abmelden</button>
                  </div>
                )}
              </div>
              {/* Import- und Speichermeldungen gehoeren nicht an den Cloud-Modus:
                  im lokalen Modus lief der Import sonst ohne jede Rueckmeldung. */}
              {(cloudMsg || (cloudEnabled && cloudInfo?.updated_by)) && (
                <span className="text-xs text-green-100">
                  {cloudMsg || `Zuletzt gespeichert: ${cloudInfo.updated_by || "—"}`}
                </span>
              )}
            </div>
          </div>

          {/* Globale KPI-Leiste */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Produkte gesamt</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtNum(produkte.length)}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Soll-WE (Mix)</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtPct(sollWeGlobal)}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Soll inkl. Schwund</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtPct(sollWeGlobal + SCHWUND_PCT)}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Letzter Preisimport</div>
              <div className="text-sm font-medium mt-1">
                {letzterImport
                  ? `${fmtDate(letzterImport.datum)} · ${letzterImport.veraendert} Preise geändert`
                  : "noch keiner"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab-Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 app-chrome-nav">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setAktiverTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  aktiverTab === t.id
                    ? "border-green-700 text-green-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}>
                {t.label}
                {aktiverTab !== t.id && (() => {
                  if (t.id === "SystemWE")       return null;
                  if (t.id === "Naehrwerte")     return <span className="ml-1.5 text-xs text-gray-400">({naehrwerteJson.produkte.length})</span>;
                  if (t.id === "Einkaufspreise") return <span className="ml-1.5 text-xs text-gray-400">({Object.keys(priceList).length})</span>;
                  if (t.id === "Inventur")       return <span className="ml-1.5 text-xs text-gray-400">({inventurArtikelGesamt})</span>;
                  if (t.id === "Produktionsbons") return <span className="ml-1.5 text-xs text-gray-400">({bonsGepflegt}/{produkte.length})</span>;
                  const n = produkte.filter(p => p.gruppe === t.id).length;
                  return n > 0 ? <span className="ml-1.5 text-xs text-gray-400">({n})</span> : null;
                })()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {aktiverTab === "SystemWE"       && <SystemWeTab produkte={produkteAufgeloest} mix={mix} setMix={setMix} />}
        {aktiverTab === "Naehrwerte"     && <NaehrwerteTab produkte={naehrwerteJson.produkte} />}
        {aktiverTab === "Einkaufspreise" && (
          <EinkaufspreiseTab priceList={priceList} produkte={produkte} onUpdateArtikel={handleArtikelFelder} onAltAusbeute={handleAltAusbeuten}
            onFrischpreise={handleFrischpreise} onAddArtikel={handleAddArtikel}
            onPreisAbgleich={handlePreisAbgleich} onDeleteArtikel={handleDeleteArtikel} canEdit={writer}
            onSpeichern={cloudEnabled ? (writer ? handleCloudSave : null) : handleJsonDownload}
            speichernMsg={cloudMsg} />
        )}
        {aktiverTab === "Inventur"       && <InventurTab inventur={inventurJson} />}
        {aktiverTab === "Produktionsbons" && (
          <BonsTab produkte={produkte} warengruppen={WARENGRUPPEN} vorlagen={bonVorlagen}
            onVorlagen={setBonVorlagen} onFeld={handleBonFeld} onZutat={handleBonZutat} canEdit={writer} />
        )}
        {aktiverTab === "Kampagnen"&& <KampagnenTab produkte={produkteImTab} setProdukte={setProdukte}
                                       onEdit={setEditProdukt} onDelete={handleProduktDelete} onNeu={handleProduktNeu}
                                       alleProdukte={produkte} onImport={handleKampagneImport} />}
        {WARENGRUPPEN.includes(aktiverTab) && aktiverTab !== "Kampagnen" && (
          <WarengruppenTab produkte={produkteImTab} gruppe={aktiverTab}
            onUpdate={handleProduktUpdate}
            onEdit={setEditProdukt}
            onDelete={handleProduktDelete}
            onNeu={handleProduktNeu}
            bowlBasis={bowlBasis} onBowlBasis={writer ? setBowlBasis : null} canEdit={writer}
            befunde={befunde} onEiUmstellen={handleEiAufStueck} onDuplikateEntfernen={handleDuplikateEntfernen} />
        )}
      </main>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handlePriceImport}
        mappings={importMappings}
        onMappingMerken={(signatur, mapping, semantik) =>
          setImportMappings(prev => ({ ...prev, [signatur]: { ...mapping, semantik } }))} />

      <ProduktEditModal
        open={editProdukt !== null}
        produkt={editProdukt}
        priceList={priceList}
        bowlBasis={bowlBasis}
        onClose={() => setEditProdukt(null)}
        onSave={handleProduktSave}
        onDelete={handleProduktDelete}
      />

      <footer className="max-w-7xl mx-auto px-6 py-4 text-xs text-gray-400 text-center app-chrome-footer">
        MwSt.: Speisen, Açaí, Smoothies, Frozen Yoghurt 7 % · übrige Getränke 19 % ·
        im Haus wie außer Haus · Unterschied IN/OUT ist allein die Verpackung ·
        Kennzahlen und Ampeln rechnen mit OUT (außer Haus) ·
        Schwellwert Smoothies/Juices/Iced Drinks: 24 % · Bowls/Wraps/Kampagnen: 26 % ·
        Schwund-Puffer: 3 %
      </footer>
    </div>
  );
}
