// Artikel der Inventurliste im CALKU-Artikelstamm (Entscheidungen Mark Twiehoff, 26.09.2026:
// erst BUNZL, dann auch die Transgourmet-Artikel, die der Stamm noch nicht fuehrt).
//
// Die Inventur-App IG-Inventur liest ihre Preise live aus diesem Stamm. Was hier fehlt,
// bleibt dort auf dem Stand der Inventurliste stehen. Danach aktualisiert der Preisimport
// die Artikel ueber die Nummer - Transgourmet woechentlich, BUNZL mit dessen Preisliste.
//
// Quelle ist die Inventurliste (src/data/inventur.json): Nummer, Bezeichnung, Einheit,
// Gebinde (Stueck je VE), Preis je VE.
//
// Regeln:
//   - Gleiche Nummer beim gleichen Lieferanten schon im Stamm: nichts tun. Einzige Ausnahme
//     sind handgepflegte BUNZL-Eintraege ("Bunzl 68352"): Lieferant/Non-Food nachtragen.
//     Nummer, Preis und Name bleiben - Zutatenstamm und Rezepturen rechnen unveraendert.
//   - Gleicher Kernname wie ein Stammartikel (Groessen, "TK", "frisch", "B153_" weg):
//     NICHT automatisch anlegen - das waere eine Dublette - sondern zum Pruefen melden.
//     Hat der Stammartikel keine echte Nummer (Z-Platzhalter), kann man sie nachtragen;
//     sonst oder wenn es doch ein anderer Artikel ist: als eigenen Artikel anlegen.
//     Kein automatisches Verknuepfen - die Tomatenwuerfel-Lehre gilt auch hier: Stimmt die
//     Packung nicht, zieht der naechste Import falsche Preise in die Rezepturen.
//   - Sonst neu anlegen: kg und Liter als Masseartikel, alles andere als Stueckware.
//     Pruefstempel = Stand der Inventurliste (der Preis ist von damals, nicht von heute).
//
// Pur und ohne React - Tests in inventurstamm.test.js.
import { abgleichNummer, lieferantVon, normalisiereLieferant } from "./preisimport.js";

// Transgourmet-Warengruppen der Inventurliste, die keine Lebensmittel sind
const TG_NONFOOD = new Set(["Reinigungsmittel", "Diverses", "Besteck und Verpackung"]);

/** Stand "05.2026" -> Pruefstempel "2026-05-01 00:00:00" (Format wie der Preisimport). */
export function stempelAusStand(stand) {
  const m = String(stand ?? "").match(/^(\d{1,2})\.(\d{4})$/);
  return m ? `${m[2]}-${m[1].padStart(2, "0")}-01 00:00:00` : null;
}

/** Hat der Artikel eine echte Lieferantennummer (nicht leer, kein Z-Platzhalter, kein Link)? */
export function hatEchteNummer(artikel) {
  const nr = abgleichNummer(artikel?.article_number);
  return Boolean(nr) && !/^z\d+$/.test(nr) && !/^https?:/.test(nr);
}

