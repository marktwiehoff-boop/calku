import { describe, it, expect } from "vitest";
import inventurJson from "./data/inventur.json";
import rezeptdatenbank from "./data/rezeptdatenbank.json";
import { hatEchteNummer, kernname, stammUebernahme, stempelAusStand } from "./inventurstamm.js";
import { verarbeitePreisimport } from "./preisimport.js";

const liste = (bunzl = [], tg = [], gruppeBunzl = "Becher & Deckel", gruppeTg = "Kühlwaren") => ({
  stand: "05.2026",
  lieferanten: [
    { name: "BUNZL", untergruppen: [{ name: gruppeBunzl, artikel: bunzl }] },
    { name: "TRANSGOURMET", untergruppen: [{ name: gruppeTg, artikel: tg }] },
  ],
});
const BECHER = { artikelnr: "920821", bezeichnung: "immergrün Trinkbecher 500 ml", einheit: "Stk.", ve: "KA", preis_ve: 68, stk_pro_ve: 1000, preis_stk: 0.068 };
const SERVIETTEN = { artikelnr: "68352", bezeichnung: "Spenderservietten natur Trk", einheit: "Stk.", ve: "KA", preis_ve: 82.21, stk_pro_ve: 9000, preis_stk: 0.00913 };
const REINIGER = { artikelnr: "4711", bezeichnung: "Techline K1 UnivSpülreiniger", einheit: "Kanister", ve: "KN", preis_ve: 27.32, stk_pro_ve: null, preis_stk: 27.32 };
const BANANEN = { artikelnr: "12345", bezeichnung: "Bananen kg", einheit: "KG", ve: "KG", preis_ve: 1.9, stk_pro_ve: null, preis_stk: 1.9 };
const BARISTA = { artikelnr: "363296", bezeichnung: "Kokosdrink Barista 1l", einheit: "Liter", ve: "PG", preis_ve: 11.2, stk_pro_ve: 8, preis_stk: 1.4 };
const COLA = { artikelnr: "297094", bezeichnung: "Coca-Cola 0,33l (Glasflasche)", einheit: "Flasche", ve: "FL", preis_ve: 16.8, stk_pro_ve: 24, preis_stk: 0.7 };
const HANDSCHUHE = { artikelnr: "555", bezeichnung: "Einmalhandschuhe Strong Damen 100St", einheit: "Beutel", ve: "BT", preis_ve: null, stk_pro_ve: null, preis_stk: 4.2 };
const MINZE = { artikelnr: "13298331", bezeichnung: "Minze 100g", einheit: "Stk", ve: "ST", preis_ve: null, stk_pro_ve: null, preis_stk: 1.49 };
const ZITRONE = { artikelnr: "12500510", bezeichnung: "Zitrone", einheit: "Stk", ve: "ST", preis_ve: null, stk_pro_ve: null, preis_stk: 0.39 };

describe("Uebernahme BUNZL", () => {
  it("legt neue BUNZL-Artikel als Stueckware mit Kartonpreis und Listenstempel an", () => {
    const r = stammUebernahme(liste([BECHER]), {}, "BUNZL");
    expect(r).toMatchObject({ neu: 1, verknuepft: 0, vorhanden: 0, gesamt: 1, pruefen: [] });
    expect(r.patches["immergrün trinkbecher 500 ml"]).toMatchObject({
      ingredient_name: "immergrün Trinkbecher 500 ml", article_number: "920821", lieferant: "BUNZL", nonfood: true,
      inventurartikel: true, warengruppe: "Becher & Deckel", unit: "Stück", preisbasis: "stueck", package_size: 1000,
      package_price: 68, net_price_per_unit: 0.068, date_last_checked: "2026-05-01 00:00:00",
    });
  });

  it("Artikel ohne Gebinde (Kanister): eine Packung = ein Stueck", () => {
    const r = stammUebernahme(liste([REINIGER], [], "Reinigung"), {}, "BUNZL");
    expect(r.patches["techline k1 univspülreiniger"]).toMatchObject({ package_size: 1, package_price: 27.32, warengruppe: "Reinigung" });
  });

  it("verknuepft handgepflegte 'Bunzl 68352'-Eintraege - Nummer und Preis bleiben", () => {
    const alt = { ingredient_name: "Papierservietten weiss", article_number: "Bunzl 68352", unit: "CO", package_size: 9000, package_price: 77.55 };
    const r = stammUebernahme(liste([SERVIETTEN]), { "papierservietten weiss": alt }, "BUNZL");
    expect(r).toMatchObject({ neu: 0, verknuepft: 1 });
    expect(r.patches["papierservietten weiss"]).toEqual({ ...alt, lieferant: "BUNZL", nonfood: true, warengruppe: "Becher & Deckel" });
  });

  it("ist wiederholbar: beim zweiten Mal gibt es nichts mehr zu tun", () => {
    const erst = stammUebernahme(liste([BECHER, SERVIETTEN]), {}, "BUNZL");
    const zweit = stammUebernahme(liste([BECHER, SERVIETTEN]), erst.patches, "BUNZL");
    expect(zweit).toMatchObject({ neu: 0, verknuepft: 0, vorhanden: 2 });
    expect(zweit.patches).toEqual({});
  });

  it("uebernimmt aus der echten Inventurliste alle 67 BUNZL-Artikel, keinen von Transgourmet", () => {
    const r = stammUebernahme(inventurJson, {}, "BUNZL");
    expect(r.gesamt).toBe(67);
    expect(r.neu).toBe(67);
    expect(Object.values(r.patches).every(a => a.lieferant === "BUNZL" && a.package_price > 0)).toBe(true);
  });
});

