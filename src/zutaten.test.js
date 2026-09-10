import { describe, it, expect } from "vitest";
import {
  zutatId,
  normalisiereName,
  bereinigeListe,
  leereZutat,
  normalisiereStamm,
  istStueckArtikel,
  artikelStueckgewicht,
  artikelNummer,
  stammIndex,
  findeZutat,
  aliasKonflikte,
  verknuepfeProdukte,
  rezeptnamenOhneZutat,
  zeilenJeZutat,
  zutatAusRezeptzeilen,
  zutatenAusRezepten,
  zusammenfuehren,
  stempleStamm,
  bereinigeStueckgewichte,
  importiereZutaten,
  stammBefunde,
} from "./zutaten.js";

// Preisliste wie im Live-Dokument (06.09.2026)
const PRICELIST = {
  "eier": { ingredient_name: "Eier", article_number: "103640.0", unit: "stück", package_size: 30, package_price: 11.64, price_per_gram_ml: 0.000388, preisbasis: "stueck", gewicht_je_stueck_g: 50 },
  "gurke kl.frisch stk.": { ingredient_name: "Gurke Kl.frisch Stk.", article_number: "710838", unit: "kg", package_size: 470, package_price: 1.27, price_per_gram_ml: 0.0027 },
  "salatmix": { ingredient_name: "Salatmix", article_number: "526214", unit: "kg", package_size: 1000, package_price: 5.9, price_per_gram_ml: 0.0059, ausbeute_prozent: null },
  "h-milch 1,5%": { ingredient_name: "H-Milch 1,5%", article_number: "3179.0", unit: "Liter", package_size: 1, package_price: 8.64, price_per_gram_ml: 0.00864 },
  "palapa weizentortilla 30cm tk 10stk.": { ingredient_name: "Palapa Weizentortilla 30cm TK 10Stk.", article_number: "264454", unit: "Stk.", package_size: 1, package_price: 0.3, price_per_gram_ml: 0.005 },
};

const PRODUKTE = [
  { id: "bowl_normal_julius_caesar", name: "Julius Caesar Normal", gruppe: "Bowls", zutaten: [
    { name: "Salatmix", menge_g: 100, preis_pro_g: 0.0059, cost: 0.59, lieferant: "Transgourmet" },
    { name: "Gurkenwürfel", menge_g: 40, preis_pro_g: 0.0027, cost: 0.108, gramm_je_stueck: 450.045 },
    { name: "Ei (gekocht)", einheit: "stk", menge_stk: 1, preis_je_stueck: 0.28, gramm_je_stueck: 50, menge_g: 50, cost: 0.28 },
    { name: "Hähnchen", menge_g: 80, preis_pro_g: 0.0072 },
  ] },
  { id: "smoothie_x", name: "Smoothie X", gruppe: "Smoothies", zutaten: [
    { name: "Banane", menge_g: 100, gramm_je_stueck: 1000 },
    { name: " gurke", menge_g: 50, ausbeute_prozent: 80 },
    { name: "Eiswürfel", menge_g: 120 },
    { name: "", menge_g: 0 },
  ] },
];

const STAMM = [
  normalisiereStamm({ id: "gurkenwuerfel", name: "Gurkenwürfel", aliase: ["Gurke"], artikel_nr: "710838", arbeitseinheit: { name: "Stück", gramm: 470 }, ausbeute_prozent: 80, klasse: "frisch" }),
  normalisiereStamm({ id: "salatmix", name: "Salatmix", aliase: ["Mixsalat"], artikel_nr: "526214", arbeitseinheit: { name: "Beutel", gramm: 1000 } }),
  normalisiereStamm({ id: "ei-gekocht", name: "Ei (gekocht)", einheit: "stk", stueck_gramm: 50, artikel_nr: "103640" }),
];

