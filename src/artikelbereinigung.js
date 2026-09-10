// ============================================================
//  Artikelstamm bereinigen (E11.8) — Gebinde-Semantik konsistent, mit Bericht
// ============================================================
// Befund B6 (10.09.2026): package_size steht mal in Gramm unter unit „kg" (Erdbeeren kg/500,
// Salatmischung kg/1000), mal in Kilogramm (Garkartoffel kg/4, Sorbet kg/3,5); unit heisst
// „Liter", „l" oder „ml"; net_weight ist bei 41 Artikeln der Platzhalter 1000; 7 Artikel haben
// keine Einheit. Verlaesslich ist nur der Preis je Gramm - so rechnet artikelpreis.js seit dem
// 06.09.2026 -, also gilt: implizierte Gramm = package_price / price_per_gram_ml.
//
// Regel: Weicht das nominelle Gebinde (package_size x Einheit) um genau den Faktor 1000 vom
// Preis ab, ist das Einheiten-Etikett falsch (Gramm unter „kg") -> Patch. Weicht es anders ab
// (Jasminreis: Faktor 20, Frappepulver: 12 %), stimmt eher ein Preis nicht -> nur Bericht,
// „von Hand pruefen". Preise werden hier NIE angefasst.
//
// Pur und ohne React - Tests in artikelbereinigung.test.js.
import { STUECK_EINHEITEN } from "./artikelpreis.js";

const MASSE = { g: 1, kg: 1000, ml: 1, l: 1000, liter: 1000 };
const FLUESSIG = new Set(["ml", "l", "liter"]);
const TOLERANZ = 0.05;

export function implizierteGramm(a) {
  const preis = +(a?.package_price) || 0;
  const proG = +(a?.price_per_gram_ml) || 0;
  return preis > 0 && proG > 0 ? Math.round(preis / proG) : null;
}

export function nominelleGramm(a) {
  const groesse = +(a?.package_size) || 0;
  const einheit = String(a?.unit || "").toLowerCase();
  return groesse > 0 && einheit in MASSE ? groesse * MASSE[einheit] : null;
}

const naheBei = (a, b) => b > 0 && Math.abs(a - b) / b <= TOLERANZ;

// Ein Artikel -> { patch, hinweise, pruefen, impl, nominal }. patch = Felder, die sich sicher
// setzen lassen; pruefen = true, wenn jemand hinschauen muss.
export function artikelBefund(a) {
  const unit = String(a?.unit || "").toLowerCase();
  const impl = implizierteGramm(a);
  const nominal = nominelleGramm(a);
  const patch = {};
  const hinweise = [];
  let pruefen = false;

  if (STUECK_EINHEITEN.has(unit)) {
    if (!a.preisbasis) patch.preisbasis = "stueck";
    if (!(+a.gewicht_je_stueck_g > 0)) {
      hinweise.push("Stückartikel ohne gepflegtes Stückgewicht");
      pruefen = true;
    }
  } else if (!unit) {
    // Handelsware ohne Einheit (Cola, Vio, Fuze): eine Flasche = ein Stueck
    if (!a.preisbasis) patch.preisbasis = "stueck";
    hinweise.push("ohne Einheit — als Stückware (Flasche) angesetzt");
  } else if (unit in MASSE) {
    const fluessig = FLUESSIG.has(unit);
    if (unit === "liter") patch.unit = "l";
    if (!a.preisbasis) patch.preisbasis = fluessig ? "ml100" : "gramm";
    if (impl === null) {
      hinweise.push("Preis je Gramm fehlt — Gebinde nicht prüfbar");
      pruefen = true;
    } else if (nominal !== null && !naheBei(nominal, impl)) {
      const faktor = nominal / impl;
      if (naheBei(faktor, 1000) || naheBei(faktor, 0.001)) {
        // Etikett falsch: Gramm unter „kg" bzw. Milliliter unter „l"
        const neuUnit = fluessig ? (impl >= 1000 ? "l" : "ml") : (impl >= 1000 ? "kg" : "g");
        const neuSize = impl >= 1000 ? +(impl / 1000).toFixed(3) : impl;
        patch.unit = neuUnit;
        patch.package_size = neuSize;
        hinweise.push(`Gebinde ${a.package_size} ${a.unit} ≠ Preis (${impl} g) → ${neuSize} ${neuUnit}`);
      } else {
        hinweise.push(`Gebinde ${a.package_size} ${a.unit} ≠ Preis (${impl} g), Faktor ${faktor.toFixed(2)} — Preis oder Gebinde von Hand prüfen`);
        pruefen = true;
      }
    } else if (nominal === null) {
      hinweise.push("Packungsgröße fehlt");
      pruefen = true;
    }
    if (impl !== null && +a.net_weight > 0 && !naheBei(+a.net_weight, impl)) {
      patch.net_weight = impl;
      hinweise.push(`net_weight ${a.net_weight} → ${impl}`);
    }
  } else {
    hinweise.push(`Einheit „${a.unit}" unbekannt (Karton/CO) — nur als Non-Food sinnvoll`);
  }
  return { patch, hinweise, pruefen, impl, nominal };
}

// Ganze Preisliste -> { patches: {key: neuerArtikel}, bericht: [...], gesamt, geaendert, pruefen }
// Gepatchte Artikel bekommen den Pruefstempel wie beim Preisimport (date_last_checked bleibt,
// bereinigt_am neu), damit man sieht, was hier passiert ist.
export function bereinigeArtikel(priceList = {}, heute = new Date()) {
  const tag = heute.toISOString().slice(0, 10);
  const patches = {};
  const bericht = [];
  let pruefen = 0;
  const eintraege = Object.entries(priceList ?? {}).sort(([, a], [, b]) => String(a.ingredient_name ?? "").localeCompare(String(b.ingredient_name ?? ""), "de"));
  for (const [key, a] of eintraege) {
    const b = artikelBefund(a);
    if (Object.keys(b.patch).length) patches[key] = { ...a, ...b.patch, bereinigt_am: tag };
    if (b.pruefen) pruefen++;
    if (b.hinweise.length || Object.keys(b.patch).length) {
      bericht.push({ key, name: a.ingredient_name, hinweise: b.hinweise, patch: b.patch, pruefen: b.pruefen });
    }
  }
  return { patches, bericht, gesamt: eintraege.length, geaendert: Object.keys(patches).length, pruefen };
}
