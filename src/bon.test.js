import { describe, it, expect } from "vitest";
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen } from "./bon.js";

describe("bon", () => {
  it("kennt die Bonbreite", () => {
    expect(BON_BREITE).toBe(42);
  });
});

describe("wrapZeile", () => {
  it("laesst kurze Zeilen unveraendert", () => {
    expect(wrapZeile("Babyspinat 30 g")).toEqual(["Babyspinat 30 g"]);
  });

  it("bricht an Wortgrenzen und rueckt Folgezeilen ein", () => {
    const zeilen = wrapZeile("aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii", 20, "  ");
    expect(zeilen).toEqual([
      "aaaa bbbb cccc dddd",
      "  eeee ffff gggg",
      "  hhhh iiii",
    ]);
  });

  it("trennt ueberlange Woerter hart", () => {
    expect(wrapZeile("Xxxxxxxxxx", 5)).toEqual(["Xxxxx", "xxxxx"]);
  });

  it("liefert bei leerem Text eine leere Zeile", () => {
    expect(wrapZeile("   ")).toEqual([""]);
  });

  it("haelt sich an die Standardbreite", () => {
    const text = "Erst die Sauce auf den Boden geben, dann den Salat locker darauf schichten und zuletzt die Toppings verteilen";
    for (const z of wrapZeile(text, BON_BREITE, "  ")) {
      expect(z.length).toBeLessThanOrEqual(BON_BREITE);
    }
  });
});

describe("Formatierung", () => {
  it("formatiert Mengen deutsch ohne Nachkomma-Nullen", () => {
    expect(formatMenge(30)).toBe("30");
    expect(formatMenge(2.5)).toBe("2,5");
    expect(formatMenge(0.25)).toBe("0,25");
  });

  it("formatiert Euro mit zwei Nachkommastellen", () => {
    expect(formatEuro(5.9)).toBe("5,90 €");
    expect(formatEuro(null)).toBe("0,00 €");
  });
});

describe("zutatenZeilen", () => {
  const produkt = {
    name: "Green Booster",
    zutaten: [
      { name: "Babyspinat", menge_g: 30 },
      { name: "Banane", menge_g: 100 },
      { name: "Deko", menge_g: 0 },
    ],
  };

  it("baut Zeilen aus der Rezeptur", () => {
    expect(zutatenZeilen(produkt)).toEqual(["Babyspinat 30 g", "Banane 100 g"]);
  });

  it("nimmt den abweichenden Text, wenn gepflegt", () => {
    const p = { ...produkt, bon_zutaten: "Sauce Green Goddess 40 g\n  Salatmix 120 g\n\n" };
    expect(zutatenZeilen(p)).toEqual(["Sauce Green Goddess 40 g", "Salatmix 120 g"]);
  });

  it("faellt bei leerem Text auf die Rezeptur zurueck", () => {
    expect(zutatenZeilen({ ...produkt, bon_zutaten: "   " })).toEqual(["Babyspinat 30 g", "Banane 100 g"]);
  });

  it("vertraegt ein Produkt ohne Zutaten", () => {
    expect(zutatenZeilen({ name: "Leer" })).toEqual([]);
  });
});
