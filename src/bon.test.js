import { describe, it, expect } from "vitest";
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen,
         VORLAGE_FALLBACK, aufloeseVorlage, renderBon,
         bonStatus, bonsAlsCsv, bonsAlsJson } from "./bon.js";

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

describe("aufloeseVorlage", () => {
  const vorlagen = { _default: "STANDARD", Bowls: "BOWL-VORLAGE", Wraps: null };

  it("nimmt die eigene Vorlage der Warengruppe", () => {
    expect(aufloeseVorlage("Bowls", vorlagen)).toBe("BOWL-VORLAGE");
  });

  it("erbt den Standard bei null", () => {
    expect(aufloeseVorlage("Wraps", vorlagen)).toBe("STANDARD");
  });

  it("erbt den Standard bei fehlendem Schluessel", () => {
    expect(aufloeseVorlage("Smoothies", vorlagen)).toBe("STANDARD");
  });

  it("faellt ohne jede Pflege auf den Fallback zurueck", () => {
    expect(aufloeseVorlage("Bowls", {})).toBe(VORLAGE_FALLBACK);
    expect(aufloeseVorlage("Bowls", null)).toBe(VORLAGE_FALLBACK);
  });

  it("behandelt eine leere Vorlage wie nicht gepflegt", () => {
    expect(aufloeseVorlage("Bowls", { _default: "STANDARD", Bowls: "   " })).toBe("STANDARD");
  });
});

describe("renderBon", () => {
  const basis = {
    name: "Green Booster",
    gruppe: "Smoothies",
    untergruppe: null,
    vk_out_brutto: 5.9,
    zutaten: [
      { name: "Babyspinat", menge_g: 30 },
      { name: "Banane", menge_g: 100 },
    ],
  };
  const vorlagen = {
    _default: "{produkt}\n{gruppe} VK {vk}\n{untergruppe}\n---\n{zutaten}\n---\n{schritte}\n{hinweise}",
  };

  it("setzt Kopf und Live-Zutaten ein", () => {
    expect(renderBon(basis, vorlagen)).toBe(
      "Green Booster\n" +
      "Smoothies VK 5,90 €\n" +
      "---\n" +
      "Babyspinat 30 g\n" +
      "Banane 100 g\n" +
      "---"
    );
  });

  it("laesst die Zeile eines leeren Einzelplatzhalters entfallen", () => {
    expect(renderBon(basis, vorlagen)).not.toContain("\n\n");
  });

  it("nummeriert Schritte und markiert Hinweise", () => {
    const p = { ...basis, bon_schritte: "Spinat in den Mixer\n\nBanane dazu", bon_hinweise: "Nicht daempfen" };
    const text = renderBon(p, vorlagen);
    expect(text).toContain("1. Spinat in den Mixer");
    expect(text).toContain("2. Banane dazu");
    expect(text).toContain("! Nicht daempfen");
  });

  it("ersetzt bei Override die komplette Vorlage", () => {
    const p = { ...basis, bon_override: "NUR DAS: {produkt}" };
    expect(renderBon(p, vorlagen)).toBe("NUR DAS: Green Booster");
  });

  it("nutzt die Vorlage der Warengruppe", () => {
    const p = { ...basis, gruppe: "Bowls" };
    const v = { ...vorlagen, Bowls: "BOWL {produkt}" };
    expect(renderBon(p, v)).toBe("BOWL Green Booster");
  });

  it("haelt die Bonbreite ein", () => {
    const p = { ...basis, bon_schritte: "Erst die Sauce auf den Boden geben, dann den Salat locker darauf schichten" };
    for (const z of renderBon(p, vorlagen).split("\n")) {
      expect(z.length).toBeLessThanOrEqual(BON_BREITE);
    }
  });

  it("vertraegt ein Produkt ohne jede Bon-Pflege und ohne Vorlagen", () => {
    const text = renderBon(basis, {});
    expect(text).toContain("Green Booster");
    expect(text).toContain("Babyspinat 30 g");
  });

  it("liefert fuer kein Produkt einen leeren String", () => {
    expect(renderBon(null, vorlagen)).toBe("");
  });
});

describe("bonStatus", () => {
  it("meldet auto ohne jede Pflege", () => {
    expect(bonStatus({ name: "A" })).toBe("auto");
  });
  it("meldet gepflegt bei Schritten", () => {
    expect(bonStatus({ bon_schritte: "Mixen" })).toBe("gepflegt");
  });
  it("meldet abweichend bei eigenen Zutaten", () => {
    expect(bonStatus({ bon_zutaten: "Sauce 40 g", bon_schritte: "Mixen" })).toBe("abweichend");
  });
  it("meldet abweichend bei Override", () => {
    expect(bonStatus({ bon_override: "frei" })).toBe("abweichend");
  });
});

describe("Export", () => {
  const produkte = [
    { id: "a", name: "Green Booster", gruppe: "Smoothies", zutaten: [{ name: "Banane", menge_g: 100 }] },
  ];
  const vorlagen = { _default: "{produkt}\n{zutaten}" };

  it("baut CSV mit BOM, Semikolon und maskierten Feldern", () => {
    const csv = bonsAlsCsv(produkte, vorlagen);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("produkt;gruppe;bon_text");
    expect(csv).toContain(`"Green Booster";"Smoothies";"Green Booster\nBanane 100 g"`);
  });

  it("verdoppelt Anfuehrungszeichen im Text", () => {
    const csv = bonsAlsCsv([{ id: "b", name: `Der "Grosse"`, gruppe: "Bowls" }], { _default: "{produkt}" });
    expect(csv).toContain(`"Der ""Grosse"""`);
  });

  it("baut JSON mit Vorlagen und gerendertem Text", () => {
    const obj = JSON.parse(bonsAlsJson(produkte, vorlagen, "2026-08-04"));
    expect(obj.stand).toBe("2026-08-04");
    expect(obj.bon_vorlagen).toEqual(vorlagen);
    expect(obj.bons).toHaveLength(1);
    expect(obj.bons[0]).toMatchObject({ id: "a", name: "Green Booster", gruppe: "Smoothies" });
    expect(obj.bons[0].bon_text).toContain("Banane 100 g");
  });
});
