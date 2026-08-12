import { describe, it, expect } from "vitest";
import { normalisiereNummer, verarbeitePreisimport, erkenneSpalten, spaltenSignatur } from "./preisimport.js";

// Nachbauten echter Stammartikel (Struktur aus rezeptdatenbank.json)
const ROTKOHL = {
  ingredient_name: "Rotkohl eingelegt", article_number: "810035.0", unit: "g",
  package_size: 1500, package_price: 6.38, gross_weight: 1000,
  gross_price: 4.253333333, net_weight: 1000, net_price_per_unit: 4.253333333,
  price_per_gram_ml: 0.004253333333, date_last_checked: "2025-03-21 00:00:00",
};
const EIER = {
  ingredient_name: "Eier", article_number: "103640.0", unit: "stück",
  package_size: 30, package_price: 8.45, price_per_gram_ml: 0.0002816666667,
  net_price_per_unit: 0.2816666667, date_last_checked: "2025-03-21 00:00:00",
};
const MINZE = {
  ingredient_name: "Minze", article_number: "Z009", unit: "kg",
  package_size: 0.1, package_price: 3.3, price_per_gram_ml: 0.033,
  date_last_checked: "2025-03-21 00:00:00",
};

const LISTE = {
  "rotkohl eingelegt": ROTKOHL,
  "eier": EIER,
  "minze": MINZE,
};

const HEUTE = new Date("2026-08-12T10:00:00Z");

describe("normalisiereNummer", () => {
  it("entfernt Float-Reste aus dem Excel-Erbe", () => {
    expect(normalisiereNummer("810035.0")).toBe("810035");
    expect(normalisiereNummer(810035.0)).toBe("810035");
    expect(normalisiereNummer(" 680 ")).toBe("680");
  });

  it("laesst Platzhalter und Texte unangetastet, nur kleingeschrieben", () => {
    expect(normalisiereNummer("Z009")).toBe("z009");
    expect(normalisiereNummer(null)).toBe("");
  });

  it("entfernt fuehrende Nullen, damit CSV-Formatierung nicht entscheidet", () => {
    expect(normalisiereNummer("0680")).toBe("680");
  });
});

describe("verarbeitePreisimport - Matching", () => {
  it("matcht ueber die Artikelnummer trotz Float-Rest im Stamm", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Rotkohl eingel. 1,5kg EIMER", preis: 6.99, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(Object.keys(r.patches)).toEqual(["rotkohl eingelegt"]);
    expect(r.geaendert).toBe(1);
    expect(r.ohneMatch).toHaveLength(0);
  });

  it("faellt auf den exakten Namen zurueck, wenn die Nummer fehlt", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Eier", preis: 8.45, artNr: "" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches["eier"]).toBeDefined();
  });

  it("macht KEIN Fuzzy-Matching (die Tomatenwuerfel-Lehre)", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Rotkohl", preis: 6.99, artNr: "999999" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });

  it("Z-Platzhalternummern im Stamm sind nicht matchbar", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "irgendwas", preis: 3.5, artNr: "Z009" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });
});

