// Transgourmet-Preisliste "CSV Erweitert" (Shop-Export, 29 Spalten) - direkt rechnen statt skalieren.
//
// Bis 10/2026 las der Import nur Nummer, Name, Preis und Einheit und zog den alten Packungspreis
// im Stamm proportional hoch (preisimport.js, skaliere). Das stimmt nur, wenn die Stamm-Packung
// zufaellig dem Liefergebinde entspricht. Bei der Liste vom 26.09.2026 sprangen 84 von 225
// Artikeln genau um den Karton-Inhalt (x4, x6, x8, x18). Die Datei hat aber alles, was man
// braucht:
//   "Preis pro Einzeleinheit"  = Preis je Liefereinheit (Karton) - trotz des Namens; gleich
//                                "Preis pro Gebinde"
//   "Inhalt"                   = Einzeleinheiten im Karton (8 Packungen)
//   "Rezeptmenge" + "Einheit Rezeptmenge" = Inhalt einer Einzeleinheit (1,000 LT / 0,500 KG / 1 ST)
// => Preis je kg/l/Stueck = Preis / (Inhalt x Rezeptmenge). Der Stammartikel bekommt danach
// genau das Liefergebinde als Packung - Gebinde-Faktoren und Scheinspruenge entfallen.
//
// Der Export ist zudem kaputt: In jeder Zeile fehlen zwei schliessende Anfuehrungszeichen
// ("LT,"1,023" und ".../492430,"KA"), ab Spalte 13 rutscht alles um eins. repariereTgCsv()
// setzt sie wieder.
//
// Pur und ohne React - Tests in tgimport.test.js.
import { abgleichNummer, lieferantVon } from "./preisimport.js";

export const TG_PFLICHTSPALTEN = ["Artikelnr", "Artikeltext1", "Inhalt", "Preis pro Einzeleinheit", "Rezeptmenge", "Einheit Rezeptmenge"];

/** Ist das eine erweiterte TG-Liste (mit Inhalt und Rezeptmenge)? */
export function istTgErweitert(spalten = []) {
  return TG_PFLICHTSPALTEN.every((s) => spalten.includes(s));
}

