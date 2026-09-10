// ============================================================
//  Zutatenstamm (E11, Stufe 1) — eine Zeile je Zutat, Rezeptzeilen verweisen per zutat_id
// ============================================================
// Bis 09/2026 war der Zutatenname jeder Rezeptzeile Freitext. Der Einkaufsartikel wurde nur
// beim Eintippen ueber den exakten Namen getroffen und hinterliess keine Referenz: 148 von 166
// Zutatennamen matchten keinen Artikel, und Arbeitseinheit (Beutel, Schale, Stueck), Stueckgewicht
// und Ausbeute hatten keinen Ort. Der Stamm hier ist dieser Ort - ein Datum, ein Eigentuemer
// (Bauplan igpartner/docs/igstore-bauplan-arbeitseinheiten.md, Abschnitt 5.1).
//
// Die ids sind die Schluessel des IG-Store-Stamms T16 (haehnchen, ei-gekocht, kartoffeln-gegart),
// damit der Spiegel in Stufe 3 per Upsert darauf landet. Unbekannte Felder (bestandteile,
// quellfaktor fuer Stufe 2) bleiben beim Normalisieren erhalten.
//
// Pur und ohne React, wie preisimport.js - Tests in zutaten.test.js.
import { normalisiereNummer } from "./preisimport.js";
import { STUECK_EINHEITEN } from "./artikelpreis.js";

export const KLASSEN = ["frisch", "kuehl", "tk", "trocken"];
export const KLASSE_TITEL = { frisch: "Frisch", kuehl: "Kühl", tk: "TK", trocken: "Trocken" };
export const STAMM_EINHEITEN = ["g", "ml", "stk"];

// ---------- Helfer ----------