describe("verarbeitePreisimport - Preise und Stempel", () => {
  it("skaliert alle Preisfelder proportional zum neuen Gebindepreis", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 7.018, artNr: "810035" }], // +10 %
      priceList: LISTE, heute: HEUTE,
    });
    const neu = r.patches["rotkohl eingelegt"];
    expect(neu.package_price).toBeCloseTo(7.018, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.004253333333 * 1.1, 9);
    expect(neu.net_price_per_unit).toBeCloseTo(4.253333333 * 1.1, 6);
    expect(neu.date_last_checked).toBe("2026-08-12 00:00:00");
  });

  it("Stueckartikel: Gebindepreis gilt je VE, Preisfelder skalieren mit", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 9.3, artNr: "103640" }],
      priceList: LISTE, heute: HEUTE,
    });
    const neu = r.patches["eier"];
    expect(neu.package_price).toBeCloseTo(9.3, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.0002816666667 * (9.3 / 8.45), 9);
  });

  it("unveraenderter Preis: nur der Pruefstempel wird gesetzt", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 6.38, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.geaendert).toBe(0);
    expect(r.unveraendert).toBe(1);
    const neu = r.patches["rotkohl eingelegt"];
    expect(neu.package_price).toBeCloseTo(6.38, 6);
    expect(neu.price_per_gram_ml).toBeCloseTo(0.004253333333, 9);
    expect(neu.date_last_checked).toBe("2026-08-12 00:00:00");
  });

  it("Grundpreis-Semantik rechnet EUR/kg auf das Gebinde um", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 4.6, artNr: "810035" }], // 4,60 EUR/kg x 1,5 kg
      priceList: LISTE, semantik: "grundpreis", heute: HEUTE,
    });
    expect(r.patches["rotkohl eingelegt"].package_price).toBeCloseTo(6.9, 4);
  });

  it("Grundpreis auf Stueckartikel ist nicht ableitbar und faellt in ohneMatch", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 4.6, artNr: "103640" }],
      priceList: LISTE, semantik: "grundpreis", heute: HEUTE,
    });
    expect(r.patches).toEqual({});
    expect(r.ohneMatch).toHaveLength(1);
  });
});

describe("verarbeitePreisimport - Berichte", () => {
  it("meldet Stammartikel, deren Nummer in der CSV fehlt, als veraltet", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "", preis: 6.99, artNr: "810035" }],
      priceList: LISTE, heute: HEUTE,
    });
    // Eier (103640) fehlen in der CSV -> veraltet-Kandidat; Minze (Z009) nicht gemeldet
    expect(r.veraltet.map(a => a.ingredient_name)).toEqual(["Eier"]);
  });

  it("ohne Nummern in der CSV gibt es keine Veraltet-Liste", () => {
    const r = verarbeitePreisimport({
      zeilen: [{ name: "Eier", preis: 8.45, artNr: "" }],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.veraltet).toEqual([]);
  });

  it("doppelte CSV-Zeilen je Artikel: die letzte gewinnt, gezaehlt wird je Zeile", () => {
    const r = verarbeitePreisimport({
      zeilen: [
        { name: "", preis: 7.0, artNr: "810035" },
        { name: "", preis: 7.5, artNr: "810035" },
      ],
      priceList: LISTE, heute: HEUTE,
    });
    expect(r.patches["rotkohl eingelegt"].package_price).toBeCloseTo(7.5, 6);
  });
});

// ---------------------------------------------------------------------------
// Spaltenerkennung: NACH INHALT, nicht nach Kopfzeile. Der Kopf darf nur noch
// Bonus sein. Ausloeser: Susannes Export vom 11.08.2026 - "Artikeltext1" stand
// auf keiner Kandidatenliste, das Pflichtfeld blieb leer, der Knopf grau. Und
// drei Spalten beginnen dort mit "Preis", von denen zwei Unsinn enthalten.
// ---------------------------------------------------------------------------