describe("Schlüssel und Namen", () => {
  it("bildet T16-kompatible ids", () => {
    expect(zutatId("Ei (gekocht)")).toBe("ei-gekocht");
    expect(zutatId("Hähnchen")).toBe("haehnchen");
    expect(zutatId("Kartoffeln gegart")).toBe("kartoffeln-gegart");
    expect(zutatId("Açaí (Schicht 1 – Boden)")).toBe("acai-schicht-1-boden");
    expect(zutatId("veg. Sylter Dressing")).toBe("veg-sylter-dressing");
    expect(zutatId("Erdnüsse (10g)")).toBe("erdnuesse-10g");
    expect(zutatId("Zitronenlimonade (Monin/Wasser)")).toBe("zitronenlimonade-monin-wasser");
    expect(zutatId("  Weiße Soße ")).toBe("weisse-sosse");
    expect(zutatId("")).toBe("");
    expect(zutatId(null)).toBe("");
  });

  it("normalisiert Namen und Listen", () => {
    expect(normalisiereName("  Salat   Mix ")).toBe("salat mix");
    expect(bereinigeListe([" Gurke ", "gurke", "", null, "Gurkenwürfel"])).toEqual(["Gurke", "Gurkenwürfel"]);
    expect(bereinigeListe("Gurke, Salat;Tomate\nGurke")).toEqual(["Gurke", "Salat", "Tomate"]);
  });

  it("leereZutat und normalisiereStamm: Name ist immer Alias, Werte werden sauber", () => {
    expect(leereZutat("Rote Bete")).toMatchObject({ id: "rote-bete", name: "Rote Bete", aliase: ["Rote Bete"], einheit: "g", arbeitseinheit: { name: null, gramm: null } });
    const z = normalisiereStamm({ name: " Gurkenwürfel ", aliase: ["Gurke", "gurkenwürfel"], einheit: "kg", stueck_gramm: "-3", arbeitseinheit: { name: " Stück ", gramm: "470,5" }, ausbeute_prozent: "80", klasse: "Frisch", artikel_nr: " 710838 ", extra: 1 });
    expect(z).toMatchObject({ id: "gurkenwuerfel", name: "Gurkenwürfel", aliase: ["Gurkenwürfel", "Gurke"], einheit: "g", stueck_gramm: null, arbeitseinheit: { name: "Stück", gramm: 470.5 }, ausbeute_prozent: 80, klasse: null, artikel_nr: "710838", extra: 1 });
    expect(normalisiereStamm({ id: "x", ausbeute_prozent: 100 }).ausbeute_prozent).toBeNull();
    expect(normalisiereStamm({ id: "x", ausbeute_prozent: 150 }).ausbeute_prozent).toBeNull();
    expect(normalisiereStamm({ id: "x", klasse: "tk" }).klasse).toBe("tk");
    expect(normalisiereStamm({ id: "alt-id", name: "Neuer Name" }).id).toBe("alt-id");
  });

  it("artikelNummer: normalisiert, ohne Z-Platzhalter und Links", () => {
    expect(artikelNummer(PRICELIST["eier"])).toBe("103640");
    expect(artikelNummer({ article_number: "z014" })).toBeNull();
    expect(artikelNummer({ article_number: "https://www.amazon.de/irgendwas" })).toBeNull();
    expect(artikelNummer({ article_number: "bunzl 41929" })).toBe("bunzl 41929");
    expect(artikelNummer({ article_number: "" })).toBeNull();
    expect(artikelNummer(null)).toBeNull();
    expect(zutatAusRezeptzeilen("Cold Brew", [], { article_number: "https://kaffeebraun.com/x" }).artikel_nr).toBeNull();
  });

  it("Stückartikel: explizite Preisbasis oder Stück-Einheit, keine Größen-Heuristik", () => {
    expect(istStueckArtikel(PRICELIST["eier"])).toBe(true);
    expect(istStueckArtikel(PRICELIST["palapa weizentortilla 30cm tk 10stk."])).toBe(true);
    expect(istStueckArtikel(PRICELIST["h-milch 1,5%"])).toBe(false); // Liter/1 ist kein Stück
    expect(istStueckArtikel(PRICELIST["gurke kl.frisch stk."])).toBe(false);
    expect(istStueckArtikel(null)).toBe(false);
    expect(artikelStueckgewicht(PRICELIST["eier"])).toBe(50);
    expect(artikelStueckgewicht({ unit: "stk", package_size: 10, package_price: 3, price_per_gram_ml: 0.005 })).toBe(60);
    expect(artikelStueckgewicht(PRICELIST["salatmix"])).toBeNull();
  });
});