describe("Uebernahme Transgourmet", () => {
  it("kg und Liter als Masseartikel, Getraenke als Stueckware je Kiste", () => {
    const r = stammUebernahme(liste([], [BANANEN, BARISTA, COLA]), {}, "Transgourmet");
    expect(r.neu).toBe(3);
    expect(r.patches["bananen kg"]).toMatchObject({ unit: "kg", preisbasis: "gramm", package_size: 1, package_price: 1.9, price_per_gram_ml: 0.0019, lieferant: "Transgourmet", nonfood: false });
    expect(r.patches["kokosdrink barista 1l"]).toMatchObject({ unit: "l", preisbasis: "ml100", package_size: 8, package_price: 11.2, price_per_gram_ml: 0.0014 });
    expect(r.patches["coca-cola 0,33l (glasflasche)"]).toMatchObject({ unit: "Stück", package_size: 24, package_price: 16.8, net_price_per_unit: 0.7 });
  });

  it("Reinigungsmittel, Diverses, Besteck und Verpackung sind Non-Food", () => {
    const r = stammUebernahme(liste([], [HANDSCHUHE], "", "Diverses"), {}, "Transgourmet");
    expect(r.patches["einmalhandschuhe strong damen 100st"]).toMatchObject({ nonfood: true, package_size: 1, package_price: 4.2 });
  });

  it("gleiche Nummer schon im Stamm: nichts tun (auch nicht an Preis oder Name)", () => {
    const stamm = { kokosdrink: { ingredient_name: "Kokosdrink", article_number: "363296.0", unit: "l", package_size: 1, package_price: 1.4 } };
    const r = stammUebernahme(liste([], [BARISTA]), stamm, "Transgourmet");
    expect(r).toMatchObject({ neu: 0, vorhanden: 1, verknuepft: 0 });
    expect(r.patches).toEqual({});
  });

  it("gleicher Kernname mit Z-Platzhalter: nicht anlegen, sondern pruefen - mit beiden Wegen", () => {
    const minze = { ingredient_name: "Minze", article_number: "Z009", unit: "kg", package_size: 0.1, package_price: 3.3 };
    const r = stammUebernahme(liste([], [MINZE]), { minze }, "Transgourmet");
    expect(r.neu).toBe(0);
    expect(r.patches).toEqual({});
    expect(r.pruefen).toHaveLength(1);
    const p = r.pruefen[0];
    expect(p).toMatchObject({ nummer: "13298331", calcuKey: "minze", platzhalter: true });
    expect(p.verknuepfung).toEqual({ key: "minze", artikel: { ...minze, article_number: "13298331", lieferant: "Transgourmet" } });
    expect(p.neuerArtikel.key).toBe("minze 100g");
  });

  it("gleicher Name mit anderer echter Nummer: nur als eigener Artikel moeglich, mit Nummer im Namen", () => {
    const zitrone = { ingredient_name: "Zitrone", article_number: "12502510.0", unit: "Stück", package_size: 1, package_price: 0.42 };
    const r = stammUebernahme(liste([], [ZITRONE]), { zitrone }, "Transgourmet");
    const p = r.pruefen[0];
    expect(p.platzhalter).toBe(false);
    expect(p.verknuepfung).toBeNull();
    expect(p.neuerArtikel).toMatchObject({ key: "zitrone (art. 12500510)", artikel: { ingredient_name: "Zitrone (Art. 12500510)", article_number: "12500510" } });
  });

  it("nach einer Entscheidung ist der Artikel erledigt - egal welche", () => {
    const minze = { ingredient_name: "Minze", article_number: "Z009", unit: "kg", package_size: 0.1, package_price: 3.3 };
    const p = stammUebernahme(liste([], [MINZE]), { minze }, "Transgourmet").pruefen[0];
    const verknuepft = stammUebernahme(liste([], [MINZE]), { minze: p.verknuepfung.artikel }, "Transgourmet");
    const eigen = stammUebernahme(liste([], [MINZE]), { minze, [p.neuerArtikel.key]: p.neuerArtikel.artikel }, "Transgourmet");
    expect(verknuepft).toMatchObject({ vorhanden: 1, pruefen: [] });
    expect(eigen).toMatchObject({ vorhanden: 1, pruefen: [] });
  });

  it("gegen den Excel-Stamm: jede TG-Position ist entweder vorhanden, neu oder zu pruefen", () => {
    const stamm = Object.fromEntries(rezeptdatenbank.price_list.map(p => [p.ingredient_name.toLowerCase(), p]));
    const r = stammUebernahme(inventurJson, stamm, "Transgourmet");
    expect(r.gesamt).toBe(182);
    expect(r.vorhanden + r.neu + r.pruefen.length).toBe(182);
    expect(r.pruefen.every(p => p.neuerArtikel && (p.platzhalter ? p.verknuepfung : !p.verknuepfung))).toBe(true);
  });
});

