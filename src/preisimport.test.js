import { describe, it, expect } from "vitest";
import { normalisiereNummer, verarbeitePreisimport } from "./preisimport.js";

// Nachbauten echter Stammartikel (Struktur aus rezeptdatenbank.json)
const ROTKOHL = {
  ingredient_name: "Rotkohl eingelegt", article_number: "810035.0", unit: "g",
  package_size: 1500, package_price: 6.38, gross_weight: 1000,
  gross_price: 4.253333333, net_weight: 1000, net_price_per_unit: 4.253333333,
  price_per_gram_ml: 0.004253333333, date_last_checked: "2025-03-21 00:00:00",
};
const EIER = {
  ingredient_name: "Eier", article_number: "103640.0", unit: "stück",
  package_size: 30, package_price: 8.45, price_per_gram_ml: 0.0002816666667,
  net_price_per_unit: 0.2816666667, date_last_checked: "2025-03-21 00:00:00",
};
const MINZE = {
  ingredient_name: "Minze", article_number: "Z009", unit: "kg",
  package_size: 0.1, package_price: 3.3, price_per_gram_ml: 0.033,
  date_last_checked: "2025-03-21 00:00:00",
};

const LISTE = {
  "rotkohl eingelegt": ROTKOHL,
  "eier": EIER,
  "minze": MINZE,
};

const HEUTE = new Date("2026-08-12T10:00:00Z");

describe("normalisiereNummer", () => {
  it("entfernt Float-Reste aus dem Excel-Erbe", () => {
    expect(normalisiereNummer("810035.0")).toBe("810035");
    expect(normalisiereNummer(810035.0)).toBe("810035");
    expect(normalisiereNummer(" 680 ")).toBe("680");
  });

  it("laesst Platzhalter und Texte unangetastet, nur kleingeschrieben", () => {
    expect(normalisiereNummer("Z009")).toBe("z009");
    expect(normalisiereNummer(null)).toBe("");
  });

  it("entfernt fuehrende Nullen, damit CSV-Formatierung nicht entscheidet", () => {
    expect(normalisiereNummer("0680")).toBe("680");
  });
});

describe("verarbeitePreisimport - Matching", () => {
  it("matcht ueber die Artikelnummer trotz Float-Rest im Stamm", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Rotkohl eingel. 1,5kg EIMER", preis: 6.99, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(Object.keys(r.patches)).toEqual(["rotkohl eingelegt"]);
    expect(r.geaendert).toBe(1);
    expect(r.ohneMatch).toHaveLength(0);
  });

  it("faellt auf den exakten Namen zurueck, wenn die Nummer fehlt", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Eier", preis: 8.45, artNr: "" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches["eier"]).toBeDefined();
  });

  it("macht KEIN Fuzzy-Matching (die Tomatenwuerfel-Lehre)", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Rotkohl", preis: 6.99, artNr: "999999" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });

  it("Z-Platzhalternummern im Stamm sind nicht matchbar", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "irgendwas", preis: 3.5, artNr: "Z009" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });
});

describe("verarbeitePreisimport - Preise und Stempel", () => {
  it("skaliert alle Preisfelder proportional zum neuen Gebindepreis", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 7.018, artNr: "810035" }], // +10 %
      priceList: LISTE, heute: HEUTE,
    });
    const neu = r.patches["rotkohl eingelegt"];
    expect(neu.package_price).toBeCloseTo(7.018, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.004253333333 * 1.1, 9);
    expect(neu.net_price_per_unit).toBeCloseTo(4.253333333 * 1.1, 6);
    expect(neu.date_last_checked).toBe("2026-08-12 00:00:00");
  });

  it("Stueckartikel: Gebindepreis gilt je VE, Preisfelder skalieren mit", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 9.3, artNr: "103640" }],
      priceList: LISTE, heute: HEUTE,
    });
    const neu = r.patches["eier"];
    expect(neu.package_price).toBeCloseTo(9.3, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.0002816666667 * (9.3 / 8.45), 9);
  });

  it("unveraenderter Preis: nur der Pruefstempel wird gesetzt", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 6.38, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.geaendert).toBe(0);
    expect(r.unveraendert).toBe(1);
    const neu = r.patches["rotkohl eingelegt"];
    expect(neu.package_price).toBeCloseTo(6.38, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.004253333333, 9);
    expect(neu.date_last_checked).toBe("2026-08-12 00:00:00");
  });

  it("Grundpreis-Semantik rechnet EUR/kg auf das Gebinde um", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 4.6, artNr: "810035" }], // 4,60 EUR/kg x 1,5 kg
      priceList: LISTE, semantik: "grundpreis", heute: HEUTE,
    });
    expect(r.patches["rotkohl eingelegt"].package_price).toBeCloseTo(6.9, 4);
  });

  it("Grundpreis auf Stueckartikel ist nicht ableitbar und faellt in ohneMatch", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 4.6, artNr: "103640" }],
      priceList: LISTE, semantik: "grundpreis", heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });
});

describe("verarbeitePreisimport - Berichte", () => {
  it("meldet Stammartikel, deren Nummer in der CSV fehlt, als veraltet", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 6.99, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    // Eier (103640) fehlen in der CSV -> veraltet-Kandidat; Minze (Z009) nicht gemeldet
    expect(r.veraltet.map(a => a.ingredient_name)).toEqual(["Eier"]);
  });

  it("ohne Nummern in der CSV gibt es keine Veraltet-Liste", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Eier", preis: 8.45, artNr: "" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.veraltet).toEqual([]);
  });

  it("doppelte CSV-Zeilen je Artikel: die letzte gewinnt, gezaehlt wird je Zeile", () => {
    const r = verarbeitePreisimport({
      zeilen: [
        { name: "", preis: 7.0, artNr: "810035" },
        { name: "", preis: 7.5, artNr: "810035" },
      ],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches["rotkohl eingelegt"].package_price).toBeCloseTo(7.5, 6);
  });
});