describe("Suchen und Verknüpfen", () => {
  it("findet per id vor Name vor Alias, case-insensitiv und getrimmt", () => {
    const index = stammIndex(STAMM);
    expect(index.jeName.get("gurke").id).toBe("gurkenwuerfel");
    expect(findeZutat(STAMM, { name: " GURKE " }).id).toBe("gurkenwuerfel");
    expect(findeZutat(STAMM, { name: "Mixsalat" }).id).toBe("salatmix");
    expect(findeZutat(STAMM, { zutat_id: "ei-gekocht", name: "irgendwas" }).id).toBe("ei-gekocht");
    expect(findeZutat(STAMM, { zutat_id: "gibt-es-nicht", name: "Salatmix" }).id).toBe("salatmix");
    expect(findeZutat(STAMM, { name: "Banane" })).toBeNull();
    expect(aliasKonflikte(STAMM)).toEqual([]);
    expect(aliasKonflikte([...STAMM, normalisiereStamm({ id: "gurke", name: "Gurke" })])).toEqual([{ alias: "Gurke", ids: ["gurkenwuerfel", "gurke"] }]);
  });

  it("verknuepfeProdukte setzt zutat_id, lässt Unverändertes als dasselbe Objekt und zählt", () => {
    const { produkte, verknuepft, ohne, geaendert } = verknuepfeProdukte(PRODUKTE, STAMM);
    expect(verknuepft).toBe(4); // Salatmix, Gurkenwürfel, Ei, gurke (Hähnchen/Banane/Eiswürfel offen, Leerzeile zählt nicht)
    expect(ohne).toBe(3);
    expect(geaendert).toBe(4);
    expect(produkte[0].zutaten.map((z) => z.zutat_id ?? null)).toEqual(["salatmix", "gurkenwuerfel", "ei-gekocht", null]);
    expect(produkte[1].zutaten[1].zutat_id).toBe("gurkenwuerfel");
    // zweiter Lauf: nichts ändert sich, Produkte bleiben dieselben Objekte
    const zweiter = verknuepfeProdukte(produkte, STAMM);
    expect(zweiter.geaendert).toBe(0);
    expect(zweiter.produkte[0]).toBe(produkte[0]);
    // verwaiste id wird entfernt
    const verwaist = [{ id: "p", zutaten: [{ name: "Banane", zutat_id: "weg" }] }];
    expect(verknuepfeProdukte(verwaist, STAMM).produkte[0].zutaten[0]).toEqual({ name: "Banane" });
  });

  it("nennt Rezeptnamen ohne Zutat mit Zeilen, Produkten und Artikeltreffer", () => {
    const offen = rezeptnamenOhneZutat(PRODUKTE, STAMM, PRICELIST);
    expect(offen.map((o) => o.name)).toEqual(["Banane", "Eiswürfel", "Hähnchen"]);
    expect(offen[0]).toMatchObject({ zeilen: 1, produkte: 1, menge_g: 100, artikel: null });
    expect(rezeptnamenOhneZutat(PRODUKTE, [], PRICELIST).find((o) => o.name === "Salatmix").artikel.article_number).toBe("526214");
    expect(rezeptnamenOhneZutat([], STAMM)).toEqual([]);
    const je = zeilenJeZutat(verknuepfeProdukte(PRODUKTE, STAMM).produkte);
    expect(je.get("gurkenwuerfel")).toBe(2);
    expect(je.get("salatmix")).toBe(1);
    expect(je.get("banane")).toBeUndefined();
  });
});

describe("Anlegen aus Rezepten", () => {
  it("reichert aus Artikel und Rezeptzeilen an", () => {
    const ei = zutatAusRezeptzeilen("Ei (gekocht)", [PRODUKTE[0].zutaten[2]], PRICELIST["eier"]);
    expect(ei).toMatchObject({ id: "ei-gekocht", einheit: "stk", stueck_gramm: 50, artikel_nr: "103640" });
    const gurke = zutatAusRezeptzeilen("Gurke", [PRODUKTE[1].zutaten[1]], null);
    expect(gurke).toMatchObject({ id: "gurke", ausbeute_prozent: 80, einheit: "g", artikel_nr: null });
    const salat = zutatAusRezeptzeilen("Salatmix", [], PRICELIST["salatmix"]);
    expect(salat).toMatchObject({ artikel_nr: "526214", ausbeute_prozent: null, einheit: "g" });
    // Nicht-Stück-Zeile mit Altlast gramm_je_stueck bleibt Gramm
    expect(zutatAusRezeptzeilen("Banane", [PRODUKTE[1].zutaten[0]], null)).toMatchObject({ einheit: "g", stueck_gramm: null });
  });

  it("zutatenAusRezepten legt nur Fehlendes an, sortiert, und hält ids eindeutig", () => {
    const { zutaten, neu } = zutatenAusRezepten(PRODUKTE, PRICELIST, STAMM);
    expect(neu).toBe(3);
    expect(zutaten.map((z) => z.id)).toEqual(["banane", "ei-gekocht", "eiswuerfel", "gurkenwuerfel", "haehnchen", "salatmix"]);
    const leer = zutatenAusRezepten(PRODUKTE, PRICELIST, []);
    expect(leer.neu).toBe(7);
    expect(leer.zutaten.find((z) => z.id === "gurke")).toMatchObject({ ausbeute_prozent: 80 });
    const doppelt = zutatenAusRezepten([{ id: "p", zutaten: [{ name: "TK Mango" }, { name: "Tk-Mango" }] }], {}, []);
    expect(doppelt.zutaten.map((z) => z.id)).toEqual(["tk-mango", "tk-mango-2"]);
  });
});

