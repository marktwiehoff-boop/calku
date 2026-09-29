// Rezeptur-Check (28.09.2026): prueft alle Rezepturen auf die typischen Pflegefehler aus der
// Excel-Zeit und listet sie zum Abarbeiten. Anlass: Call Mark/Susanne - die Rezepturfehler sind
// Fleissarbeit, aber man muss sie erst einmal FINDEN. Jeder Befund verschwindet, sobald er
// behoben ist; es gibt nichts abzuhaken, was nicht wirklich stimmt.
//
// Pur und ohne React - Tests in rezepturcheck.test.js.

const STUECK = new Set(["stück", "stueck", "stk", "stk.", "st", "st.", "stck"]);

export const PRUEFUNGEN = {
  ohne_preis:     { schwere: "fehler",  label: "Zutat ohne Preis" },
  nicht_im_stamm: { schwere: "fehler",  label: "Kein Einkaufsartikel zugeordnet" },
  preis_alt:      { schwere: "hinweis", label: "Preis weicht vom Stamm ab" },
  menge_null:     { schwere: "hinweis", label: "Zeile ohne Menge" },
  doppelt:        { schwere: "fehler",  label: "Zutat doppelt" },
  staffel:        { schwere: "fehler",  label: "Größenstaffel unstimmig" },
  vk_fehlt:       { schwere: "fehler",  label: "Verkaufspreis fehlt" },
};

const istStueckZeile = (z) => z?.einheit === "stk";
const menge = (z) => (istStueckZeile(z) ? +z.menge_stk || 0 : +z.menge_g || 0);
const schluessel = (name) => String(name ?? "").trim().toLowerCase();

function istStueckArtikel(a) {
  if (a?.preisbasis) return a.preisbasis === "stueck";
  return STUECK.has(String(a?.unit ?? "").trim().toLowerCase());
}

/** Groesse eines Produkts fuer die Staffel: ml aus dem Namen, sonst Klein < Normal < Gross. */
export function groesse(name) {
  const s = String(name ?? "");
  const ml = s.match(/(\d{3,4})\s*ml\b/i);
  if (ml) return { base: s.replace(ml[0], "").trim(), rang: +ml[1], label: `${ml[1]} ml` };
  const l = s.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (l) { const v = parseFloat(l[1].replace(",", ".")) * 1000; return { base: s.replace(l[0], "").trim(), rang: v, label: `${l[1]} l` }; }
  const w = s.match(/\b(klein|normal|groß|gross)\b/i);
  if (w) {
    const rang = { klein: 1, normal: 2, "groß": 3, gross: 3 }[w[1].toLowerCase()];
    return { base: s.replace(w[0], "").replace(/\s+/g, " ").trim(), rang, label: w[1] };
  }
  return null;
}

const eur = (v) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);

/**
 * @param produkte   Rezepturen [{ id, name, gruppe, zutaten, vk_in_brutto, vk_out_brutto }]
 * @param optionen   { artikelVon(zeile) -> Artikel|null (artikelzuordnung.js; Standard: nach Name
 *                   in priceList), priceList, ohneStammabgleich: Set<lowercase name> - Zutaten,
 *                   deren Preis bewusst nur in der Rezeptur steht (Frischpress-Saefte) }
 * @returns [{ produktId, produkt, gruppe, typ, schwere, zutat?, text }]
 */
export function pruefeRezepturen(produkte = [], { priceList = {}, artikelVon = null, ohneStammabgleich = new Set() } = {}) {
  const artikel = artikelVon ?? ((z) => priceList[schluessel(z.name)] ?? null);
  const befunde = [];
  const melde = (p, typ, text, zutat = null) =>
    befunde.push({ produktId: p.id, produkt: p.name, gruppe: p.gruppe, typ, schwere: PRUEFUNGEN[typ].schwere, zutat, text });

  for (const p of produkte) {
    if (!p || p.gruppe === "Archiv") continue;
    const gesehen = new Set();
    for (const z of p.zutaten ?? []) {
      const key = schluessel(z.name);
      if (!key) continue;
      if (gesehen.has(key)) melde(p, "doppelt", `„${z.name}“ steht zweimal in der Rezeptur`, z.name);
      gesehen.add(key);

      const m = menge(z);
      if (!(m > 0)) { melde(p, "menge_null", `„${z.name}“ hat keine Menge`, z.name); continue; }
      if (!(+z.cost > 0)) melde(p, "ohne_preis", `„${z.name}“ kostet 0 € — kein Einkaufspreis hinterlegt`, z.name);

      const a = artikel(z);
      if (!a) {
        if (!ohneStammabgleich.has(key)) {
          melde(p, "nicht_im_stamm", `„${z.name}“ hat keinen Einkaufsartikel — neue Einkaufspreise erreichen diese Zeile nie. Im Tab Zutaten die Artikelnummer eintragen.`, z.name);
        }
        continue;
      }
      if (ohneStammabgleich.has(key)) continue;
      // Stueckzeile gegen Stueckpreis, Grammzeile gegen Grammpreis
      let soll = null, ist = null, einheit = "";
      if (istStueckZeile(z)) {
        if (istStueckArtikel(a) && +a.package_price > 0) {
          soll = +a.package_price / Math.max(1, +a.package_size || 1); ist = +z.preis_je_stueck || 0; einheit = "€/Stk";
        }
      } else if (+a.price_per_gram_ml > 0) {
        soll = +a.price_per_gram_ml * 1000; ist = (+z.preis_pro_g || 0) * 1000; einheit = "€/kg";
      }
      if (soll > 0 && ist > 0 && Math.abs(ist - soll) / soll > 0.02) {
        melde(p, "preis_alt", `„${z.name}“ rechnet mit ${eur(ist)} ${einheit}, der Stamm sagt ${eur(soll)} ${einheit}`, z.name);
      }
    }
    if (!(+p.vk_out_brutto > 0) && !(+p.vk_in_brutto > 0)) melde(p, "vk_fehlt", "Kein Verkaufspreis eingetragen");
  }

  // Staffel: innerhalb einer Sorte darf keine Zutat mit der Groesse abnehmen oder wegfallen
  const sorten = new Map();
  for (const p of produkte) {
    if (!p || p.gruppe === "Archiv") continue;
    const g = groesse(p.name);
    if (!g) continue;
    const k = `${p.gruppe}|${g.base.toLowerCase()}`;
    if (!sorten.has(k)) sorten.set(k, []);
    sorten.get(k).push({ p, ...g });
  }
  for (const reihe of sorten.values()) {
    if (reihe.length < 2) continue;
    reihe.sort((x, y) => x.rang - y.rang);
    for (let i = 1; i < reihe.length; i++) {
      const klein = reihe[i - 1], gross = reihe[i];
      const mengenGross = new Map((gross.p.zutaten ?? []).map(z => [schluessel(z.name), z]));
      for (const z of klein.p.zutaten ?? []) {
        const key = schluessel(z.name);
        const g = mengenGross.get(key);
        if (!g) {
          melde(gross.p, "staffel", `„${z.name}“ ist in ${klein.label} drin, fehlt aber in ${gross.label}`, z.name);
        } else if (menge(g) < menge(z) && istStueckZeile(g) === istStueckZeile(z)) {
          melde(gross.p, "staffel", `„${z.name}“: ${gross.label} hat weniger (${menge(g)}) als ${klein.label} (${menge(z)})`, z.name);
        }
      }
    }
  }
  return befunde;
}
