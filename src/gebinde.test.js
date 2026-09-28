import { describe, it, expect } from "vitest";
import { gebindeBefunde, packungenAusListe } from "./gebinde.js";

const inventur = {
  lieferanten: [{ name: "Transgourmet", untergruppen: [{ name: "Trocken", artikel: [
    { artikelnr: "451991", bezeichnung: "Oreo Original 154g", einheit: "Packung", ve: "PG", preis_ve: 23.84, stk_pro_ve: 16, preis_stk: 1.49 },
    { artikelnr: "264454", bezeichnung: "Palapa Weizentortilla 30cm TK 5x10St", einheit: "STK", ve: "STK", preis_ve: 14.9, stk_pro_ve: 50, preis_stk: 0.298 },
    { artikelnr: "777", bezeichnung: "Babyspinat 300g", einheit: "Beutel", ve: "BT", preis_ve: 2.196, stk_pro_ve: null, preis_stk: 2.196 },
    { artikelnr: "888", bezeichnung: "Vio still 0,5L", einheit: "Flasche", ve: "FL", preis_ve: 10.08, stk_pro_ve: 18, preis_stk: 0.56 },
  ] }] }],
};
const OREO = { ingredient_name: "Oreo Cookies (154g)", article_number: "451991.0", unit: "Stück", package_size: 14, package_price: 1.39 };
const WRAP = { ingredient_name: "Wrap natur", article_number: "264454", unit: "Stück", package_size: 10, package_price: 3.24 };
const SPINAT = { ingredient_name: "Babyspinat", article_number: "777", unit: "g", package_size: 1000, package_price: 7.53 };
const VIO = { ingredient_name: "Vio still 0,5l", article_number: "888", unit: "", package_price: 0.56 };

describe("packungenAusListe", () => {
  it("Packungen je Karton bei Packungsware", () => expect(packungenAusListe(OREO, inventur.lieferanten[0].untergruppen[0].artikel[0])).toBe(16));
  it("Stueck je VE geteilt durch Stueck je Stamm-Packung", () => expect(packungenAusListe(WRAP, inventur.lieferanten[0].untergruppen[0].artikel[1])).toBe(5));
});

describe("gebindeBefunde", () => {
  it("erkennt den schon falsch importierten Kartonpreis und schlaegt den Packungspreis vor", () => {
    const b = gebindeBefunde(inventur, { oreo: { ...OREO, package_price: 23.84 } });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ art: "kartonpreis", vorschlag: 16, neuerPreis: 1.49 });
  });

  it("meldet Einzelpackungen vor dem naechsten Import als Gebinde-Fall", () => {
    const b = gebindeBefunde(inventur, { oreo: OREO, wrap: WRAP, vio: VIO });
    const art = Object.fromEntries(b.map(x => [x.key, [x.art, x.vorschlag]]));
    expect(art).toEqual({ oreo: ["gebinde", 16], vio: ["gebinde", 18], wrap: ["gebinde", 5] });
  });

  it("meldet eine zu grosse Stamm-Packung zur Pruefung, ohne Vorschlag", () => {
    const b = gebindeBefunde(inventur, { spinat: SPINAT });
    expect(b[0]).toMatchObject({ art: "packung", vorschlag: null });
  });

  it("laesst entschiedene Artikel und Inventurartikel aus", () => {
    expect(gebindeBefunde(inventur, { oreo: { ...OREO, packungen_je_gebinde: 16 }, wrap: { ...WRAP, inventurartikel: true } })).toEqual([]);
  });
});