describe("Pflege", () => {
  const verknuepft = verknuepfeProdukte(PRODUKTE, [...STAMM, normalisiereStamm({ id: "gurke", name: "Gurke", klasse: "frisch" })]).produkte;

  it("zusammenfuehren hängt Zeilen um, sammelt Aliase und füllt leere Zielwerte", () => {
    const stamm = [...STAMM.map((z) => (z.id === "gurkenwuerfel" ? { ...z, aliase: ["Gurkenwürfel"], klasse: null } : z)), normalisiereStamm({ id: "gurke", name: "Gurke", klasse: "frisch", aliase: ["Salatgurke"] })];
    const produkte = verknuepfeProdukte(PRODUKTE, stamm).produkte;
    expect(produkte[1].zutaten[1].zutat_id).toBe("gurke");
    const r = zusammenfuehren({ zutaten: stamm, produkte }, "gurkenwuerfel", "gurke");
    expect(r.zeilen).toBe(1);
    expect(r.zutaten.map((z) => z.id)).toEqual(["gurkenwuerfel", "salatmix", "ei-gekocht"]);
    expect(r.zutaten[0]).toMatchObject({ aliase: ["Gurkenwürfel", "Gurke", "Salatgurke"], klasse: "frisch", arbeitseinheit: { name: "Stück", gramm: 470 } });
    expect(r.produkte[1].zutaten[1].zutat_id).toBe("gurkenwuerfel");
    expect(zusammenfuehren({ zutaten: stamm, produkte }, "gurke", "gurke").zeilen).toBe(0);
    expect(zusammenfuehren({ zutaten: stamm, produkte }, "x", "gurke").zutaten).toBe(stamm);
  });

  it("stempleStamm schreibt Ausbeute und Stückgewicht in die verknüpften Zeilen", () => {
    const normalisiere = (z) => ({ ...z, cost: 1 });
    // „Gurke" ist Alias von Gurkenwürfel UND Name der späteren Zutat „gurke" — der erste im Stamm gewinnt,
    // also hängen beide Zeilen an gurkenwuerfel
    const r = stempleStamm(verknuepft, { id: "gurkenwuerfel", ausbeute_prozent: 75 }, normalisiere);
    expect(r.zeilen).toBe(2);
    expect(r.produkte[0].zutaten[1]).toMatchObject({ ausbeute_prozent: 75, cost: 1, gramm_je_stueck: 450.045 });
    expect(r.produkte[1].zutaten[1]).toMatchObject({ ausbeute_prozent: 75, cost: 1 });
    expect(r.produkte[1].zutaten[0]).toBe(verknuepft[1].zutaten[0]);
    const ei = stempleStamm(verknuepft, { id: "ei-gekocht", ausbeute_prozent: null, stueck_gramm: 55 }, normalisiere);
    expect(ei.produkte[0].zutaten[2]).toMatchObject({ gramm_je_stueck: 55, ausbeute_prozent: null });
    expect(stempleStamm(verknuepft, { id: "ei-gekocht", stueck_gramm: 50 }).zeilen).toBe(0);
    expect(stempleStamm(verknuepft, null).produkte).toBe(verknuepft);
  });

  it("bereinigeStueckgewichte nimmt die Altlast aus Nicht-Stück-Zeilen", () => {
    const r = bereinigeStueckgewichte(PRODUKTE);
    expect(r.zeilen).toBe(2); // Gurkenwürfel 450, Banane 1000
    expect(r.produkte[0].zutaten[1]).not.toHaveProperty("gramm_je_stueck");
    expect(r.produkte[0].zutaten[2].gramm_je_stueck).toBe(50); // Stück bleibt
    expect(bereinigeStueckgewichte(r.produkte).zeilen).toBe(0);
  });

  it("importiereZutaten: Upsert je id, Entfernen, Zählung", () => {
    const r = importiereZutaten(STAMM, [{ id: "salatmix", name: "Salatmix", klasse: "frisch" }, { name: "Tomate", arbeitseinheit: { name: "Stück", gramm: 100 } }, { name: "" }], ["ei-gekocht"]);
    expect(r).toMatchObject({ neu: 1, geaendert: 1, entfernt: 1 });
    expect(r.zutaten.map((z) => z.id)).toEqual(["gurkenwuerfel", "salatmix", "tomate"]);
    expect(r.zutaten[1]).toMatchObject({ klasse: "frisch", arbeitseinheit: { name: "Beutel", gramm: 1000 } });
    expect(importiereZutaten(STAMM, [{ id: "salatmix", name: "Salatmix" }]).geaendert).toBe(0);
  });

  it("stammBefunde", () => {
    const b = stammBefunde([...STAMM, normalisiereStamm({ id: "falafel", name: "Falafel", einheit: "stk" })], verknuepft);
    expect(b.stueckOhneGewicht).toEqual(["Falafel"]);
    expect(b.ohneArtikel).toBe(1);
    expect(b.ohneArbeitseinheit).toBe(1);
    expect(b.ohneRezept).toEqual(["Falafel"]);
    expect(b.konflikte).toEqual([]);
  });
});
