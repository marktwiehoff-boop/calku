import { describe, it, expect } from "vitest";
import { artikelBefund, bereinigeArtikel, implizierteGramm, nominelleGramm } from "./artikelbereinigung.js";

// Nachbauten aus dem Live-Dokument (06.09.2026)
const ERDBEEREN = { ingredient_name: "Erdbeeren", unit: "kg", package_size: 500, net_weight: 500, package_price: 3.1, price_per_gram_ml: 0.0062 };
const GARKARTOFFEL = { ingredient_name: "Garkartoffel", unit: "kg", package_size: 4, net_weight: 1000, package_price: 7.68, price_per_gram_ml: 0.00192 };
const MILCH = { ingredient_name: "H-Milch 1,5%", unit: "Liter", package_size: 1, net_weight: 1000, package_price: 8.64, price_per_gram_ml: 0.00864 };
const JASMINREIS = { ingredient_name: "Jasminreis", unit: "g", package_size: 20000, net_weight: 1000, package_price: 27.98, price_per_gram_ml: 0.00006995 };
const FRAPPE = { ingredient_name: "Frappepulver (weiß)", unit: "kg", package_size: 1, net_weight: 1000, package_price: 10.289, price_per_gram_ml: 0.0091866 };
const COLA = { ingredient_name: "Coca Cola 0,5l", unit: null, package_size: null, package_price: 11.04 };
const EIER = { ingredient_name: "Eier", unit: "stück", package_size: 30, package_price: 11.64, price_per_gram_ml: 0.000388, preisbasis: "stueck", gewicht_je_stueck_g: 50 };
const TORTILLA = { ingredient_name: "Palapa Weizentortilla", unit: "Stk.", package_size: 1, package_price: 0.3, price_per_gram_ml: 0.005 };
const KARACHI = { ingredient_name: "Wild Karachi Dressing", unit: "ml", package_size: 1, net_weight: 1000, package_price: 5.72, price_per_gram_ml: 0.00572 };
const BECHER = { ingredient_name: "Kaltgetränkebecher", unit: "CO", package_size: 1000, package_price: 115.241, price_per_gram_ml: 0.115241 };

describe("Gramm aus Preis und Etikett", () => {
  it("rechnet implizierte und nominelle Gramm", () => {
    expect(implizierteGramm(ERDBEEREN)).toBe(500);
    expect(nominelleGramm(ERDBEEREN)).toBe(500000);
    expect(nominelleGramm(GARKARTOFFEL)).toBe(4000);
    expect(implizierteGramm(GARKARTOFFEL)).toBe(4000);
    expect(implizierteGramm(COLA)).toBeNull();
    expect(nominelleGramm(COLA)).toBeNull();
    expect(nominelleGramm(MILCH)).toBe(1000);
  });
});

describe("artikelBefund", () => {
  it('Gramm unter „kg“ (Faktor 1000): Etikett wird gepatcht, Preis bleibt', () => {
    const b = artikelBefund(ERDBEEREN);
    expect(b.patch).toEqual({ preisbasis: "gramm", unit: "g", package_size: 500 });
    expect(b.pruefen).toBe(false);
    expect(b.hinweise[0]).toContain("500 kg ≠ Preis (500 g)");
  });

  it("stimmiges Gebinde: nur Preisbasis und net_weight-Platzhalter", () => {
    const b = artikelBefund(GARKARTOFFEL);
    expect(b.patch).toEqual({ preisbasis: "gramm", net_weight: 4000 });
    expect(b.pruefen).toBe(false);
  });

  it('„Liter“ wird „l“ und Preisbasis ml100 — kein Stück mehr', () => {
    expect(artikelBefund(MILCH).patch).toEqual({ unit: "l", preisbasis: "ml100" });
    expect(artikelBefund(KARACHI).patch).toEqual({ preisbasis: "ml100", unit: "l", package_size: 1 });
  });

  it("andere Abweichungen nur berichten: Jasminreis (Faktor 20) und Frappepulver (12 %)", () => {
    const reis = artikelBefund(JASMINREIS);
    expect(reis.patch).toEqual({ preisbasis: "gramm", net_weight: 400000 });
    expect(reis.pruefen).toBe(true);
    expect(reis.hinweise.some((h) => h.includes("von Hand prüfen"))).toBe(true);
    const frappe = artikelBefund(FRAPPE);
    expect(frappe.patch).not.toHaveProperty("package_size");
    expect(frappe.pruefen).toBe(true);
  });

  it("Stück und Handelsware", () => {
    expect(artikelBefund(EIER)).toMatchObject({ patch: {}, pruefen: false });
    const t = artikelBefund(TORTILLA);
    expect(t.patch).toEqual({ preisbasis: "stueck" });
    expect(t.pruefen).toBe(true); // ohne Stückgewicht
    expect(artikelBefund(COLA).patch).toEqual({ preisbasis: "stueck" });
    expect(artikelBefund(BECHER).patch).toEqual({});
    expect(artikelBefund(BECHER).hinweise[0]).toContain("unbekannt");
  });
});

describe("bereinigeArtikel", () => {
  it("liefert Patches mit Stempel und einen Bericht, sortiert nach Name", () => {
    const heute = new Date("2026-09-10T12:00:00Z");
    const r = bereinigeArtikel({ erdbeeren: ERDBEEREN, garkartoffel: GARKARTOFFEL, eier: EIER, jasminreis: JASMINREIS }, heute);
    expect(r.gesamt).toBe(4);
    expect(r.geaendert).toBe(3);
    expect(r.pruefen).toBe(1);
    expect(r.patches.erdbeeren).toMatchObject({ unit: "g", package_size: 500, price_per_gram_ml: 0.0062, bereinigt_am: "2026-09-10" });
    expect(r.patches.eier).toBeUndefined();
    expect(r.bericht.map((b) => b.name)).toEqual(["Erdbeeren", "Garkartoffel", "Jasminreis"]);
    expect(bereinigeArtikel({})).toMatchObject({ gesamt: 0, geaendert: 0, bericht: [] });
  });
});
