import { describe, it, expect } from "vitest";
import { baueZuordnung, artikelKey } from "./artikelzuordnung.js";

const PL = {
  "oreo cookies (154g)": { ingredient_name: "Oreo Cookies (154g)", article_number: "451991.0" },
  "b153 salatmix 1kg": { ingredient_name: "B153 Salatmix 1kg", article_number: "700100" },
  "platzhalter": { ingredient_name: "Platzhalter", article_number: "Z009" },
};
const ZUTATEN = [
  { id: "salatmix", name: "Salatmix", aliase: ["Salatmix", "Mixsalat"], artikel_nr: "700100" },
  { id: "minze", name: "Minze", aliase: ["Minze"], artikel_nr: "Z009" },
];
const zu = baueZuordnung(PL, ZUTATEN);

describe("artikelKey", () => {
  it("trifft ueber den Namen wie bisher", () => expect(artikelKey({ name: "Oreo Cookies (154g)" }, zu)).toBe("oreo cookies (154g)"));
  it("trifft Kuechennamen ueber die Zutat und ihre Artikelnummer", () => {
    expect(artikelKey({ name: "Salatmix", zutat_id: "salatmix" }, zu)).toBe("b153 salatmix 1kg");
    expect(artikelKey({ name: "Mixsalat" }, zu)).toBe("b153 salatmix 1kg");
  });
  it("Z-Platzhalter sind keine Verknuepfung", () => expect(artikelKey({ name: "Minze", zutat_id: "minze" }, zu)).toBeNull());
  it("null ohne jeden Treffer", () => expect(artikelKey({ name: "Unbekannt" }, zu)).toBeNull());
});
