import { describe, it, expect } from "vitest";
import { normalisiereArtikelart, artikelartVon, naechsteArtikelart, ohneArtikelart } from "./artikelart.js";

describe("normalisiereArtikelart", () => {
  it("versteht die Schluessel und die Klartext-Namen", () => {
    expect(normalisiereArtikelart("pflicht")).toBe("pflicht");
    expect(normalisiereArtikelart("Pflichtartikel")).toBe("pflicht");
    expect(normalisiereArtikelart(" P ")).toBe("pflicht");
    expect(normalisiereArtikelart("zusatz")).toBe("zusatz");
    expect(normalisiereArtikelart("Zusatzartikel")).toBe("zusatz");
    expect(normalisiereArtikelart("optional")).toBe("zusatz");
  });
  it("laesst Unbekanntes und Leeres ungesetzt", () => {
    expect(normalisiereArtikelart(null)).toBeNull();
    expect(normalisiereArtikelart("")).toBeNull();
    expect(normalisiereArtikelart("Sonderartikel")).toBeNull();
    expect(normalisiereArtikelart(42)).toBeNull();
  });
});

describe("artikelartVon / naechsteArtikelart", () => {
  it("liest das Produktfeld tolerant", () => {
    expect(artikelartVon({ artikelart: "Zusatz" })).toBe("zusatz");
    expect(artikelartVon({})).toBeNull();
    expect(artikelartVon(null)).toBeNull();
  });
  it("wechselt leer -> Pflicht -> Zusatz -> Pflicht", () => {
    expect(naechsteArtikelart(null)).toBe("pflicht");
    expect(naechsteArtikelart("pflicht")).toBe("zusatz");
    expect(naechsteArtikelart("zusatz")).toBe("pflicht");
  });
});

describe("ohneArtikelart", () => {
  it("zaehlt nur Grundrezepte ohne Kennzeichen", () => {
    const produkte = [
      { id: "a", artikelart: "pflicht" },
      { id: "b" },
      { id: "c", artikelart: "" },
      { id: "b_reis", basis_produkt_id: "b" },
    ];
    expect(ohneArtikelart(produkte).map(p => p.id)).toEqual(["b", "c"]);
    expect(ohneArtikelart(undefined)).toEqual([]);
  });
});