/** "Traubenkernöl 1L" -> "traubenkernöl", "B153_Avocadowürfel TK 1kg" -> "avocadowürfel". */
export function kernname(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^b153[_\s]*/, "")
    .replace(/\d+([.,]\d+)?\s*(kg|g|l|ml|st|stk|x)?\b/g, " ")
    .replace(/\b(tk|frisch|bio|vegan|gastro|ca)\b/g, " ")
    .replace(/[^a-zäöüß]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const runde = (n, stellen) => Math.round(n * 10 ** stellen) / 10 ** stellen;

// Ein Artikel der Inventurliste -> CALKU-Stammartikel (ohne Namenskonflikt-Pruefung).
export function stammArtikel(roh, { lieferant, warengruppe, stand }) {
  const inhalt = Number(roh.stk_pro_ve) > 1 ? Number(roh.stk_pro_ve) : 1;
  const stueck = Number(roh.preis_stk) || 0;
  const packung = Number(roh.preis_ve) > 0 ? Number(roh.preis_ve) : stueck * inhalt;
  if (!(packung > 0)) return null;
  const einheit = String(roh.einheit ?? "").trim().toLowerCase();
  const masse = einheit === "kg" ? { unit: "kg", preisbasis: "gramm" }
    : einheit === "liter" || einheit === "l" ? { unit: "l", preisbasis: "ml100" }
      : null;
  return {
    ingredient_name: String(roh.bezeichnung ?? "").trim(),
    article_number: String(roh.artikelnr ?? "").trim(),
    lieferant,
    nonfood: lieferant === "BUNZL" || TG_NONFOOD.has(warengruppe),
    inventurartikel: true,
    warengruppe,
    ...(masse
      ? { ...masse, package_size: inhalt, price_per_gram_ml: runde(packung / (inhalt * 1000), 10) }
      : { unit: "Stück", preisbasis: "stueck", package_size: inhalt, net_price_per_unit: runde(packung / inhalt, 6) }),
    package_price: runde(packung, 4),
    date_last_checked: stempelAusStand(stand),
    quelle: `Inventurliste ${stand}`,
    manuell: true,
  };
}

/**
 * @param inventur   Inventurliste { stand, lieferanten: [{ name, untergruppen: [{ name, artikel }] }] }
 * @param priceList  { key(lowercase ingredient_name): Artikel }
 * @param lieferant  "BUNZL" | "Transgourmet"
 * @returns { patches, neu, verknuepft, vorhanden, gesamt, pruefen: [...] }
 *   patches  = was "Alle uebernehmen" schreibt (neue Artikel, BUNZL-Verknuepfungen)
 *   pruefen  = moegliche Dubletten, je mit fertigem Patch fuer beide Entscheidungen
 */
export function stammUebernahme(inventur, priceList = {}, lieferant = "BUNZL") {
  const wer = normalisiereLieferant(lieferant);
  const jeNummer = new Map();
  const jeKern = new Map();
  for (const [key, a] of Object.entries(priceList)) {
    const nr = abgleichNummer(a.article_number);
    if (nr && lieferantVon(a) === wer) jeNummer.set(nr, key);
    const kern = kernname(a.ingredient_name);
    if (kern && !jeKern.has(kern)) jeKern.set(kern, key);
  }
  const vergeben = new Set(Object.keys(priceList));

  const patches = {};
  const pruefen = [];
  let neu = 0;
  let verknuepft = 0;
  let vorhanden = 0;
  let gesamt = 0;
  for (const L of inventur?.lieferanten ?? []) {
    if (normalisiereLieferant(L.name) !== wer) continue;
    for (const g of L.untergruppen ?? []) {
      for (const roh of g.artikel ?? []) {
        gesamt++;
        const nummer = String(roh.artikelnr ?? "").trim();
        const vorhandenKey = jeNummer.get(abgleichNummer(nummer));
        if (vorhandenKey) {
          const a = priceList[vorhandenKey] ?? patches[vorhandenKey];
          if (wer === "BUNZL" && !(a.lieferant === "BUNZL" && a.nonfood)) {
            patches[vorhandenKey] = { ...a, lieferant: "BUNZL", nonfood: true, warengruppe: a.warengruppe ?? g.name };
            verknuepft++;
          } else {
            vorhanden++;
          }
          continue;
        }
        const artikel = stammArtikel(roh, { lieferant: wer, warengruppe: g.name, stand: inventur.stand });
        if (!nummer || !artikel?.ingredient_name) continue;
        let name = artikel.ingredient_name;
        if (vergeben.has(name.toLowerCase())) name = wer === "BUNZL" ? `${name} (BUNZL)` : `${name} (Art. ${nummer})`;
        const neuerArtikel = { key: name.toLowerCase(), artikel: { ...artikel, ingredient_name: name } };

        const kernKey = jeKern.get(kernname(roh.bezeichnung));
        if (kernKey) {
          const calcu = priceList[kernKey] ?? patches[kernKey];
          const platzhalter = !hatEchteNummer(calcu);
          pruefen.push({
            nummer, bezeichnung: artikel.ingredient_name, warengruppe: g.name, liste: artikel,
            calcuKey: kernKey, calcu, platzhalter, neuerArtikel,
            verknuepfung: platzhalter ? { key: kernKey, artikel: { ...calcu, article_number: nummer, lieferant: wer } } : null,
          });
          continue;
        }
        patches[neuerArtikel.key] = neuerArtikel.artikel;
        vergeben.add(neuerArtikel.key);
        jeNummer.set(abgleichNummer(nummer), neuerArtikel.key);
        neu++;
      }
    }
  }
  return { patches, neu, verknuepft, vorhanden, gesamt, pruefen };
}
