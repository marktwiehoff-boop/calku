// Gebinde-Check: passt die Packung im CALKU-Stamm zum Gebinde der Lieferantenliste?
//
// Die TG-Preisliste fuehrt den Preis je Verkaufseinheit (Karton, Kiste, Beutel), der Stamm
// oft die Einzelpackung, weil die Rezeptur so rechnet (Oreo: 1 Packung = 14 Kekse; TG: Karton
// mit 16 Packungen fuer 23,84 EUR). Bis 09/2026 schrieb der Import den Kartonpreis ungeteilt
// auf die Einzelpackung - der Cookie Monster kostete danach 1,70 EUR je Keks statt 0,11 EUR.
//
// Der Import teilt seitdem durch packungen_je_gebinde und haelt Spruenge an (preisimport.js).
// Hier finden wir mit der Inventurliste (Preis je VE, Stueck je VE) die Artikel, bei denen
//   - der Kartonpreis schon auf der Einzelpackung steht ("kartonpreis") -> Preis reparieren,
//   - die Packung kleiner ist als das Gebinde ("gebinde") -> Gebinde festlegen, bevor der
//     naechste Import falsch rechnet,
//   - die Packung im Stamm groesser ist als das Gebinde ("packung") -> von Hand pruefen.
// Artikel mit gesetztem packungen_je_gebinde sind entschieden und tauchen nicht mehr auf.
//
// Pur und ohne React - Tests in gebinde.test.js.
import { abgleichNummer, lieferantVon, normalisiereLieferant } from "./preisimport.js";

const STUECK = new Set(["stück", "stueck", "stk", "stk.", "st", "st.", "stck"]);
const istStueck = (a) => (a?.preisbasis ? a.preisbasis === "stueck" : STUECK.has(String(a?.unit ?? "").trim().toLowerCase()));

const MASSE = { g: 1, ml: 1, kg: 1000, l: 1000, liter: 1000 };

/** Inhalt eines Listen-Gebindes in g/ml aus der Bezeichnung: "4x875g" -> 3500,
 *  "Mandel-Drink 1L" bei 8 Stueck je VE -> 8000. null, wenn die Bezeichnung nichts hergibt. */
export function gebindeInGramm(roh) {
  const text = String(roh?.bezeichnung ?? "").toLowerCase().replace(/,/g, ".");
  const mal = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-zäöü])/);
  if (mal) return +mal[1] * +mal[2] * MASSE[mal[3]];
  const eins = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-zäöü])/);
  if (!eins) return null;
  const jeVe = Number(roh?.stk_pro_ve) > 1 ? Number(roh.stk_pro_ve) : 1;
  return +eins[1] * MASSE[eins[2]] * jeVe;
}

/** Packung im Stamm in g/ml, oder null bei Stueck/unbekannter Einheit. */
function stammInGramm(a) {
  const f = MASSE[String(a?.unit ?? "").trim().toLowerCase()];
  const groesse = Number(a?.package_size) || 0;
  return f && groesse > 0 ? groesse * f : null;
}

/** Ist die Stamm-Packung schon das ganze Listen-Gebinde? (Gabel: 1000 je Karton = 1000;
 *  Caesar Dressing: 3500 ml = 4 x 875 g) - dann ist ein Preis um den Kartonpreis richtig. */
function istGanzesGebinde(a, roh) {
  const jeVe = Number(roh?.stk_pro_ve) || 0;
  if (jeVe > 1 && Number(a?.package_size) === jeVe) return true;
  const stamm = stammInGramm(a), liste = gebindeInGramm(roh);
  if (stamm == null || liste == null) return false;
  // Altlast aus dem Excel-Erbe: "Liter 3500" meint 3500 ml (Chipotle Sauce IG)
  const kandidaten = [stamm, Number(a.package_size) || 0];
  return kandidaten.some(g => Math.abs(g - liste) / liste < 0.15);
}

/** Wie viele Stamm-Packungen stecken rechnerisch in einem Listen-Gebinde? */
export function packungenAusListe(artikel, roh) {
  const jeVe = Number(roh?.stk_pro_ve) || 0;
  if (!(jeVe > 1)) return null;
  const listeInStueck = STUECK.has(String(roh?.einheit ?? "").trim().toLowerCase());
  const groesse = Number(artikel?.package_size) || 0;
  // Wrap: Stamm 10 Stueck, Liste 50 Stueck je VE -> 5 Packungen
  if (listeInStueck && istStueck(artikel) && groesse > 1) {
    const p = jeVe / groesse;
    return Number.isInteger(p) ? p : null;
  }
  return jeVe;
}

/**
 * @param inventur  Inventurliste { lieferanten: [{ name, untergruppen: [{ artikel }] }] }
 * @param priceList { key: Artikel }
 * @returns [{ key, name, art, artikel, liste, faktor, vorschlag, neuerPreis }]
 */
export function gebindeBefunde(inventur, priceList = {}) {
  const liste = new Map(); // "Lieferant|nummer" -> Inventurartikel
  for (const L of inventur?.lieferanten ?? []) {
    const wer = normalisiereLieferant(L.name);
    for (const g of L.untergruppen ?? []) {
      for (const roh of g.artikel ?? []) {
        const nr = abgleichNummer(roh.artikelnr);
        if (nr) liste.set(`${wer}|${nr}`, roh);
      }
    }
  }

  const befunde = [];
  for (const [key, a] of Object.entries(priceList)) {
    if (!a || a.inventurartikel || +a.packungen_je_gebinde > 0) continue;
    const roh = liste.get(`${lieferantVon(a)}|${abgleichNummer(a.article_number)}`);
    const preisVe = Number(roh?.preis_ve) || 0;
    const alt = Number(a.package_price) || 0;
    if (!roh || !(preisVe > 0) || !(alt > 0)) continue;

    const faktor = preisVe / alt;
    const ausListe = packungenAusListe(a, roh);
    const basis = { key, name: a.ingredient_name, artikel: a, liste: roh, faktor };
    if (Math.abs(faktor - 1) <= 0.2 && ausListe >= 2 && !istGanzesGebinde(a, roh)) {
      befunde.push({ ...basis, art: "kartonpreis", vorschlag: ausListe, neuerPreis: +(preisVe / ausListe).toFixed(4) });
    } else if (faktor >= 1.8) {
      const passt = ausListe >= 2 && Math.abs(ausListe - faktor) / faktor < 0.5;
      befunde.push({ ...basis, art: "gebinde", vorschlag: passt ? ausListe : Math.round(faktor), neuerPreis: null });
    } else if (faktor <= 0.55) {
      befunde.push({ ...basis, art: "packung", vorschlag: null, neuerPreis: null });
    }
  }
  const reihenfolge = { kartonpreis: 0, gebinde: 1, packung: 2 };
  return befunde.sort((x, y) => reihenfolge[x.art] - reihenfolge[y.art] || String(x.name).localeCompare(String(y.name), "de"));
}