// Susannes echter TG-Export (Spaltenfolge wie geliefert)
const TG_EXPORT = [
  { "Position OS": "10", "Artikelnr": "810035", "Artikeltext1": "Rotkohl eingelegt fein geschnitten", "Artikeltext2": "1,5 kg Eimer", "Anbruch": "",  "Inhalt": "1,500",  "Einheit": "PG", "Preis pro Einzelheit": "6,38",  "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
  { "Position OS": "20", "Artikelnr": "103640", "Artikeltext1": "Eier Freiland Groesse M gekocht",    "Artikeltext2": "30 Stueck",    "Anbruch": "A", "Inhalt": "30,000", "Einheit": "ST", "Preis pro Einzelheit": "8,45",  "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
  { "Position OS": "30", "Artikelnr": "204411", "Artikeltext1": "Tomatenwuerfel in eigenem Saft",     "Artikeltext2": "2,5 kg Dose",  "Anbruch": "",  "Inhalt": "2,500",  "Einheit": "PG", "Preis pro Einzelheit": "3,29",  "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
  { "Position OS": "40", "Artikelnr": "551020", "Artikeltext1": "Olivenoel nativ extra kaltgepresst", "Artikeltext2": "5 l Kanister", "Anbruch": "",  "Inhalt": "5,000",  "Einheit": "LT", "Preis pro Einzelheit": "42,90", "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
  { "Position OS": "50", "Artikelnr": "660112", "Artikeltext1": "Haferflocken zart Grossgebinde",     "Artikeltext2": "10 kg Sack",   "Anbruch": "A", "Inhalt": "10,000", "Einheit": "KG", "Preis pro Einzelheit": "17,55", "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
  { "Position OS": "60", "Artikelnr": "770223", "Artikeltext1": "Mandelmilch ungesuesst Barista",     "Artikeltext2": "12 x 1 l",     "Anbruch": "",  "Inhalt": "12,000", "Einheit": "PG", "Preis pro Einzelheit": "21,40", "Preis Herkunft": "v", "Preis gültig von": "10.08.2026" },
];
const TG_SPALTEN = [
  "Position OS", "Artikelnr", "Artikeltext1", "Artikeltext2", "Anbruch",
  "Inhalt", "Einheit", "Preis pro Einzelheit", "Preis Herkunft", "Preis gültig von",
];

describe("erkenneSpalten", () => {
  it("erkennt Susannes TG-Export inkl. Artikeltext1 und der echten Preisspalte", () => {
    expect(erkenneSpalten(TG_SPALTEN, TG_EXPORT)).toEqual({
      name: "Artikeltext1",
      preis: "Preis pro Einzelheit",
      einheit: "Einheit",
      artNr: "Artikelnr",
    });
  });

  it("„Preis Herkunft“ (nur der Buchstabe v) gewinnt die Preisrolle nie", () => {
    // Auch wenn die echte Preisspalte hinter ihr steht: Spaltenfolge darf nicht
    // entscheiden. Frueher gewann schlicht die erste Spalte mit "preis" im Kopf.
    const gedreht = [...TG_SPALTEN].reverse();
    const r = erkenneSpalten(gedreht, TG_EXPORT);
    expect(r.preis).toBe("Preis pro Einzelheit");
    expect(r.name).toBe("Artikeltext1");
    expect(r.einheit).toBe("Einheit");
    expect(r.artNr).toBe("Artikelnr");
  });

  it("erkennt die aeltere TG-Artikelliste", () => {
    const cols = ["Artikel", "Artikelkurztext", "VKP-ME", "Kundenpreis"];
    const zeilen = [
      { "Artikel": "810035", "Artikelkurztext": "Rotkohl eingelegt fein geschnitten", "VKP-ME": "KG", "Kundenpreis": "6,38" },
      { "Artikel": "103640", "Artikelkurztext": "Eier Freiland Groesse M gekocht",    "VKP-ME": "ST", "Kundenpreis": "8,45" },
      { "Artikel": "204411", "Artikelkurztext": "Tomatenwuerfel in eigenem Saft",     "VKP-ME": "PG", "Kundenpreis": "3,29" },
      { "Artikel": "551020", "Artikelkurztext": "Olivenoel nativ extra kaltgepresst", "VKP-ME": "LT", "Kundenpreis": "42,90" },
    ];
    expect(erkenneSpalten(cols, zeilen)).toEqual({
      name: "Artikelkurztext", preis: "Kundenpreis", einheit: "VKP-ME", artNr: "Artikel",
    });
  });

  it("erkennt auch bei nichtssagenden Kopfzeilen allein am Inhalt", () => {
    const cols = ["Spalte A", "Spalte B", "Spalte C", "Spalte D"];
    const zeilen = [
      { "Spalte A": "810035", "Spalte B": "Rotkohl eingelegt fein geschnitten", "Spalte C": "6,38",  "Spalte D": "PG" },
      { "Spalte A": "103640", "Spalte B": "Eier Freiland Groesse M gekocht",    "Spalte C": "8,45",  "Spalte D": "ST" },
      { "Spalte A": "204411", "Spalte B": "Tomatenwuerfel in eigenem Saft",     "Spalte C": "3,29",  "Spalte D": "PG" },
      { "Spalte A": "551020", "Spalte B": "Olivenoel nativ extra kaltgepresst", "Spalte C": "42,90", "Spalte D": "LT" },
      { "Spalte A": "660112", "Spalte B": "Haferflocken zart Grossgebinde",     "Spalte C": "17,55", "Spalte D": "KG" },
    ];
    expect(erkenneSpalten(cols, zeilen)).toEqual({
      name: "Spalte B", preis: "Spalte C", einheit: "Spalte D", artNr: "Spalte A",
    });
  });

  it("ohne preisartige Spalte bleibt preis leer statt falsch geraten", () => {
    const cols = ["Artikelnr", "Artikeltext1", "Einheit", "Gültig ab"];
    const zeilen = [
      { "Artikelnr": "810035", "Artikeltext1": "Rotkohl eingelegt fein geschnitten", "Einheit": "PG", "Gültig ab": "10.08.2026" },
      { "Artikelnr": "103640", "Artikeltext1": "Eier Freiland Groesse M gekocht",    "Einheit": "ST", "Gültig ab": "10.08.2026" },
      { "Artikelnr": "204411", "Artikeltext1": "Tomatenwuerfel in eigenem Saft",     "Einheit": "PG", "Gültig ab": "10.08.2026" },
    ];
    const r = erkenneSpalten(cols, zeilen);
    expect(r.preis).toBe("");
    expect(r.name).toBe("Artikeltext1");
    expect(r.artNr).toBe("Artikelnr");
  });

  it("die Gebindegroesse (Inhalt) stiehlt die Preisrolle nicht", () => {
    expect(erkenneSpalten(TG_SPALTEN, TG_EXPORT).preis).toBe("Preis pro Einzelheit");
    // ... auch dann nicht, wenn kein Kopf einen Preis verraet
    const cols = ["Text", "Menge", "Wert"];
    const zeilen = [
      { "Text": "Rotkohl eingelegt fein geschnitten", "Menge": "1,500",  "Wert": "6,38" },
      { "Text": "Eier Freiland Groesse M gekocht",    "Menge": "30,000", "Wert": "8,45" },
      { "Text": "Tomatenwuerfel in eigenem Saft",     "Menge": "2,500",  "Wert": "3,29" },
      { "Text": "Olivenoel nativ extra kaltgepresst", "Menge": "5,000",  "Wert": "42,90" },
    ];
    expect(erkenneSpalten(cols, zeilen).preis).toBe("Wert");
  });

  it("ohne Zeilen liefert sie leere Zuordnungen statt zu raten", () => {
    expect(erkenneSpalten(TG_SPALTEN, [])).toEqual({ name: "", preis: "", einheit: "", artNr: "" });
  });
});

describe("spaltenSignatur", () => {
  it("ist unabhaengig von Reihenfolge, Gross-/Kleinschreibung und Leerraum", () => {
    expect(spaltenSignatur(["Artikel", "Kundenpreis", "VKP-ME"]))
      .toBe(spaltenSignatur([" vkp-me ", "artikel", "KUNDENPREIS"]));
  });

  it("eine zusaetzliche Spalte ergibt eine andere Signatur", () => {
    expect(spaltenSignatur(["Artikel", "Kundenpreis"]))
      .not.toBe(spaltenSignatur(["Artikel", "Kundenpreis", "VKP-ME"]));
  });

  it("liefert fuer leere Spaltenlisten einen stabilen Schluessel", () => {
    expect(spaltenSignatur([])).toBe(spaltenSignatur(undefined));
  });
});
