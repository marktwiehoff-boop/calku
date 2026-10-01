// Zuordnungs-Assistent: Rezept-Zutat -> Einkaufsartikel (10/2026).
//
// Preise erreichen eine Rezeptzeile nur ueber ihren Artikel (artikelzuordnung.js). Bei 129 von
// 165 Zutaten fehlte der: Kuechennamen ("Salatmix", "Joghurteis") treffen keinen Artikelnamen,
// und der Zutatenstamm war leer. Eine Vollautomatik ueber Namensaehnlichkeit greift daneben
// (Hafermilch -> H-Milch, TK-Heidelbeeren -> frische 125-g-Schale). Deshalb: Die App schlaegt
// je Zutat die besten Artikel vor - Namensaehnlichkeit plus Preisvergleich -, der Mensch
// bestaetigt mit einem Klick, und die Entscheidung steht danach fuer immer im Zutatenstamm.
//
// Pur und ohne React - Tests in zuordnung.test.js.
import { artikelKey } from "./artikelzuordnung.js";
import { findeZutat } from "./zutaten.js";

const STUECK = /^(st|stk|stk\.|stück|stueck|stck)$/i;
const istStueckArtikel = (a) => (a?.preisbasis ? a.preisbasis === "stueck" : STUECK.test(String(a?.unit ?? "").trim()));

/** Preis eines Artikels in der Einheit einer Rezeptzeile: EUR/kg bzw. EUR/l, oder EUR/Stueck. */
export function artikelPreis(a, stueck) {
  if (!a) return null;
  if (stueck) {
    if (istStueckArtikel(a) && +a.package_price > 0) return +a.package_price / Math.max(1, +a.package_size || 1);
    return +a.net_price_per_unit > 0 ? +a.net_price_per_unit : null;
  }
  return +a.price_per_gram_ml > 0 ? +a.price_per_gram_ml * 1000 : null;
}

