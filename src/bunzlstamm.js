// BUNZL-Artikel im CALKU-Artikelstamm (Entscheidung Mark Twiehoff, 26.09.2026).
//
// Bisher fuehrte der Stamm nur Transgourmet-Ware (Rezeptzutaten) und ein paar von Hand
// gepflegte BUNZL-Verpackungen ("Bunzl 68352"). Die Inventur-App IG-Inventur liest ihre
// Preise live aus diesem Stamm - ohne BUNZL blieben Becher, Deckel, Salatschalen und
// Reinigung auf dem Stand der Inventurliste stehen.
//
// Quelle ist die Inventurliste (src/data/inventur.json, Lieferant BUNZL): Nummer,
// Bezeichnung, Gebinde (Stueck je Karton), Preis je Karton. Danach aktualisiert eine
// BUNZL-Preisliste die Artikel ueber den Import (Lieferant "BUNZL") wie bei Transgourmet.
//
// Regeln:
//   - Schon im Stamm (gleiche Nummer, Lieferant BUNZL - auch "Bunzl 68352"): nur verknuepfen
//     (Lieferant, Non-Food, Warengruppe). Nummer, Preis und Name bleiben - der Zutatenstamm
//     verknuepft ueber die Nummer, Rezepturen rechnen unveraendert.
//   - Neu: Stueckartikel mit Packungsgroesse = Stueck je Karton, Packungspreis = Karton-
//     preis, Pruefstempel = Stand der Inventurliste (NICHT heute - der Preis ist von damals).
//   - Name schon vergeben (anderer Artikel): Zusatz " (BUNZL)".
//
// Pur und ohne React - Tests in bunzlstamm.test.js.
import { abgleichNummer, lieferantVon } from "./preisimport.js";

/** Stand "05.2026" -> Pruefstempel "2026-05-01 00:00:00" (Format wie der Preisimport). */
export function stempelAusStand(stand) {
  const m = String(stand ?? "").match(/^(\d{1,2})\.(\d{4})$/);
  return m ? `${m[2]}-${m[1].padStart(2, "0")}-01 00:00:00` : null;
}

const runde = (n, stellen) => Math.round(n * 10 ** stellen) / 10 ** stellen;

/**
 * @param inventur   Inventurliste { stand, lieferanten: [{ name, untergruppen: [{ name, artikel }] }] }
 * @param priceList  { key(lowercase ingredient_name): Artikel }
 * @returns { patches: {key: Artikel}, neu, verknuepft, vorhanden, gesamt }
 */
export function bunzlUebernahme(inventur, priceList = {}) {
  const stempel = stempelAusStand(inventur?.stand);
  const jeNummer = new Map();
  for (const [key, a] of Object.entries(priceList)) {
    const nr = abgleichNummer(a.article_number);
    if (nr && lieferantVon(a) === "BUNZL") jeNummer.set(nr, key);
  }
  const vergeben = new Set(Object.keys(priceList));

  const patches = {};
  let neu = 0;
  let verknuepft = 0;
  let vorhanden = 0;
  let gesamt = 0;
  for (const L of inventur?.lieferanten ?? []) {
    if (!/^bunzl$/i.test(String(L.name).trim())) continue;
    for (const g of L.untergruppen ?? []) {
      for (const roh of g.artikel ?? []) {
        gesamt++;
        const nummer = String(roh.artikelnr ?? "").trim();
        const key = jeNummer.get(abgleichNummer(nummer));
        if (key) {
          const a = priceList[key] ?? patches[key];
          if (a.lieferant === "BUNZL" && a.nonfood) {
            vorhanden++;
          } else {
            patches[key] = { ...a, lieferant: "BUNZL", nonfood: true, warengruppe: a.warengruppe ?? g.name };
            verknuepft++;
          }
          continue;
        }
        let name = String(roh.bezeichnung ?? "").trim();
        if (!nummer || !name) continue;
        if (vergeben.has(name.toLowerCase())) name = `${name} (BUNZL)`;
        const inhalt = Number(roh.stk_pro_ve) > 1 ? Number(roh.stk_pro_ve) : 1;
        const stueck = Number(roh.preis_stk) || 0;
        const karton = Number(roh.preis_ve) > 0 ? Number(roh.preis_ve) : stueck * inhalt;
        if (!(karton > 0)) continue;
        const artikel = {
          ingredient_name: name,
          article_number: nummer,
          lieferant: "BUNZL",
          nonfood: true,
          warengruppe: g.name,
          unit: "Stück",
          preisbasis: "stueck",
          package_size: inhalt,
          package_price: runde(karton, 4),
          net_price_per_unit: runde(karton / inhalt, 6),
          date_last_checked: stempel,
          quelle: `Inventurliste ${inventur.stand}`,
          manuell: true,
        };
        const neuerKey = name.toLowerCase();
        patches[neuerKey] = artikel;
        vergeben.add(neuerKey);
        jeNummer.set(abgleichNummer(nummer), neuerKey);
        neu++;
      }
    }
  }
  return { patches, neu, verknuepft, vorhanden, gesamt };
}
