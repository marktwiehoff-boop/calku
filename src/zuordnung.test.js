import { describe, it, expect } from "vitest";
import { vergleichsname, baueArtikelIndex, vorschlaege, suche, zutatenUebersicht, artikelPreis } from "./zuordnung.js";
import { baueZuordnung, artikelKey } from "./artikelzuordnung.js";

const PL = {
  "mangosorbet gefroren": { ingredient_name: "Mangosorbet gefroren", article_number: "300100", unit: "g", package_size: 3500, package_price: 20.65, price_per_gram_ml: 0.0059 },
  "mangostücke tk 2,5kg": { ingredient_name: "Mangostücke TK 2,5kg", article_number: "300200", unit: "g", package_size: 2500, package_price: 7.58, price_per_gram_ml: 0.003032 },
  "h-milch 1,5%": { ingredient_name: "H-Milch 1,5%", article_number: "300300", unit: "ml", package_size: 12000, package_price: 8.64, price_per_gram_ml: 0.00072 },
  "becher": { ingredient_name: "Becher", article_number: "Z001", unit: "Stück", package_size: 1000, package_price: 60, nonfood: true },
  "hausmischung": { ingredient_name: "Hausmischung", article_number: "Z009", unit: "g", package_size: 1000, package_price: 5, price_per_gram_ml: 0.005 },
};
const index = baueArtikelIndex(PL);

describe("vergleichsname", () => {
  it("entfernt Mengen, Kuerzel und Sonderzeichen", () => {
    expect(vergleichsname("B153_Mangosorbet TK 3,5kg")).toBe("mangosorbet");
    expect(vergleichsname("H-Milch 1,5% 1l")).toBe("h milch");
  });
});

describe("vorschlaege", () => {
  it("findet den Artikel zur Kuechenbezeichnung, Preisnaehe zaehlt mit", () => {
    const v = vorschlaege("Mangosorbet", { rezeptPreis: 2.67 }, index);
    expect(v[0].key).toBe("mangosorbet gefroren");
    expect(v[0].faktor).toBeCloseTo(2.67 / 5.9, 3);
    expect(vorschlaege("Mango TK", { rezeptPreis: 3.03 }, index)[0].key).toBe("mangostücke tk 2,5kg");
  });
  it("laesst Non-Food aus", () => {
    expect(vorschlaege("Becher", {}, index).map(v => v.key)).not.toContain("becher");
  });
  it("Suche nach Name oder Nummer", () => {
    expect(suche("milch", index).map(t => t.key)).toEqual(["h-milch 1,5%"]);
    expect(suche("300200", index).map(t => t.key)).toEqual(["mangostücke tk 2,5kg"]);
  });
});

describe("zutatenUebersicht", () => {
  const produkte = [
    { id: "a", zutaten: [{ name: "Mangosorbet", menge_g: 50, preis_pro_g: 0.00267, cost: 0.1335 }, { name: "H-Milch 1,5%", menge_g: 200, preis_pro_g: 0.00072, cost: 0.144 }] },
    { id: "b", zutaten: [{ name: "Mangosorbet", menge_g: 70, preis_pro_g: 0.00267, cost: 0.1869 }, { name: "Hausmix", menge_g: 10, preis_pro_g: 0.005, cost: 0.05 }] },
  ];
  it("ordnet ueber Name, Artikelnummer der Zutat oder artikel_key zu und kennt eigene Kalkulation", () => {
    const zutaten = [
      { id: "mangosorbet", name: "Mangosorbet", aliase: ["Mangosorbet"], artikel_nr: "300100" },
      { id: "hausmix", name: "Hausmix", aliase: ["Hausmix"], ohne_artikel: true },
    ];
    const u = zutatenUebersicht(produkte, baueZuordnung(PL, zutaten), zutaten);
    expect(u.map(e => [e.name, e.stand, e.zeilen])).toEqual([["Mangosorbet", "zugeordnet", 2], ["H-Milch 1,5%", "zugeordnet", 1], ["Hausmix", "eigen", 1]]);
    expect(u[0].artikelPreis).toBeCloseTo(5.9, 6);
  });
  it("artikel_key verbindet Artikel ohne echte Nummer", () => {
    const zutaten = [{ id: "hausmix", name: "Hausmix", aliase: ["Hausmix"], artikel_key: "hausmischung" }];
    expect(artikelKey({ name: "Hausmix" }, baueZuordnung(PL, zutaten))).toBe("hausmischung");
  });
  it("Stueckpreis fuer Stueckzeilen", () => {
    expect(artikelPreis({ unit: "Stück", package_size: 14, package_price: 1.49 }, true)).toBeCloseTo(0.1064, 4);
  });
});
