import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { repariereTgCsv, istTgErweitert, tgZeile, stueckAusName, verarbeiteTgErweitert, angleichen, gruppeAusKatalog } from "./tgimport.js";

// Zwei Zeilen im Originalformat des Shop-Exports (mit den fehlenden Anfuehrungszeichen)
const KOPF = 'Position OS,Artikelnr,Artikeltext1,Artikeltext2,Anbruch,Inhalt,Einheit,Preis pro Einzeleinheit,Preis Herkunft,Preis gültig von,Preis gültig bis,Rezeptmenge,Einheit Rezeptmenge,Nettogewicht in KG,MwSt in %,Warengruppe,Sortimentsgruppe,Lieferant,Klasse Zustellung,Eigenmarke,Kernsortiment,Vorbestellartikel,Katalogebene 1,Katalogebene 2,Katalogebene 3,Katalogebene 4,Produktfoto-Link,Liefereinheit,Preis pro Gebinde';
const KOKOS = '"33","492430","H-Kokosnussdr.Barista Alp.1l","vegan,Barista Kokosnussdrink","","8,000","PG","17,200","v","26.09.2026","","1,000","LT,"1,023","19.0","2063","","Transgourmet","","0","1","0","Milchprodukte/ Eiprodukte","Milch","Milchalternativen","","https://media.transgourmet.de/redirectToImage/492430,"KA","17,200",';
const LACHS = '"7","199713","B153_Pulled Lachs gebr.TK 500g","","","18,000","SL","173,880","v","26.09.2026","","0,500","KG,"0,500","7.0","2100","","Transgourmet","","0","1","0","Tiefkühlprodukte","Fisch","","","https://media.transgourmet.de/redirectToImage/199713,"KA","173,880",';
const DECKEL = '"9","555","B153_Flachdeckel 90mm weiss 1000St","","","1,000","KA","46,700","v","26.09.2026","","1,000","ST,"3,100","19.0","9","","Transgourmet","","0","1","0","HoReCa - Non Food/GKT","","","","https://x/555,"KA","46,700",';
const parse = (zeilen) => Papa.parse(repariereTgCsv([KOPF, ...zeilen].join("\n")), { header: true, skipEmptyLines: true });

describe("repariereTgCsv", () => {
  it("setzt die fehlenden Anfuehrungszeichen, alle Spalten stehen wieder richtig", () => {
    const r = parse([KOKOS]);
    expect(istTgErweitert(r.meta.fields)).toBe(true);
    expect(r.data[0]["Einheit Rezeptmenge"]).toBe("LT");
    expect(r.data[0]["Nettogewicht in KG"]).toBe("1,023");
    expect(r.data[0]["Liefereinheit"]).toBe("KA");
    expect(r.data[0]["Preis pro Gebinde"]).toBe("17,200");
  });
});

describe("tgZeile", () => {
  it("rechnet den Preis je Basiseinheit aus Karton, Inhalt und Rezeptmenge", () => {
    const [k, l] = parse([KOKOS, LACHS]).data.map(tgZeile);
    expect(k).toMatchObject({ basis: "ml", menge: 8000 });
    expect(k.jeBasis * 1000).toBeCloseTo(2.15, 4);         // 17,20 / 8 l
    expect(l.jeBasis * 1000).toBeCloseTo(19.32, 2);        // 173,88 / 9 kg
  });
  it("nimmt bei Kartonware die Stueckzahl aus der Bezeichnung", () => {
    expect(stueckAusName("B153_Flachdeckel 90mm weiss 1000St")).toBe(1000);
    expect(stueckAusName("B153_Messer Immergrün 40x25St")).toBe(1000);
    expect(stueckAusName("Salzbeutel TGQ 2000x1g")).toBe(2000);
    expect(stueckAusName("Ananasstücke TK 2,5kg")).toBeNull();
    expect(tgZeile(parse([DECKEL]).data[0]).jeBasis).toBeCloseTo(0.0467, 6);
  });
});

