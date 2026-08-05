import { describe, it, expect } from "vitest";
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen,
         VORLAGE_FALLBACK, standardVorlage, aufloeseVorlage, renderBon,
         bonStatus, bonsAlsCsv, bonsAlsJson } from "./bon.js";

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
    const zeilen = wrapZeile(text, BON_BREITE, "  ");
    expect(zeilen.length).toBeGreaterThan(1);
    for (const z of zeilen) {
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
      { name: "Banane", menge_g: 100, bon_anweisung: "Zum Schluss dazu" },
      { name: "Deko", menge_g: 0 },
    ],
  };

  it("staffelt Menge, Zutat und Anweisung untereinander", () => {
    expect(zutatenZeilen(produkt)).toEqual([
      "30 g",
      "  Babyspinat",
      "100 g",
      "  Banane",
      "  > Zum Schluss dazu",
    ]);
  });

  it("nimmt das Kuechenmass statt der Gramm, wenn gepflegt", () => {
    const p = { zutaten: [{ name: "Gurkenwuerfel", menge_g: 40, bon_menge: "1/4 Cup (40 g)" }] };
    expect(zutatenZeilen(p)).toEqual(["1/4 Cup (40 g)", "  Gurkenwuerfel"]);
  });

  it("behaelt eine Zutat mit Kuechenmass auch ohne Gramm", () => {
    const p = { zutaten: [{ name: "Salz", menge_g: 0, bon_menge: "1 Prise" }] };
    expect(zutatenZeilen(p)).toEqual(["1 Prise", "  Salz"]);
  });

  it("nimmt den abweichenden Text, wenn gepflegt", () => {
    const p = { ...produkt, bon_zutaten: "Sauce Green Goddess 40 g\n  Salatmix 120 g\n\n" };
    expect(zutatenZeilen(p)).toEqual(["Sauce Green Goddess 40 g", "Salatmix 120 g"]);
  });

  it("faellt bei leerem Text auf die Rezeptur zurueck", () => {
    expect(zutatenZeilen({ ...produkt, bon_zutaten: "   " })).toEqual([
      "30 g",
      "  Babyspinat",
      "100 g",
      "  Banane",
      "  > Zum Schluss dazu",
    ]);
  });

  it("vertraegt ein Produkt ohne Zutaten und ein kaputtes Zutatenfeld", () => {
    expect(zutatenZeilen({ name: "Leer" })).toEqual([]);
    expect(zutatenZeilen({ zutaten: "nicht-array" })).toEqual([]);
  });

  it("ueberspringt Zutaten ohne brauchbaren Namen", () => {
    const p = {
      name: "X",
      zutaten: [
        { menge_g: 30 },
        { name: "", menge_g: 20 },
        { name: "   ", menge_g: 15 },
        { name: "Banane", menge_g: 100 },
      ],
    };
    expect(zutatenZeilen(p)).toEqual(["100 g", "  Banane"]);
  });
});