describe("Hilfen", () => {
  it("Kernname ohne Groessen und Zusaetze", () => {
    expect(kernname("Traubenkernöl 1L")).toBe("traubenkernöl");
    expect(kernname("B153_Avocadowürfel TK 1kg")).toBe("avocadowürfel");
    expect(kernname("TK Himbeeren")).toBe("himbeeren");
    expect(kernname("Minze 100g")).toBe("minze");
    expect(kernname("Coca-Cola Light PET Mw 0,5L")).toBe("coca cola light pet mw");
  });

  it("echte Nummer vs. Platzhalter", () => {
    expect(hatEchteNummer({ article_number: "Z009" })).toBe(false);
    expect(hatEchteNummer({ article_number: "" })).toBe(false);
    expect(hatEchteNummer({ article_number: "https://kaffeebraun.com/x" })).toBe(false);
    expect(hatEchteNummer({ article_number: "Bunzl 68352" })).toBe(true);
    expect(hatEchteNummer({ article_number: "810035.0" })).toBe(true);
  });

  it("stempelt mit dem Stand der Liste", () => {
    expect(stempelAusStand("05.2026")).toBe("2026-05-01 00:00:00");
    expect(stempelAusStand("")).toBeNull();
  });
});

describe("Preisimport mit Lieferant", () => {
  const stamm = () => ({
    ...stammUebernahme(liste([BECHER]), {}, "BUNZL").patches,
    rotkohl: { ingredient_name: "Rotkohl", article_number: "810035.0", unit: "g", package_size: 1500, package_price: 6.38, price_per_gram_ml: 0.00425 },
  });
  const HEUTE = new Date("2026-10-05T08:00:00Z");

  it("BUNZL-Liste aktualisiert BUNZL-Artikel ueber die Nummer", () => {
    const r = verarbeitePreisimport({ zeilen: [{ name: "Becher", preis: 71.4, artNr: "920821" }], priceList: stamm(), heute: HEUTE, lieferant: "BUNZL" });
    const neu = r.patches["immergrün trinkbecher 500 ml"];
    expect(neu.package_price).toBeCloseTo(71.4, 6);
    expect(neu.net_price_per_unit).toBeCloseTo(0.0714, 6);
    expect(neu.date_last_checked).toBe("2026-10-05 00:00:00");
    expect(r.veraltet).toEqual([]);
  });

  it("TG-Liste meldet BUNZL-Artikel nicht als veraltet und matcht sie nicht", () => {
    const r = verarbeitePreisimport({ zeilen: [{ name: "", preis: 6.99, artNr: "810035" }, { name: "", preis: 1, artNr: "920821" }], priceList: stamm(), heute: HEUTE });
    expect(Object.keys(r.patches)).toEqual(["rotkohl"]);
    expect(r.ohneMatch).toHaveLength(1);
    expect(r.veraltet).toEqual([]);
  });

  it("neuer TG-Masseartikel: der Wochenimport zieht Gebinde- und Grammpreis mit", () => {
    const { patches } = stammUebernahme(liste([], [BARISTA]), {}, "Transgourmet");
    const r = verarbeitePreisimport({ zeilen: [{ name: "", preis: 12.0, artNr: "363296" }], priceList: patches, heute: HEUTE });
    const neu = r.patches["kokosdrink barista 1l"];
    expect(neu.package_price).toBeCloseTo(12, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.0015, 9);
  });

  it("handgepflegte 'Bunzl 68352'-Nummer passt zur BUNZL-Liste mit '68352'", () => {
    const l = { servietten: { ingredient_name: "Papierservietten weiss", article_number: "Bunzl 68352", unit: "CO", package_size: 9000, package_price: 77.55 } };
    const r = verarbeitePreisimport({ zeilen: [{ name: "", preis: 82.21, artNr: "68352" }], priceList: l, heute: HEUTE, lieferant: "BUNZL" });
    expect(r.patches.servietten.package_price).toBeCloseTo(82.21, 6);
  });
});
