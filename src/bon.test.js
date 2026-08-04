import { describe, it, expect } from "vitest";
import { BON_BREITE, wrapZeile } from "./bon.js";

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
