import { describe, it, expect } from "vitest";
import inventurJson from "./data/inventur.json";
import { bunzlUebernahme, stempelAusStand } from "./bunzlstamm.js";
import { verarbeitePreisimport } from "./preisimport.js";

const inventur = (artikel, gruppe = "Becher & Deckel") => ({
  stand: "05.2026",
  lieferanten: [
    { name: "BUNZL", untergruppen: [{ name: gruppe, artikel }] },
    { name: "TRANSGOURMET", untergruppen: [{ name: "Kühlwaren", artikel: [
      { artikelnr: "73432", bezeichnung: "Kokosmilch 1L", einheit: "Liter", ve: "PG", preis_ve: null, stk_pro_ve: null, preis_stk: 3.15 },
    ] }] },
  ],
});
const BECHER = { artikelnr: "920821", bezeichnung: "immergrün Trinkbecher 500 ml", einheit: "Stk.", ve: "KA", preis_ve: 68, stk_pro_ve: 1000, preis_stk: 0.068 };
const SERVIETTEN = { artikelnr: "68352", bezeichnung: "Spenderservietten natur Trk", einheit: "Stk.", ve: "KA", preis_ve: 82.21, stk_pro_ve: 9000, preis_stk: 0.00913 };
const REINIGER = { artikelnr: "4711", bezeichnung: "Techline K1 UnivSpülreiniger", einheit: "Kanister", ve: "KN", preis_ve: 27.32, stk_pro_ve: null, preis_stk: 27.32 };

describe("bunzlUebernahme", () => {
  it("legt neue BUNZL-Artikel als Stueckware mit Kartonpreis und Listenstempel an", () => {
    const r = bunzlUebernahme(inventur([BECHER]), {});
    expect(r).toMatchObject({ neu: 1, verknuepft: 0, vorhanden: 0, gesamt: 1 });
    expect(r.patches["immergrün trinkbecher 500 ml"]).toMatchObject({
      ingredient_name: "immergrün Trinkbecher 500 ml", article_number: "920821", lieferant: "BUNZL", nonfood: true,
      warengruppe: "Becher & Deckel", unit: "Stück", preisbasis: "stueck", package_size: 1000, package_price: 68,
      net_price_per_unit: 0.068, date_last_checked: "2026-05-01 00:00:00",
    });
  });

  it("Artikel ohne Gebinde (Kanister): eine Packung = ein Stueck", () => {
    const r = bunzlUebernahme(inventur([REINIGER], "Reinigung"), {});
    expect(r.patches["techline k1 univspülreiniger"]).toMatchObject({ package_size: 1, package_price: 27.32, warengruppe: "Reinigung" });
  });

  it("verknuepft handgepflegte 'Bunzl 68352'-Eintraege statt sie doppelt anzulegen - Preis bleibt", () => {
    const alt = { ingredient_name: "Papierservietten weiss", article_number: "Bunzl 68352", unit: "CO", package_size: 9000, package_price: 77.55 };
    const r = bunzlUebernahme(inventur([SERVIETTEN]), { "papierservietten weiss": alt });
    expect(r).toMatchObject({ neu: 0, verknuepft: 1 });
    // Nummer bleibt "Bunzl 68352": der Zutatenstamm verknuepft ueber sie
    expect(r.patches["papierservietten weiss"]).toEqual({ ...alt, lieferant: "BUNZL", nonfood: true, warengruppe: "Becher & Deckel" });
  });

  it("ist wiederholbar: beim zweiten Mal gibt es nichts mehr zu tun", () => {
    const erst = bunzlUebernahme(inventur([BECHER, SERVIETTEN]), {});
    const zweit = bunzlUebernahme(inventur([BECHER, SERVIETTEN]), erst.patches);
    expect(zweit).toMatchObject({ neu: 0, verknuepft: 0, vorhanden: 2 });
    expect(zweit.patches).toEqual({});
  });

  it("vergebener Name eines anderen Artikels bekommt den Zusatz (BUNZL)", () => {
    const tg = { ingredient_name: "immergrün Trinkbecher 500 ml", article_number: "918333", package_price: 115.22 };
    const r = bunzlUebernahme(inventur([BECHER]), { "immergrün trinkbecher 500 ml": tg });
    expect(r.patches["immergrün trinkbecher 500 ml (bunzl)"].ingredient_name).toBe("immergrün Trinkbecher 500 ml (BUNZL)");
    expect(r.patches["immergrün trinkbecher 500 ml"]).toBeUndefined();
  });

  it("uebernimmt aus der echten Inventurliste alle 67 BUNZL-Artikel, keinen von Transgourmet", () => {
    const r = bunzlUebernahme(inventurJson, {});
    expect(r.gesamt).toBe(67);
    expect(r.neu).toBe(67);
    expect(Object.values(r.patches).every(a => a.lieferant === "BUNZL" && a.package_price > 0)).toBe(true);
  });

  it("stempelt mit dem Stand der Liste", () => {
    expect(stempelAusStand("05.2026")).toBe("2026-05-01 00:00:00");
    expect(stempelAusStand("")).toBeNull();
  });
});

describe("Preisimport mit Lieferant", () => {
  const stamm = () => {
    const { patches } = bunzlUebernahme(inventur([BECHER]), {});
    return {
      ...patches,
      rotkohl: { ingredient_name: "Rotkohl", article_number: "810035.0", unit: "g", package_size: 1500, package_price: 6.38, price_per_gram_ml: 0.00425 },
    };
  };
  const HEUTE = new Date("2026-10-05T08:00:00Z");

  it("BUNZL-Liste aktualisiert BUNZL-Artikel ueber die Nummer", () => {
    const r = verarbeitePreisimport({ zeilen: [{ name: "Becher", preis: 71.4, artNr: "920821" }], priceList: stamm(), heute: HEUTE, lieferant: "BUNZL" });
    const neu = r.patches["immergrün trinkbecher 500 ml"];
    expect(neu.package_price).toBeCloseTo(71.4, 6);
    expect(neu.net_price_per_unit).toBeCloseTo(0.0714, 6);
    expect(neu.date_last_checked).toBe("2026-10-05 00:00:00");
    expect(r.veraltet).toEqual([]); // Rotkohl ist Transgourmet - gehoert nicht auf die BUNZL-Nachpflegeliste
  });

  it("TG-Liste meldet BUNZL-Artikel nicht als veraltet und matcht sie nicht", () => {
    const r = verarbeitePreisimport({ zeilen: [{ name: "", preis: 6.99, artNr: "810035" }, { name: "", preis: 1, artNr: "920821" }], priceList: stamm(), heute: HEUTE });
    expect(Object.keys(r.patches)).toEqual(["rotkohl"]);
    expect(r.ohneMatch).toHaveLength(1);
    expect(r.veraltet).toEqual([]);
  });

  it("handgepflegte 'Bunzl 68352'-Nummer passt zur BUNZL-Liste mit '68352'", () => {
    const liste = { servietten: { ingredient_name: "Papierservietten weiss", article_number: "Bunzl 68352", unit: "CO", package_size: 9000, package_price: 77.55 } };
    const r = verarbeitePreisimport({ zeilen: [{ name: "", preis: 82.21, artNr: "68352" }], priceList: liste, heute: HEUTE, lieferant: "BUNZL" });
    expect(r.patches.servietten.package_price).toBeCloseTo(82.21, 6);
  });
});