describe("verarbeiteTgErweitert", () => {
  const rows = parse([KOKOS, LACHS, KOKOS]).data;
  const HEUTE = new Date("2026-10-02T08:00:00Z");

  it("setzt die Stamm-Packung auf das Liefergebinde - kein Scheinsprung bei Einzelpackung im Stamm", () => {
    const pl = { "kokosdrink barista 1l": { ingredient_name: "Kokosdrink Barista 1l", article_number: "492430", unit: "l", package_size: 1, package_price: 2.10, price_per_gram_ml: 0.0021 } };
    const e = verarbeiteTgErweitert({ rows, priceList: pl, heute: HEUTE });
    expect(e.spruenge).toHaveLength(0);
    expect(e.patches["kokosdrink barista 1l"]).toMatchObject({ unit: "ml", package_size: 8000, package_price: 17.2, date_last_checked: "2026-10-02 00:00:00" });
    expect(e.patches["kokosdrink barista 1l"].price_per_gram_ml).toBeCloseTo(0.00215, 8);
  });

  it("meldet echte Spruenge beim Kilopreis (Kartonpreis stand auf 1 l)", () => {
    const pl = { k: { ingredient_name: "Kokos", article_number: "492430", unit: "Liter", package_size: 1, package_price: 17.2, price_per_gram_ml: 0.0172 } };
    const e = verarbeiteTgErweitert({ rows, priceList: pl, heute: HEUTE });
    expect(e.spruenge).toHaveLength(1);
    expect(e.spruenge[0].faktor).toBeCloseTo(0.125, 3);
    expect(e.patches).toEqual({});
  });

  it("legt unbekannte Nummern als neue Artikel mit Warengruppe an, doppelte Zeilen nur einmal", () => {
    const e = verarbeiteTgErweitert({ rows, priceList: {}, heute: HEUTE });
    expect(e.neu.map(n => n.artikel.ingredient_name)).toEqual(["H-Kokosnussdr.Barista Alp.1l", "B153_Pulled Lachs gebr.TK 500g"]);
    expect(e.neu[1].artikel).toMatchObject({ einkaufsgruppe: "Tiefkühl", unit: "g", package_size: 9000 });
  });

  it("Stamm-Stueckartikel (1 Stück = 1 Packung) bleibt Stueckware", () => {
    const z = tgZeile(parse([LACHS]).data[0]);
    const n = angleichen(z, { unit: "Stück", package_size: 1 });
    expect(n).toMatchObject({ basis: "stk", menge: 18, grammJeStueck: 500 });
    expect(n.jeBasis).toBeCloseTo(9.66, 2);
    expect(angleichen(z, { unit: "Stück", package_size: 14 })).toBeNull(); // unklar -> von Hand
  });
});

describe("gruppeAusKatalog", () => {
  it("Katalog zuerst, bei Frisch-Convenience entscheidet der Name", () => {
    expect(gruppeAusKatalog("Tiefkühlprodukte", "x")).toBe("Tiefkühl");
    expect(gruppeAusKatalog("Frisch-Convenience", "Hummus", () => "Saucen & Dressings")).toBe("Saucen & Dressings");
    expect(gruppeAusKatalog("Frisch-Convenience", "Pulled Beef", () => "Proteine")).toBe("Proteine");
  });
});

import { mengeAusName } from "./tgimport.js";
describe("Widerspruch Bezeichnung <-> Liste", () => {
  it("liest Mengen aus der Bezeichnung", () => {
    expect(mengeAusName("Hä.br.Geschnet.gebr.Vos.TK10kg")).toBe(10000);
    expect(mengeAusName("Pull.Beef Bar.Halal TK 12x500g")).toBe(6000);
    expect(mengeAusName("Jalapeno grün Schb.Adr.3,1l")).toBe(3100);
  });
  it("legt einen Artikel vor, wenn die Bezeichnung 10 kg nennt und die Liste mit 2,5 kg rechnet", () => {
    const HAE = '"8","995825","Hä.br.Geschnet.gebr.Vos.TK10kg","","","1,000","KA","72,890","v","26.09.2026","","2,500","KG,"2,500","7.0","2100","","Transgourmet","","0","1","0","Tiefkühlprodukte","","","","https://x/995825,"KA","72,890",';
    const rows = parse([HAE]).data;
    const pl = { h: { ingredient_name: "TK Hähnchengeschnetzeltes", article_number: "995825", unit: "g", package_size: 10000, package_price: 71.6, price_per_gram_ml: 0.00716 } };
    const e = verarbeiteTgErweitert({ rows, priceList: pl });
    expect(e.patches).toEqual({});
    expect(e.spruenge[0].grund).toContain("10 kg");
  });
});