describe("standardVorlage", () => {
  it("nimmt den gepflegten Standard", () => {
    expect(standardVorlage({ _default: "STANDARD" })).toBe("STANDARD");
  });

  it("faellt ohne gepflegten Standard auf den Fallback zurueck", () => {
    expect(standardVorlage({})).toBe(VORLAGE_FALLBACK);
    expect(standardVorlage(null)).toBe(VORLAGE_FALLBACK);
    expect(standardVorlage({ _default: "   " })).toBe(VORLAGE_FALLBACK);
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
    // Label und Platzhalter zusammen auf einer eigenen Zeile ("VK {vk}"),
    // nicht gemischt mit einem anderen Platzhalter ("{gruppe} VK {vk}") -
    // siehe die Konvention bei ersetzeBekannte() in bon.js.
    _default: "{produkt}\n{gruppe}\nVK {vk}\n{untergruppe}\n---\n{zutaten}\n---\n{schritte}\n{hinweise}",
  };

  it("setzt Kopf und Live-Zutaten ein", () => {
    expect(renderBon(basis, vorlagen)).toBe(
      "Green Booster\n" +
      "Smoothies\n" +
      "VK 5,90 €\n" +
      "---\n" +
      "30 g\n" +
      "  Babyspinat\n" +
      "100 g\n" +
      "  Banane\n" +
      "---"
    );
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
    const zeilen = renderBon(p, vorlagen).split("\n");
    expect(zeilen.length).toBeGreaterThan(1);
    for (const z of zeilen) {
      expect(z.length).toBeLessThanOrEqual(BON_BREITE);
    }
  });

  it("vertraegt ein Produkt ohne jede Bon-Pflege und ohne Vorlagen", () => {
    const text = renderBon(basis, {});
    expect(text).toContain("Green Booster");
    expect(text).toContain("30 g");
    expect(text).toContain("Babyspinat");
  });

  it("rendert den Fallback-Bon exakt, wenn keine Vorlage gepflegt ist", () => {
    const trenner = "-".repeat(BON_BREITE);
    expect(renderBon(basis, {})).toBe(
      "Green Booster\n" +
      "Smoothies\n" +
      trenner + "\n" +
      "30 g\n" +
      "  Babyspinat\n" +
      "100 g\n" +
      "  Banane\n" +
      trenner + "\n" +
      "Reihenfolge = Bau-Reihenfolge von oben nach\n" +
      "unten."
    );
  });

  it("liefert fuer kein Produkt einen leeren String", () => {
    expect(renderBon(null, vorlagen)).toBe("");
  });

  it("haelt beim Umbruch den Einzug der Zutatenzeile", () => {
    const p = { zutaten: [{ name: "Eine sehr lange Zutatenbezeichnung die umbrechen muss weil sie nicht passt", menge_g: 30 }] };
    const zeilen = renderBon(p, { _default: "{zutaten}" }).split("\n");
    expect(zeilen[0]).toBe("30 g");
    expect(zeilen[1].startsWith("  ")).toBe(true);
    expect(zeilen[2].startsWith("    ")).toBe(true);
    for (const z of zeilen) expect(z.length).toBeLessThanOrEqual(BON_BREITE);
  });

  it("setzt die Kampagne ein und laesst die Zeile ohne Kampagne entfallen", () => {
    const v = { _default: "{produkt}\n{kampagne}" };
    expect(renderBon({ name: "A", kampagne: "Seoul Mate" }, v)).toBe("A\nSeoul Mate");
    expect(renderBon({ name: "A" }, v)).toBe("A");
  });
});

describe("renderBon - Preis", () => {
  // Reine {vk}-Zeile: unbepreiste Produkte (0, null, undefined) zeigen keinen
  // Preis. Ein falscher Preis (0,00 €) waere schlimmer als gar keiner.
  const vorlagen = { _default: "{produkt}\n{vk}" };

  it.each([0, null, undefined])("zeigt keine Preiszeile, wenn vk_out_brutto=%s ist", (vk) => {
    const p = { name: "Ohne Preis", gruppe: "Smoothies", vk_out_brutto: vk };
    expect(renderBon(p, vorlagen)).toBe("Ohne Preis");
  });

  it("zeigt den Preis, wenn er gepflegt ist", () => {
    const p = { name: "Mit Preis", vk_out_brutto: 5.9 };
    expect(renderBon(p, vorlagen)).toBe("Mit Preis\n5,90 €");
  });
});

describe("renderBon - gemischte Platzhalter-Zeilen", () => {
  it("laesst eine gemischte Zeile weg, wenn alle darin vorkommenden Platzhalter leer sind", () => {
    const p = { name: "X", gruppe: "", vk_out_brutto: 0 };
    expect(renderBon(p, { _default: "{gruppe} VK {vk}" })).toBe("");
  });

  it("behaelt eine gemischte Zeile, wenn mindestens ein Platzhalter gefuellt ist", () => {
    const p = { name: "X", gruppe: "", vk_out_brutto: 5.9 };
    expect(renderBon(p, { _default: "{gruppe} VK {vk}" })).toBe("VK 5,90 €");
  });

  it("laesst Zeilen ohne bekannten Platzhalter immer stehen", () => {
    const p = { name: "X" };
    expect(renderBon(p, { _default: "---" })).toBe("---");
  });

  it("laesst unbekannte Platzhalter woertlich im Bon stehen", () => {
    const p = { name: "X" };
    expect(renderBon(p, { _default: "{filiale}" })).toBe("{filiale}");
  });

  it("laesst die Zeile stehen, wenn ein unbekannter Platzhalter neben einem leeren bekannten steht", () => {
    // Ohne diese Regel wuerde ein leerer {vk} die ganze Zeile inklusive des
    // unbekannten {filiale} loeschen - Widerspruch zum Test darueber.
    const p = { name: "X", vk_out_brutto: 0 };
    expect(renderBon(p, { _default: "{filiale} {vk}" })).toBe("{filiale}");
  });

  it("dokumentiert die Kehrseite der Konvention: gefuellte Gruppe + leerer VK auf einer Zeile ergibt ein nacktes Label", () => {
    // Bewusst als erwartetes Verhalten festgeschrieben, nicht als Bug: Label
    // und Platzhalter gehoeren auf eine eigene Zeile ("VK {vk}"). Wer sie mit
    // einem anderen gefuellten Platzhalter mischt, bekommt bei leerem Wert
    // ein Label ohne Wert - das kann das Modul nicht erkennen, da es nicht
    // wissen kann, dass "VK" inhaltlich zu {vk} gehoert.
    const p = { name: "X", gruppe: "Smoothies", vk_out_brutto: 0 };
    expect(renderBon(p, { _default: "{gruppe} VK {vk}" })).toBe("Smoothies VK");
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
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("produkt;gruppe;bon_text");
    expect(csv).toContain(`"Green Booster";"Smoothies";"Green Booster\n100 g\n  Banane"`);
  });

  it("verdoppelt Anfuehrungszeichen im Text", () => {
    const csv = bonsAlsCsv([{ id: "b", name: `Der "Grosse"`, gruppe: "Bowls" }], { _default: "{produkt}" });
    expect(csv).toContain(`"Der ""Grosse"""`);
  });

  it("vertraegt Zutaten, die kein Array sind, ohne den gesamten Export abzureissen", () => {
    const kaputt = [
      { id: "a", name: "Kaputt", gruppe: "Smoothies", zutaten: "nicht-array" },
      { id: "b", name: "Heil", gruppe: "Bowls", zutaten: [{ name: "Reis", menge_g: 50 }] },
    ];
    expect(() => bonsAlsCsv(kaputt, vorlagen)).not.toThrow();
    const csv = bonsAlsCsv(kaputt, vorlagen);
    expect(csv).toContain("50 g");
    expect(csv).toContain("Reis");
  });

  it("baut JSON mit Vorlagen und gerendertem Text", () => {
    const obj = JSON.parse(bonsAlsJson(produkte, vorlagen, "2026-08-04"));
    expect(obj.stand).toBe("2026-08-04");
    expect(obj.bon_vorlagen).toEqual(vorlagen);
    expect(obj.bons).toHaveLength(1);
    expect(obj.bons[0]).toMatchObject({ id: "a", name: "Green Booster", gruppe: "Smoothies" });
    expect(obj.bons[0].bon_text).toContain("100 g");
    expect(obj.bons[0].bon_text).toContain("Banane");
  });

  it("defaultet stand auf das heutige Datum, wenn keins uebergeben wird", () => {
    const obj = JSON.parse(bonsAlsJson(produkte, vorlagen));
    expect(obj.stand).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("bonsAlsCsv ueberspringt null/Nicht-Objekt-Eintraege statt den Export abzureissen", () => {
    const kaputt = [null, { id: "a", name: "X", gruppe: "Y" }];
    expect(() => bonsAlsCsv(kaputt, vorlagen)).not.toThrow();
    expect(bonsAlsCsv(kaputt, vorlagen)).toContain("X");
  });

  it("bonsAlsJson ueberspringt null/Nicht-Objekt-Eintraege statt den Export abzureissen", () => {
    const kaputt = [null, { id: "a", name: "X", gruppe: "Y" }];
    expect(() => bonsAlsJson(kaputt, vorlagen, "2026-08-04")).not.toThrow();
    const obj = JSON.parse(bonsAlsJson(kaputt, vorlagen, "2026-08-04"));
    expect(obj.bons).toHaveLength(1);
  });
});
