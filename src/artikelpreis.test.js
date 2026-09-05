import { describe, it, expect } from "vitest";
import { artikelPreisAendern, preisProGrammAusPackung, packungInGramm, istPreisPatch } from "./artikelpreis.js";

// Nachbauten echter Stammartikel
const TOFU = {
  ingredient_name: "Sesam Tofu", article_number: "51921", unit: "g",
  package_size: 200, package_price: 21.44, price_per_gram_ml: 0.1072,
  date_last_checked: "2025-03-21 00:00:00",
};
const EIER = {
  ingredient_name: "Eier", unit: "stück", package_size: 30, package_price: 11.64,
  price_per_gram_ml: 0.000388, preisbasis: "stueck",
};
const HEUTE = new Date("2026-09-06T10:00:00Z");

describe("artikelPreisAendern", () => {
  it("Packungsgroesse korrigieren rechnet den Grammpreis nach (Sesam Tofu ist ein 2-kg-Karton)", () => {
    const r = artikelPreisAendern(TOFU, { package_size: 2000 }, HEUTE);
    expect(r.geaendert).toBe(true);
    expect(r.proGAlt).toBeCloseTo(0.1072, 6);
    expect(r.proGNeu).toBeCloseTo(0.01072, 8);
    expect(r.artikel.price_per_gram_ml).toBeCloseTo(0.01072, 8);
    expect(r.artikel.package_price).toBe(21.44);
    expect(r.artikel.date_last_checked).toBe("2026-09-06 00:00:00");
    expect(r.artikel.preis_manuell_am).toBe("2026-09-06");
  });

  it("Packungspreis aendern bei kg-Einheit", () => {
    const r = artikelPreisAendern({ unit: "kg", package_size: 2.5, package_price: 10, price_per_gram_ml: 0.004 },
                                  { package_price: 12.5 }, HEUTE);
    expect(r.artikel.price_per_gram_ml).toBeCloseTo(0.005, 9);
  });

  it("Kilopreis direkt setzen zieht den Packungspreis passend", () => {
    const r = artikelPreisAendern(TOFU, { price_per_gram_ml: 0.01072 }, HEUTE);
    expect(r.artikel.price_per_gram_ml).toBeCloseTo(0.01072, 9);
    expect(r.artikel.package_price).toBeCloseTo(2.144, 4);
  });

  it("Einheit wechseln rechnet die Packung um", () => {
    const r = artikelPreisAendern(TOFU, { unit: "kg" }, HEUTE);
    expect(r.artikel.unit).toBe("kg");
    expect(r.artikel.price_per_gram_ml).toBeCloseTo(21.44 / 200000, 12);
  });

  it("Stueckartikel ohne Gewicht: Grammpreis bleibt stehen, Packungspreis aendert sich trotzdem", () => {
    const r = artikelPreisAendern(EIER, { package_price: 8.45 }, HEUTE);
    expect(r.geaendert).toBe(true);
    expect(r.artikel.package_price).toBe(8.45);
    expect(r.artikel.price_per_gram_ml).toBe(0.000388);
  });

  it("Stueckartikel mit Gewicht: Grammpreis = Stueckpreis / Gewicht", () => {
    const r = artikelPreisAendern({ ...EIER, gewicht_je_stueck_g: 50 }, { package_price: 11.64 }, HEUTE);
    expect(r.artikel.price_per_gram_ml).toBeCloseTo(0.388 / 50, 9);
  });

  it("Patch ohne Aenderung stempelt nicht", () => {
    const r = artikelPreisAendern(TOFU, { package_price: 21.44 }, HEUTE);
    expect(r.geaendert).toBe(false);
    expect(r.artikel.date_last_checked).toBe("2025-03-21 00:00:00");
    expect(r.artikel.preis_manuell_am).toBeUndefined();
  });

  it("Hilfsfunktionen", () => {
    expect(packungInGramm({ unit: "kg", package_size: 2.5 })).toBe(2500);
    expect(packungInGramm({ unit: "stück", package_size: 30 })).toBeNull();
    expect(preisProGrammAusPackung({ unit: "ml", package_size: 500, package_price: 2 })).toBeCloseTo(0.004, 9);
    expect(preisProGrammAusPackung({ unit: "g", package_size: 0, package_price: 2 })).toBeNull();
    expect(istPreisPatch({ ausbeute_prozent: 60 })).toBe(false);
    expect(istPreisPatch({ package_price: 1 })).toBe(true);
  });
});