export const normalisiereName = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const zahlOderNull = (wert) => {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const positivOderNull = (wert) => {
  const n = zahlOderNull(wert);
  return n !== null && n > 0 ? n : null;
};
// Ausbeute 1-99 gilt; 100, 0, leer oder Unsinn = keine Wirkung (null)
const ausbeuteOderNull = (wert) => {
  const n = zahlOderNull(wert);
  return n !== null && n > 0 && n < 100 ? n : null;
};
const textOderNull = (wert) => String(wert ?? "").trim() || null;

// Liste bereinigen: getrimmt, ohne Leere, ohne Doppelte (case-insensitiv), Reihenfolge bleibt.
export function bereinigeListe(liste = []) {
  const gesehen = new Set();
  const ergebnis = [];
  for (const roh of Array.isArray(liste) ? liste : String(liste ?? "").split(/[;,\n]/)) {
    const wert = String(roh ?? "").trim();
    const k = normalisiereName(wert);
    if (!k || gesehen.has(k)) continue;
    gesehen.add(k);
    ergebnis.push(wert);
  }
  return ergebnis;
}

// „Ei (gekocht)" -> „ei-gekocht", „Hähnchen" -> „haehnchen", „Açaí (Schicht 1 – Boden)" -> „acai-schicht-1-boden".
// Dieselbe Regel wie der T16-Seed (pipelines/tools/seed_vorbereitungsartikel.py).
const UMLAUTE = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
export function zutatId(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTE[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Artikelnummer eines Preislisten-Artikels, oder null: Z-Platzhalter und Links aus dem alten
// Build-Stamm („https://www.amazon.de/…" als article_number) sind keine Nummern.
export function artikelNummer(a) {
  const nr = normalisiereNummer(a?.article_number);
  if (!nr || /^z\d+$/.test(nr) || /^https?:/.test(nr) || nr.length > 20) return null;
  return nr;
}

// Stueck-Artikel der Preisliste: explizite Preisbasis, sonst Stueck-Einheit. KEINE Groessen-
// Heuristik (die alte „package_size <= 5 -> Stueck"-Regel machte H-Milch zur Stueckware).
export function istStueckArtikel(a) {
  if (!a) return false;
  if (a.preisbasis) return a.preisbasis === "stueck";
  return STUECK_EINHEITEN.has(String(a.unit || "").toLowerCase());
}

// Stueckgewicht eines Stueck-Artikels: gepflegt, sonst rechnerisch (Stueckpreis / Preis je Gramm).
export function artikelStueckgewicht(a) {
  if (!istStueckArtikel(a)) return null;
  const manuell = +(a.gewicht_je_stueck_g) || 0;
  if (manuell > 0) return manuell;
  const preis = +a.package_price || 0;
  const anzahl = Math.max(1, +a.package_size || 1);
  const proG = +a.price_per_gram_ml || 0;
  return preis > 0 && proG > 0 ? Math.round(preis / anzahl / proG) : null;
}

// ---------- Stammzeile ----------

export function leereZutat(name = "") {
  const n = String(name ?? "").trim();
  return {
    id: zutatId(n),
    name: n,
    aliase: n ? [n] : [],
    artikel_nr: null,
    einheit: "g",
    stueck_gramm: null,
    arbeitseinheit: { name: null, gramm: null },
    ausbeute_prozent: null,
    dichte_g_je_ml: null,
    klasse: null,
    geprueft_von: null,
    geprueft_am: null,
  };
}

// Eingabe aus Ansicht oder Import -> vollstaendige, saubere Stammzeile. Der Name ist immer
// auch Alias (so findet die Verknuepfung ihn), die id bleibt stabil, wenn sie schon existiert.
export function normalisiereStamm(z = {}) {
  const name = String(z.name ?? "").trim();
  const id = String(z.id ?? "").trim() || zutatId(name);
  const ae = z.arbeitseinheit ?? {};
  return {
    ...z,
    id,
    name: name || id,
    aliase: bereinigeListe([name, ...(z.aliase ?? [])]),
    artikel_nr: textOderNull(z.artikel_nr),
    einheit: STAMM_EINHEITEN.includes(z.einheit) ? z.einheit : "g",
    stueck_gramm: positivOderNull(z.stueck_gramm),
    arbeitseinheit: { name: textOderNull(ae.name), gramm: positivOderNull(ae.gramm) },
    ausbeute_prozent: ausbeuteOderNull(z.ausbeute_prozent),
    dichte_g_je_ml: positivOderNull(z.dichte_g_je_ml),
    klasse: KLASSEN.includes(z.klasse) ? z.klasse : null,
    geprueft_von: textOderNull(z.geprueft_von),
    geprueft_am: textOderNull(z.geprueft_am),
  };
}

export const sortiereStamm = (zutaten = []) =>
  [...(zutaten ?? [])].sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "de"));

// ---------- Suchen ----------

// jeId: id -> Zutat; jeName: normalisierter Name oder Alias -> Zutat (erster gewinnt)
export function stammIndex(zutaten = []) {
  const jeId = new Map();
  const jeName = new Map();
  for (const z of zutaten ?? []) {
    if (!z?.id) continue;
    if (!jeId.has(z.id)) jeId.set(z.id, z);
    for (const a of [z.name, ...(z.aliase ?? [])]) {
      const k = normalisiereName(a);
      if (k && !jeName.has(k)) jeName.set(k, z);
    }
  }
  return { jeId, jeName };
}

// Zutat zu einer Rezeptzeile: id vor Name/Alias. null, wenn nichts passt.
export function findeZutat(zutaten, { zutat_id = null, name = "" } = {}, index = null) {
  const { jeId, jeName } = index ?? stammIndex(zutaten);
  if (zutat_id && jeId.has(zutat_id)) return jeId.get(zutat_id);
  return jeName.get(normalisiereName(name)) ?? null;
}

// Aliase, die in mehreren Zutaten stehen — die Verknuepfung nimmt die erste, die Ansicht warnt.
export function aliasKonflikte(zutaten = []) {
  const je = new Map();
  for (const z of zutaten ?? []) {
    const gesehen = new Set();
    for (const a of [z?.name, ...(z?.aliase ?? [])]) {
      const k = normalisiereName(a);
      if (!k || gesehen.has(k)) continue;
      gesehen.add(k);
      const e = je.get(k) ?? { alias: String(a).trim(), ids: [] };
      e.ids.push(z.id);
      je.set(k, e);
    }
  }
  return [...je.values()].filter((e) => e.ids.length > 1).sort((a, b) => a.alias.localeCompare(b.alias, "de"));
}

// ---------- Verknuepfung Rezeptzeile <-> Stamm ----------

// Setzt zutat_id auf jeder Rezeptzeile, die eine Zutat trifft (id vor Name/Alias), und nimmt
// verwaiste ids weg. Unveraenderte Produkte bleiben dasselbe Objekt (React-Referenzen).
export function verknuepfeProdukte(produkte = [], zutaten = []) {
  const index = stammIndex(zutaten);
  let verknuepft = 0;
  let ohne = 0;
  let geaendert = 0;
  const neu = (produkte ?? []).map((p) => {
    let dirty = false;
    const zeilen = (p.zutaten ?? []).map((z) => {
      const treffer = findeZutat(zutaten, { zutat_id: z.zutat_id, name: z.name }, index);
      const id = treffer?.id ?? null;
      if (id) verknuepft++;
      else if (String(z.name ?? "").trim()) ohne++;
      if ((z.zutat_id ?? null) === id) return z;
      dirty = true;
      geaendert++;
      const k = { ...z };
      if (id) k.zutat_id = id;
      else delete k.zutat_id;
      return k;
    });
    return dirty ? { ...p, zutaten: zeilen } : p;
  });
  return { produkte: neu, verknuepft, ohne, geaendert };
}

// Rezeptnamen, die keine Zutat treffen — Kandidatenliste fuer die Ansicht.
// artikel = exakter Treffer in der Preisliste (dann kann die Zutat gleich angereichert werden).
export function rezeptnamenOhneZutat(produkte = [], zutaten = [], priceList = {}) {
  const index = stammIndex(zutaten);
  const je = new Map();
  for (const p of produkte ?? []) {
    for (const z of p.zutaten ?? []) {
      const name = String(z.name ?? "").trim();
      if (!name) continue;
      if (findeZutat(zutaten, { zutat_id: z.zutat_id, name }, index)) continue;
      const k = normalisiereName(name);
      const e = je.get(k) ?? { name, zeilen: 0, produkte: new Set(), menge_g: 0, artikel: priceList?.[k] ?? null, rezeptzeilen: [] };
      e.zeilen++;
      e.produkte.add(p.id);
      e.menge_g += +z.menge_g || 0;
      e.rezeptzeilen.push(z);
      je.set(k, e);
    }
  }
  return [...je.values()]
    .map((e) => ({ ...e, produkte: e.produkte.size, menge_g: Math.round(e.menge_g) }))
    .sort((a, b) => b.zeilen - a.zeilen || a.name.localeCompare(b.name, "de"));
}

// Anzahl Rezeptzeilen je Zutat-id (fuer die Ansicht und den Loeschschutz).
export function zeilenJeZutat(produkte = []) {
  const je = new Map();
  for (const p of produkte ?? []) {
    for (const z of p.zutaten ?? []) {
      if (!z?.zutat_id) continue;
      je.set(z.zutat_id, (je.get(z.zutat_id) ?? 0) + 1);
    }
  }
  return je;
}

// ---------- Anlegen aus Rezepten (Vorbelegung) ----------

// Eine Stammzeile aus einem Rezeptnamen, angereichert aus dem Artikel (exakter Namenstreffer)
// und aus den Rezeptzeilen, die den Namen tragen (Stueck-Zeilen, gepflegte Ausbeute).
export function zutatAusRezeptzeilen(name, zeilen = [], artikel = null) {
  const z = leereZutat(name);
  if (artikel) {
    z.artikel_nr = artikelNummer(artikel);
    if (istStueckArtikel(artikel)) {
      z.einheit = "stk";
      z.stueck_gramm = artikelStueckgewicht(artikel);
    }
    z.ausbeute_prozent = ausbeuteOderNull(artikel.ausbeute_prozent);
  }
  const stueckZeilen = (zeilen ?? []).filter((r) => r?.einheit === "stk");
  if (stueckZeilen.length) {
    z.einheit = "stk";
    const gewichte = stueckZeilen.map((r) => +r.gramm_je_stueck || 0).filter((g) => g > 0);
    if (gewichte.length) z.stueck_gramm = Math.max(...gewichte);
  }
  if (z.ausbeute_prozent === null) {
    const ausbeuten = (zeilen ?? []).map((r) => ausbeuteOderNull(r?.ausbeute_prozent)).filter((a) => a !== null);
    if (ausbeuten.length) z.ausbeute_prozent = Math.max(...ausbeuten);
  }
  return normalisiereStamm(z);
}

// Stamm aus allen Rezeptnamen anlegen, die noch keine Zutat treffen. Bestehende Zutaten
// bleiben, neue kommen dazu (sortiert). Doppelte ids (zwei Namen mit gleichem Schluessel,
// etwa „TK Mango" und „Tk-Mango") bekommen ein Suffix, damit nichts verloren geht.
export function zutatenAusRezepten(produkte = [], priceList = {}, bestehend = []) {
  const offen = rezeptnamenOhneZutat(produkte, bestehend, priceList);
  const ids = new Set((bestehend ?? []).map((z) => z.id));
  const neue = [];
  for (const o of offen) {
    const z = zutatAusRezeptzeilen(o.name, o.rezeptzeilen, o.artikel);
    let id = z.id || "zutat";
    let n = 2;
    while (ids.has(id)) id = `${z.id}-${n++}`;
    ids.add(id);
    neue.push({ ...z, id });
  }
  return { zutaten: sortiereStamm([...(bestehend ?? []), ...neue]), neu: neue.length };
}

// ---------- Pflege ----------

// Zwei Zutaten zusammenfuehren: quell geht in ziel auf (Name und Aliase der Quelle werden
// Aliase des Ziels, leere Zielwerte uebernehmen die der Quelle), Rezeptzeilen haengen um.
export function zusammenfuehren({ zutaten = [], produkte = [] }, zielId, quellId) {
  const ziel = (zutaten ?? []).find((z) => z.id === zielId);
  const quell = (zutaten ?? []).find((z) => z.id === quellId);
  if (!ziel || !quell || zielId === quellId) return { zutaten, produkte, zeilen: 0 };
  const neuZiel = normalisiereStamm({
    ...ziel,
    aliase: [...(ziel.aliase ?? []), quell.name, ...(quell.aliase ?? [])],
    artikel_nr: ziel.artikel_nr ?? quell.artikel_nr ?? null,
    stueck_gramm: ziel.stueck_gramm ?? quell.stueck_gramm ?? null,
    arbeitseinheit: ziel.arbeitseinheit?.gramm ? ziel.arbeitseinheit : (quell.arbeitseinheit ?? ziel.arbeitseinheit),
    ausbeute_prozent: ziel.ausbeute_prozent ?? quell.ausbeute_prozent ?? null,
    dichte_g_je_ml: ziel.dichte_g_je_ml ?? quell.dichte_g_je_ml ?? null,
    klasse: ziel.klasse ?? quell.klasse ?? null,
  });
  const zutatenNeu = (zutaten ?? []).filter((z) => z.id !== quellId).map((z) => (z.id === zielId ? neuZiel : z));
  let zeilen = 0;
  const produkteNeu = (produkte ?? []).map((p) => {
    let dirty = false;
    const zs = (p.zutaten ?? []).map((z) => {
      if (z.zutat_id !== quellId) return z;
      dirty = true;
      zeilen++;
      return { ...z, zutat_id: zielId };
    });
    return dirty ? { ...p, zutaten: zs } : p;
  });
  return { zutaten: zutatenNeu, produkte: produkteNeu, zeilen };
}

// Stammwerte in die Rezeptzeilen stempeln (wie der Artikelpreis): Ausbeute immer, Stueckgewicht
// nur in Stueck-Zeilen. normalisiere = App-Funktion, die Kosten und Gramm-Aequivalent nachzieht.
export function stempleStamm(produkte = [], zutat, normalisiere = (z) => z) {
  if (!zutat?.id) return { produkte, zeilen: 0 };
  let zeilen = 0;
  const neu = (produkte ?? []).map((p) => {
    let dirty = false;
    const zs = (p.zutaten ?? []).map((z) => {
      if (z.zutat_id !== zutat.id) return z;
      const ausbeute = zutat.ausbeute_prozent ?? null;
      const gewicht = z.einheit === "stk" && zutat.stueck_gramm > 0 ? zutat.stueck_gramm : (z.gramm_je_stueck ?? null);
      if ((z.ausbeute_prozent ?? null) === ausbeute && (z.gramm_je_stueck ?? null) === gewicht) return z;
      dirty = true;
      zeilen++;
      return normalisiere({ ...z, ausbeute_prozent: ausbeute, gramm_je_stueck: gewicht });
    });
    return dirty ? { ...p, zutaten: zs } : p;
  });
  return { produkte: neu, zeilen };
}

// Altlast (Befund B3): gramm_je_stueck in 141 Nicht-Stueck-Zeilen traegt Gebindegroessen.
export function bereinigeStueckgewichte(produkte = []) {
  let zeilen = 0;
  const neu = (produkte ?? []).map((p) => {
    let dirty = false;
    const zs = (p.zutaten ?? []).map((z) => {
      if (z.einheit === "stk" || z.gramm_je_stueck === undefined || z.gramm_je_stueck === null) return z;
      dirty = true;
      zeilen++;
      const { gramm_je_stueck, ...rest } = z;
      return rest;
    });
    return dirty ? { ...p, zutaten: zs } : p;
  });
  return { produkte: neu, zeilen };
}

// Import-JSON: zutaten[] (Upsert je id) und zutaten_entfernen[] (ids).
export function importiereZutaten(zutaten = [], liste = [], entfernen = []) {
  const weg = new Set(Array.isArray(entfernen) ? entfernen : []);
  const je = new Map((zutaten ?? []).filter((z) => z?.id && !weg.has(z.id)).map((z) => [z.id, z]));
  const entfernt = (zutaten ?? []).length - je.size;
  let neu = 0;
  let geaendert = 0;
  for (const roh of Array.isArray(liste) ? liste : []) {
    if (!roh || typeof roh !== "object") continue;
    const vor = normalisiereStamm(roh);
    if (!vor.id) continue;
    const alt = je.get(vor.id);
    if (alt) {
      // Upsert: nur die Felder der Importzeile ueberschreiben, Aliase vereinigen
      const gemischt = normalisiereStamm({
        ...alt,
        ...roh,
        id: vor.id,
        aliase: [...(alt.aliase ?? []), ...(roh.aliase ?? [])],
        arbeitseinheit: { ...(alt.arbeitseinheit ?? {}), ...(roh.arbeitseinheit ?? {}) },
      });
      if (JSON.stringify(gemischt) !== JSON.stringify(alt)) geaendert++;
      je.set(vor.id, gemischt);
    } else {
      je.set(vor.id, vor);
      neu++;
    }
  }
  return { zutaten: sortiereStamm([...je.values()]), neu, geaendert, entfernt };
}

// Befunde fuer die Ansicht.
export function stammBefunde(zutaten = [], produkte = []) {
  const je = zeilenJeZutat(produkte);
  const liste = zutaten ?? [];
  return {
    konflikte: aliasKonflikte(liste),
    stueckOhneGewicht: liste.filter((z) => z.einheit === "stk" && !(z.stueck_gramm > 0)).map((z) => z.name),
    ohneArtikel: liste.filter((z) => !z.artikel_nr).length,
    ohneArbeitseinheit: liste.filter((z) => !(z.arbeitseinheit?.gramm > 0) && !(z.einheit === "stk" && z.stueck_gramm > 0)).length,
    ohneRezept: liste.filter((z) => !je.get(z.id)).map((z) => z.name),
  };
}
