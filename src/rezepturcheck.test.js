import { describe, it, expect } from "vitest";
import { pruefeRezepturen, groesse } from "./rezepturcheck.js";

const PL = {
  "banane": { ingredient_name: "Banane", unit: "kg", package_size: 1, package_price: 2, price_per_gram_ml: 0.002 },
  "oreo": { ingredient_name: "Oreo", unit: "Stück", package_size: 14, package_price: 1.49, price_per_gram_ml: 0.1064 },
};
const zeile = (name, menge_g, preis_pro_g) => ({ name, menge_g, preis_pro_g, cost: menge_g * preis_pro_g });
const produkt = (id, name, zutaten, vk = 6.45) => ({ id, name, gruppe: "Smoothies", zutaten, vk_in_brutto: vk, vk_out_brutto: vk });
const typen = (b) => b.map(x => x.typ).sort();

describe("groesse", () => {
  it("ml, Liter und Klein/Normal", () => {
    expect(groesse("Cookie Monster 500ml")).toMatchObject({ base: "Cookie Monster", rang: 500 });
    expect(groesse("Julius Caesar Klein")).toMatchObject({ base: "Julius Caesar", rang: 1 });
    expect(groesse("Wrap Falafel")).toBeNull();
  });
});

describe("pruefeRezepturen", () => {
  it("eine saubere Rezeptur hat keine Befunde", () => {
    expect(pruefeRezepturen([produkt("a", "A 400ml", [zeile("Banane", 80, 0.002)])], { priceList: PL })).toEqual([]);
  });

  it("findet Preis 0, fehlenden Artikel, Menge 0, Dublette und fehlenden VK", () => {
    const b = pruefeRezepturen([produkt("a", "A", [
      zeile("Banane", 80, 0), zeile("Banane", 10, 0.002), zeile("Hausmix", 20, 0.01), zeile("Minze", 0, 0.03),
    ], 0)], { priceList: PL });
    expect(typen(b)).toEqual(["doppelt", "menge_null", "nicht_im_stamm", "ohne_preis", "vk_fehlt"]);
  });

  it("meldet veraltete Preise, Stueckzeilen gegen den Stueckpreis", () => {
    const stk = { name: "Oreo", einheit: "stk", menge_stk: 1, preis_je_stueck: 1.70, cost: 1.70 };
    const b = pruefeRezepturen([produkt("a", "A", [zeile("Banane", 80, 0.003), stk])], { priceList: PL });
    expect(b.map(x => x.typ)).toEqual(["preis_alt", "preis_alt"]);
    expect(b[1].text).toContain("€/Stk");
  });

  it("nutzt die uebergebene Artikel-Zuordnung (Kuechenname -> Artikel)", () => {
    const b = pruefeRezepturen([produkt("a", "A", [zeile("Bananen reif", 80, 0.002)])],
      { artikelVon: (z) => (z.name === "Bananen reif" ? PL.banane : null) });
    expect(b).toEqual([]);
  });

  it("prueft die Groessenstaffel: weniger oder fehlend in der groesseren Groesse", () => {
    const b = pruefeRezepturen([
      produkt("s", "Beere 400ml", [zeile("Banane", 80, 0.002), { name: "Oreo", einheit: "stk", menge_stk: 1, preis_je_stueck: 0.1064, cost: 0.1064 }]),
      produkt("m", "Beere 500ml", [zeile("Banane", 60, 0.002)]),
    ], { priceList: PL });
    expect(b.map(x => [x.produktId, x.typ])).toEqual([["m", "staffel"], ["m", "staffel"]]);
  });
});