// Namen vergleichbar machen: Kleinschrift, Umlaute, Lieferantenkuerzel und Mengen weg
const KUERZEL = /\b(b153|tk|tgq|tge|tgn|fr|frisch|kl|i+|gastro|bio|vegan|veg|pg|ka|st|stk|ca|immergrün|immergruen|ig)\b/g;
export function vergleichsname(t) {
  return String(t ?? "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/b153[_\s]*/g, " ")
    .replace(/[0-9]+([.,][0-9]+)?\s*(kg|g|l|ml|cl|st|stk|x)?/g, " ")
    .replace(/[_./()´'`-]/g, " ")
    .replace(KUERZEL, " ")
    .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}

function trigramme(t) {
  const x = `  ${vergleichsname(t)} `;
  const set = new Set();
  for (let i = 0; i < x.length - 2; i++) set.add(x.slice(i, i + 3));
  return set;
}
function dice(a, b) {
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return (2 * n) / ((a.size + b.size) || 1);
}
// Jedes Wort der Zutat, das (als Anfang) in der Artikelbezeichnung vorkommt, zaehlt extra:
// "Joghurteis" findet "B153_Joghurteis TK 3,5kg" auch zwischen vielen anderen Woertern.
function wortTreffer(zutat, artikel) {
  const w = vergleichsname(zutat).split(" ").filter((x) => x.length >= 4);
  if (!w.length) return 0;
  const a = vergleichsname(artikel);
  return w.filter((x) => a.includes(x.slice(0, Math.max(4, x.length - 2)))).length / w.length;
}

/** Index der Artikel fuer schnelle Vorschlaege (Non-Food bleibt draussen). */
export function baueArtikelIndex(priceList = {}) {
  return Object.entries(priceList)
    .filter(([, a]) => a && !a.nonfood)
    .map(([key, a]) => ({ key, artikel: a, tri: trigramme(a.ingredient_name) }));
}

/**
 * Die besten Artikel fuer eine Zutat.
 * @returns [{ key, artikel, aehnlich (0-1), preis, faktor (Rezepturpreis / Artikelpreis), punkte }]
 */
export function vorschlaege(name, { rezeptPreis = null, stueck = false } = {}, index = [], anzahl = 3) {
  const t = trigramme(name);
  return index
    .map(({ key, artikel, tri }) => {
      const aehnlich = Math.max(dice(t, tri), 0.85 * wortTreffer(name, artikel.ingredient_name));
      const preis = artikelPreis(artikel, stueck);
      const faktor = rezeptPreis > 0 && preis > 0 ? rezeptPreis / preis : null;
      let bonus = 0;
      if (faktor) {
        if (faktor > 0.7 && faktor < 1.45) bonus = 0.15;
        else if (faktor > 0.4 && faktor < 2.5) bonus = 0.03;
        else bonus = -0.1;
      }
      return { key, artikel, aehnlich, preis, faktor, punkte: aehnlich + bonus };
    })
    .filter((v) => v.aehnlich >= 0.25)
    .sort((a, b) => b.punkte - a.punkte)
    .slice(0, anzahl);
}

/** Freitextsuche im Stamm (fuer die Auswahl von Hand). */
export function suche(text, index = [], anzahl = 8) {
  const roh = String(text ?? "").trim();
  if (/^\d{3,}$/.test(roh)) {
    return index.filter(({ artikel }) => String(artikel.article_number ?? "").includes(roh)).slice(0, anzahl);
  }
  const q = vergleichsname(roh);
  if (q.length < 2) return [];
  const teile = q.split(" ");
  return index
    .filter(({ artikel }) => {
      const n = vergleichsname(artikel.ingredient_name);
      return teile.every((t) => n.includes(t));
    })
    .slice(0, anzahl);
}

/**
 * Alle Zutaten der Rezepturen mit ihrem Stand: zugeordnet (Artikel gefunden), bewusst ohne
 * Artikel (eigene Kalkulation) oder offen. Sortiert nach Kostenanteil - die teuren zuerst.
 */
export function zutatenUebersicht(produkte = [], zuordnung, zutaten = []) {
  const je = new Map();
  for (const p of produkte ?? []) {
    for (const z of p.zutaten ?? []) {
      const name = String(z.name ?? "").trim();
      if (!name) continue;
      const k = name.toLowerCase();
      const e = je.get(k) ?? { name, zeilen: 0, produkte: new Set(), kosten: 0, preise: [], stueck: false, zeile: z, rezeptzeilen: [] };
      e.zeilen++;
      e.produkte.add(p.id);
      e.kosten += +z.cost || 0;
      e.rezeptzeilen.push({ produktId: p.id, zeile: z });
      if (z.einheit === "stk") { e.stueck = true; if (+z.preis_je_stueck > 0) e.preise.push(+z.preis_je_stueck); }
      else if (+z.preis_pro_g > 0) e.preise.push(+z.preis_pro_g * 1000);
      je.set(k, e);
    }
  }
  return [...je.values()].map((e) => {
    const key = artikelKey(e.zeile, zuordnung);
    const zutat = findeZutat(zutaten, { zutat_id: e.zeile.zutat_id, name: e.name });
    const rezeptPreis = e.preise.length ? e.preise.reduce((s, x) => s + x, 0) / e.preise.length : null;
    const artikel = key ? zuordnung.priceList[key] : null;
    const stand = key ? "zugeordnet" : zutat?.ohne_artikel ? "eigen" : "offen";
    return {
      name: e.name, zeilen: e.zeilen, produkte: e.produkte.size, kosten: e.kosten, stueck: e.stueck,
      rezeptPreis, preisSpanne: e.preise.length ? [Math.min(...e.preise), Math.max(...e.preise)] : null,
      key, artikel, artikelPreis: artikelPreis(artikel, e.stueck), zutat, stand, rezeptzeilen: e.rezeptzeilen,
    };
  }).sort((a, b) => b.kosten - a.kosten || a.name.localeCompare(b.name, "de"));
}