/** Fehlende schliessende Anfuehrungszeichen setzen: `x,"` mitten in einem Feld -> `x","`. */
export function repariereTgCsv(text) {
  return String(text ?? "").replace(/([^",\r\n]),"/g, '$1","');
}

const zahl = (v) => {
  const n = parseFloat(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Katalogebene 1 der Liste -> CALKU-Warengruppe. "Frisch-Convenience" ist gemischt (Saucen,
// Hummus, Pulled-Ware) - dort entscheidet der Name, sonst Saucen & Dressings.
const KATALOG_GRUPPE = {
  "Milchprodukte/ Eiprodukte": "Molkerei & Vegan",
  "Brot/Backwaren": "Brot & Wraps",
  "Tiefkühlprodukte": "Tiefkühl",
  "Obst und Gemüse": "Frische",
  "Lebensmittel - ungekühlt": "Trockenwaren & Toppings",
  "Süsswaren/salzige Snacks": "Trockenwaren & Toppings",
  "Heißgetränke": "Säfte & Getränke",
  "Getränke, Wein, Spirituosen": "Säfte & Getränke",
  "HoReCa - Non Food/GKT": "Verpackung",
  "Körperpflege und Kosmetik": "Reinigung & Hygiene",
  "Wasch-/Reinigungsmittel / Hygiene": "Reinigung & Hygiene",
  "Haushaltswaren/-Geräte": "Reinigung & Hygiene",
  "Bürobedarf": "Reinigung & Hygiene",
};
const NONFOOD = new Set(["Verpackung", "Reinigung & Hygiene"]);

/** Warengruppe aus dem Katalog; vorschlag(name) entscheidet bei gemischten Katalogen. */
export function gruppeAusKatalog(katalog, name, vorschlag = null) {
  if (katalog === "Frisch-Convenience") {
    const v = vorschlag?.(name);
    return v && !NONFOOD.has(v) ? v : "Saucen & Dressings";
  }
  return KATALOG_GRUPPE[katalog] ?? vorschlag?.(name) ?? null;
}

/**
 * Eine Zeile der Liste -> Liefergebinde mit Preis je Basiseinheit.
 * basis: "g" | "ml" | "stk"; menge = Gebindeinhalt in dieser Basis; jeBasis = EUR je g/ml/Stueck.
 */
// Stueckzahl aus der Bezeichnung: "1000St", "40x25St", "2000x1g", "Pal10St"
export function stueckAusName(name) {
  const t = String(name ?? "");
  const mal = t.match(/(\d+)\s*x\s*(\d+)\s*st/i);
  if (mal) return +mal[1] * +mal[2];
  const st = t.match(/(\d+)\s*(st|stk|stück)(?![a-zäöü])/i);
  if (st && +st[1] > 1) return +st[1];
  const xg = t.match(/(\d+)\s*x\s*\d+([.,]\d+)?\s*(g|ml)(?![a-z])/i);
  if (xg && +xg[1] > 1) return +xg[1];
  return null;
}

/** Gesamtmenge aus der Bezeichnung in g/ml: "TK10kg" -> 10000, "12x500g" -> 6000, "3,1l" -> 3100. */
export function mengeAusName(name) {
  const t = String(name ?? "").toLowerCase().replace(/,/g, ".");
  const mal = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/);
  const f = { kg: 1000, l: 1000, g: 1, ml: 1 };
  if (mal) return +mal[1] * +mal[2] * f[mal[3]];
  const alle = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/g)];
  if (!alle.length) return null;
  const m = alle[alle.length - 1];
  return +m[1] * f[m[2]];
}

export function tgZeile(r) {
  const einheitRm = String(r["Einheit Rezeptmenge"] ?? "").split(",")[0].trim().toUpperCase();
  const basis = einheitRm === "KG" ? "g" : einheitRm === "LT" ? "ml" : einheitRm === "ST" ? "stk" : null;
  const inhalt = zahl(r.Inhalt) || 1;
  let rm = zahl(r.Rezeptmenge);
  // Transgourmet fuehrt Kartonware oft als "1 ST" je Karton ("Flachdeckel 1000St", "Salzbeutel
  // 2000x1g"). Steht die Stueckzahl in der Bezeichnung, gilt sie.
  if (basis === "stk") {
    const n = stueckAusName(r.Artikeltext1);
    if (n && n > rm) rm = n;
  }
  const preis = zahl(r["Preis pro Einzeleinheit"]) || zahl(r["Preis pro Gebinde"]);
  const menge = basis === "stk" ? inhalt * rm : inhalt * rm * 1000;
  const netto = zahl(r["Nettogewicht in KG"]);
  return {
    artNr: String(r.Artikelnr ?? "").trim(),
    name: String(r.Artikeltext1 ?? "").trim(),
    text2: String(r.Artikeltext2 ?? "").trim(),
    katalog: String(r["Katalogebene 1"] ?? "").trim(),
    gueltigAb: String(r["Preis gültig von"] ?? "").trim(),
    preis, inhalt, rm, basis, menge,
    jeBasis: basis && menge > 0 && preis > 0 ? preis / menge : null,
    // Gramm je Stueck, wo die Liste es hergibt (Nettogewicht je Einzeleinheit / Stueck darin)
    grammJeStueck: basis === "stk" && netto > 0 && rm > 0 ? Math.round((netto * 1000) / rm * 10) / 10 : null,
    // Nettogewicht des ganzen Gebindes in g - fuer Stueck-Zeilen, deren Stammartikel nach Gewicht rechnet
    nettoGramm: netto > 0 ? inhalt * netto * 1000 : null,
    // Widerspruch Bezeichnung <-> Rechenmenge ("Hä.br.Geschnet. TK10kg", Liste: 1 x 2,5 kg).
    // Die Menge der Bezeichnung gilt je Einzeleinheit oder fuers ganze Gebinde - passt keins, fragen.
    widerspruch: (() => {
      if (basis !== "g" && basis !== "ml") return null;
      const n = mengeAusName(r.Artikeltext1);
      if (!(n > 0)) return null;
      const passt = [rm * 1000, inhalt * rm * 1000].some((x) => x > 0 && Math.abs(n / x - 1) < 0.25);
      if (passt) return null;
      const text = `Bezeichnung nennt ${(n / 1000).toLocaleString("de-DE")} ${basis === "g" ? "kg" : "l"}, die Liste rechnet mit ${inhalt.toLocaleString("de-DE")} × ${rm.toLocaleString("de-DE")} ${basis === "g" ? "kg" : "l"}`;
      // Konserve: Bezeichnung in ml/l (Dosenvolumen), Liste in kg (Abtropfgewicht) - dann stimmt die Liste
      const konserve = basis === "g" && /\d\s*(ml|l)(?![a-z])/i.test(String(r.Artikeltext1 ?? ""));
      return konserve ? `${text}. Bei Konserven ist das meist das Abtropfgewicht – dann stimmt die Liste.` : text;
    })(),
  };
}

/** Bisheriger Preis eines Stammartikels in derselben Basis (EUR je g/ml bzw. je Stueck). */
function alterPreisJeBasis(a, basis) {
  if (basis === "stk") {
    const n = +a.package_size || 0;
    const p = +a.package_price || 0;
    const stueck = /^(st|stk|stk\.|stück|stueck|stck)$/i.test(String(a.unit ?? "").trim()) || a.preisbasis === "stueck";
    if (stueck && n > 0 && p > 0) return p / n;
    return +a.net_price_per_unit > 0 ? +a.net_price_per_unit : null;
  }
  return +a.price_per_gram_ml > 0 ? +a.price_per_gram_ml : null;
}

// Nach Gewicht rechnet ein Stammartikel nur mit Masseneinheit; alles andere (Stück, "CO",
// leer bei Flaschenware) fuehrt seinen Preis je Stueck.
const MASSE_EINHEIT = /^(g|kg|ml|l|liter|kiste)$/i;
const istStueckStamm = (a) => (a?.preisbasis ? a.preisbasis === "stueck" : !MASSE_EINHEIT.test(String(a?.unit ?? "").trim()));

/** Listenzeile auf die Rechenart des Stammartikels bringen; null, wenn das nicht sauber geht. */
export function angleichen(z, alt) {
  if (!alt) return z;
  const stammStueck = istStueckStamm(alt);
  if (stammStueck === (z.basis === "stk")) return z;
  if (!stammStueck && z.basis === "stk") {
    // Stamm nach Gewicht, Liste nach Stueck: ueber das Nettogewicht (Falafel)
    if (!(z.nettoGramm > 0)) return null;
    return { ...z, basis: "g", menge: z.nettoGramm, jeBasis: z.preis / z.nettoGramm };
  }
  // Stamm nach Stueck, Liste nach Gewicht: ueber das gepflegte Stueckgewicht ...
  const g = +alt.gewicht_je_stueck_g || 0;
  if (g > 0) {
    const stueck = z.menge / g;
    return { ...z, basis: "stk", menge: stueck, jeBasis: z.preis / stueck, grammJeStueck: g };
  }
  // ... oder, wo der Stamm ein Stueck = eine Packung meint (Inventurartikel "1 Stück",
  // "Wildheidelbeeren TK 2,5kg"): Stueck = Einzeleinheit der Liste.
  const groesse = +alt.package_size || 0;
  if (groesse === 1 || groesse === z.inhalt) {
    return { ...z, basis: "stk", menge: z.inhalt, jeBasis: z.preis / z.inhalt, grammJeStueck: z.rm * 1000 };
  }
  return null;
}

/** Stammartikel auf das Liefergebinde der Liste setzen. */
export function artikelAusTg(alt, z, stempel, quelle) {
  const neu = { ...(alt || {}) };
  neu.article_number = z.artNr;
  neu.lieferant = "Transgourmet";
  neu.package_price = +z.preis.toFixed(4);
  neu.package_size = +z.menge.toFixed(4);
  delete neu.packungen_je_gebinde; // Packung = Liefergebinde, kein Faktor mehr noetig
  if (z.basis === "stk") {
    neu.unit = "Stück";
    neu.preisbasis = "stueck";
    neu.net_price_per_unit = +z.jeBasis.toFixed(6);
    const g = +neu.gewicht_je_stueck_g > 0 ? +neu.gewicht_je_stueck_g : z.grammJeStueck;
    if (g > 0 && !(+neu.gewicht_je_stueck_g > 0)) neu.gewicht_je_stueck_g = g;
    // Grammpreis nur mit Stueckgewicht sinnvoll; ohne bleibt die Altlast "Gramm = Stueck"
    neu.price_per_gram_ml = +(g > 0 ? z.jeBasis / g : z.jeBasis).toFixed(10);
  } else {
    neu.unit = z.basis;
    if (neu.preisbasis === "stueck") delete neu.preisbasis;
    neu.price_per_gram_ml = +z.jeBasis.toFixed(10);
    neu.net_weight = z.menge;
  }
  neu.date_last_checked = stempel;
  neu.preis_quelle = quelle;
  return neu;
}

export const TG_SPRUNG = 2; // Faktor beim Preis je kg/l/Stueck, ab dem der Nutzer entscheidet

/**
 * @param rows       geparste Zeilen der reparierten Liste
 * @param priceList  { key: Artikel }
 * @returns { patches, geaendert, unveraendert, spruenge: [{key, artikel, alt, neu, faktor, zeile}],
 *            neu: [{ zeile, artikel }], ohnePreis: [zeile], veraltet: [artikel], stand }
 */
export function verarbeiteTgErweitert({ rows = [], priceList = {}, heute = new Date(), gruppeVorschlag = null }) {
  const stempel = `${heute.toISOString().slice(0, 10)} 00:00:00`;
  const jeNummer = {};
  for (const [key, a] of Object.entries(priceList)) {
    if (lieferantVon(a) !== "Transgourmet") continue;
    const nr = abgleichNummer(a.article_number);
    if (nr && !/^z\d+$/.test(nr)) jeNummer[nr] = key;
  }
  // Doppelte Zeilen (gleiche Nummer) nur einmal
  const gesehen = new Set();
  const zeilen = rows.map(tgZeile).filter((z) => z.artNr && z.name && !gesehen.has(z.artNr) && gesehen.add(z.artNr));
  const stand = zeilen.find((z) => z.gueltigAb)?.gueltigAb || heute.toLocaleDateString("de-DE");
  const quelle = `Transgourmet-Liste ${stand}`;
  const patches = {}, spruenge = [], neu = [], ohnePreis = [];
  const nummern = new Set();
  let geaendert = 0, unveraendert = 0;

  for (let z of zeilen) {
    const nr = abgleichNummer(z.artNr);
    nummern.add(nr);
    if (!(z.jeBasis > 0)) { ohnePreis.push(z); continue; }
    const key = jeNummer[nr];
    if (!key) {
      const gruppe = gruppeAusKatalog(z.katalog, z.name, gruppeVorschlag);
      const artikel = artikelAusTg({ ingredient_name: z.name, manuell: true, einkaufsgruppe: gruppe ?? undefined,
        ...(NONFOOD.has(gruppe) ? { nonfood: true } : {}) }, z, stempel, quelle);
      if (!gruppe) delete artikel.einkaufsgruppe;
      neu.push({ zeile: z, artikel });
      continue;
    }
    const alt = priceList[key];
    // Der Stamm bestimmt, ob nach Gewicht oder Stueck gerechnet wird - Rezeptzeilen haengen daran.
    const zz = angleichen(z, alt);
    if (!zz) {
      spruenge.push({ key, artikel: null, alt, vorher: null, nachher: z.jeBasis, faktor: null, zeile: z,
        grund: `Liste rechnet je ${z.basis === "stk" ? "Stück" : z.basis}, der Stamm anders – bitte Packung von Hand pflegen` });
      continue;
    }
    const vorher = alterPreisJeBasis(alt, zz.basis);
    const artikel = artikelAusTg(alt, zz, stempel, quelle);
    z = zz;
    const faktor = vorher ? z.jeBasis / vorher : null;
    if ((faktor && (faktor >= TG_SPRUNG || faktor <= 1 / TG_SPRUNG)) || z.widerspruch) {
      spruenge.push({ key, artikel, alt, vorher, nachher: z.jeBasis, faktor, zeile: z, grund: z.widerspruch });
      continue;
    }
    if (faktor && Math.abs(faktor - 1) < 0.0005 && +alt.package_price === artikel.package_price && +alt.package_size === artikel.package_size) unveraendert++;
    else geaendert++;
    patches[key] = artikel;
  }

  const veraltet = Object.values(priceList).filter((a) => {
    if (lieferantVon(a) !== "Transgourmet") return false;
    const nr = abgleichNummer(a.article_number);
    return nr && !/^z\d+$/.test(nr) && !nummern.has(nr);
  });
  return { patches, geaendert, unveraendert, spruenge, neu, ohnePreis, veraltet, stand };
}
