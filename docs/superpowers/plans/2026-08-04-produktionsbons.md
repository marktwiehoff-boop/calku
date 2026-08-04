# Produktionsbons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer Reiter „Produktionsbons" in CALKU, in dem je Rezept eine druckfertige Produktionsanleitung entsteht — aus einer Vorlage je Warengruppe plus den Live-Zutaten aus der Rezeptur — und als CSV/JSON für SIDES exportiert wird.

**Architecture:** Die gesamte Bon-Logik ist pur und liegt in `src/bon.js` (keine React-Abhängigkeit, mit Vitest getestet). Die Oberfläche besteht aus drei neuen, schlanken Komponenten-Dateien, damit `src/App.jsx` (3367 Zeilen) nicht weiter wächst: `BonsTab.jsx` (Layout + Rezeptliste + Export), `BonEditor.jsx` (Felder + Vorschau) und `BonVorlagenEditor.jsx` (Kopfbereich). `App.jsx` bekommt nur State, Persistenz und die Tab-Verdrahtung.

**Tech Stack:** Vite 6, React 18, Tailwind, Vitest (neu, nur für `src/bon.js`), Supabase (bestehend, keine Schema-Änderung).

**Spec:** `docs/superpowers/specs/2026-08-04-produktionsbons-design.md`

---

## Dateiübersicht

| Datei | Verantwortung |
|---|---|
| `src/bon.js` (neu) | Reine Logik: Zeilenumbruch, Zutaten-/Schritt-/Hinweiszeilen, Vorlagen-Auflösung, `renderBon`, Export-Formate, Status |
| `src/bon.test.js` (neu) | Vitest-Tests für `src/bon.js` |
| `src/BonVorlagenEditor.jsx` (neu) | Kopfbereich: Vorlage je Warengruppe + Standard, Platzhalter-Legende |
| `src/BonEditor.jsx` (neu) | Rechte Spalte: Zutaten/Schritte/Hinweise/Override + Bon-Vorschau + Kopieren |
| `src/BonsTab.jsx` (neu) | Tab-Layout: Kopfbereich, Rezeptliste links, Editor rechts, Export-Button |
| `src/App.jsx` (ändern) | `bonVorlagen`-State, Laden/Speichern/Export, `handleBonFeld`, Tab-Eintrag + Rendering |
| `package.json` (ändern) | devDependency `vitest`, Script `test` |

**Wichtig für alle Tasks:** Deutsche Anführungszeichen („…") in JS-Strings **immer in Template-Literalen** (Backticks) schreiben. ASCII-`"` in solchen Strings bricht den esbuild-Build, der Fehler tarnt sich als IPC-Crash.

---

### Task 1: Vitest einrichten

**Files:**
- Modify: `package.json`
- Create: `src/bon.test.js`
- Create: `src/bon.js`

- [ ] **Step 1: Vitest installieren**

```bash
cd "C:/Users/Media/OneDrive/Desktop/08_Tech_und_Tools/immergrun-cowork/kalkulations-app-deploy"
npm install -D vitest@^2.1.8
```

Erwartet: Installation ohne Fehler. Falls „UNKNOWN: read"-Fehler (OneDrive-Eigenart): Befehl einfach erneut ausführen.

- [ ] **Step 2: Test-Script in `package.json` ergänzen**

Im Block `"scripts"` nach der Zeile `"preview": "vite preview"` ergänzen (Komma nach `vite preview` nicht vergessen):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Ersten Test schreiben**

Create `src/bon.test.js`:

```js
import { describe, it, expect } from "vitest";
import { BON_BREITE } from "./bon.js";

describe("bon", () => {
  it("kennt die Bonbreite", () => {
    expect(BON_BREITE).toBe(42);
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./bon.js"`

- [ ] **Step 5: Minimale Implementierung**

Create `src/bon.js`:

```js
// Reine Bon-Logik (ohne React). Einzige Stelle, an der ein Produktionsbon entsteht.
// Vorschau, Kopieren und Export nutzen alle renderBon().

export const BON_BREITE = 42; // Zeichen je Zeile, 80-mm-Thermodrucker
```

- [ ] **Step 6: Test laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 1 Test

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/bon.js src/bon.test.js
git commit -m "test: vitest fuer die Bon-Logik einrichten"
```

---

### Task 2: Zeilenumbruch auf 42 Zeichen

**Files:**
- Modify: `src/bon.js`
- Modify: `src/bon.test.js`

- [ ] **Step 1: Failing Tests schreiben**

In `src/bon.test.js` den Import erweitern und den Block anhängen:

```js
import { describe, it, expect } from "vitest";
import { BON_BREITE, wrapZeile } from "./bon.js";
```

```js
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `wrapZeile is not a function`

- [ ] **Step 3: Implementierung**

In `src/bon.js` anhängen:

```js
// Bricht einen Text auf die Bonbreite um. Folgezeilen bekommen den Einzug
// vorangestellt, damit fortgesetzte Zutaten/Schritte optisch eingerueckt sind.
export function wrapZeile(text, breite = BON_BREITE, einzug = "") {
  const roh = String(text ?? "").trim();
  if (!roh) return [""];

  const zeilen = [];
  let aktuell = "";
  const praefix = () => (zeilen.length === 0 ? "" : einzug);
  const maxLen  = () => Math.max(1, breite - praefix().length);
  const push    = () => { zeilen.push(praefix() + aktuell); aktuell = ""; };

  for (const wort of roh.split(/\s+/)) {
    let rest = wort;
    // Wort passt in keine ganze Zeile -> hart trennen
    while (rest.length > maxLen()) {
      if (aktuell) push();
      const schnitt = maxLen();
      zeilen.push(praefix() + rest.slice(0, schnitt));
      rest = rest.slice(schnitt);
    }
    if (!aktuell) aktuell = rest;
    else if (aktuell.length + 1 + rest.length <= maxLen()) aktuell += " " + rest;
    else { push(); aktuell = rest; }
  }
  if (aktuell) push();
  return zeilen;
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 6 Tests

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: Zeilenumbruch auf Bonbreite"
```

---

### Task 3: Zahlen-Formatierung und Zutatenzeilen

**Files:**
- Modify: `src/bon.js`
- Modify: `src/bon.test.js`

Zutaten kommen live aus `produkt.zutaten[].menge_g`, es sei denn `produkt.bon_zutaten` ist gepflegt — dann gilt dieser Freitext.

- [ ] **Step 1: Failing Tests schreiben**

Import in `src/bon.test.js` erweitern:

```js
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen } from "./bon.js";
```

Anhängen:

```js
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `formatMenge is not a function`

- [ ] **Step 3: Implementierung**

In `src/bon.js` anhängen:

```js
// Menge deutsch, ohne ueberfluessige Nullen: 30 -> "30", 2.5 -> "2,5"
export function formatMenge(v) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(+v || 0);
}

export function formatEuro(v) {
  const n = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+v || 0);
  return n + " €";
}

function textZeilen(wert) {
  return String(wert || "").split("\n").map(z => z.trim()).filter(Boolean);
}

// Zutatenblock: gepflegter Freitext schlaegt die Rezeptur, leer = live.
export function zutatenZeilen(produkt) {
  const eigen = textZeilen(produkt?.bon_zutaten);
  if (eigen.length) return eigen;
  return (produkt?.zutaten || [])
    .filter(z => (+z.menge_g || 0) > 0)
    .map(z => `${z.name} ${formatMenge(z.menge_g)} g`);
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 12 Tests

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: Zutatenzeilen und Formatierung fuer den Bon"
```

---

### Task 4: Vorlagen-Auflösung mit Vererbung

**Files:**
- Modify: `src/bon.js`
- Modify: `src/bon.test.js`

- [ ] **Step 1: Failing Tests schreiben**

Import erweitern:

```js
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen,
         VORLAGE_FALLBACK, aufloeseVorlage } from "./bon.js";
```

Anhängen:

```js
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `aufloeseVorlage is not a function`

- [ ] **Step 3: Implementierung**

In `src/bon.js` anhängen:

```js
const TRENNER = "-".repeat(BON_BREITE);

// Greift, solange keine Vorlage gepflegt ist - die App soll auch dann
// einen brauchbaren Bon zeigen.
export const VORLAGE_FALLBACK = [
  "{produkt}",
  "{gruppe}",
  TRENNER,
  "{zutaten}",
  TRENNER,
  "{schritte}",
  "{hinweise}",
].join("\n");

// Warengruppe > Standard > Fallback. Leere Strings gelten als nicht gepflegt.
export function aufloeseVorlage(gruppe, vorlagen) {
  const v = vorlagen || {};
  const eigen = v[gruppe];
  if (typeof eigen === "string" && eigen.trim()) return eigen;
  const std = v._default;
  if (typeof std === "string" && std.trim()) return std;
  return VORLAGE_FALLBACK;
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 17 Tests

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: Vorlagen je Warengruppe mit Vererbung auf den Standard"
```

---

### Task 5: renderBon — Herzstück

**Files:**
- Modify: `src/bon.js`
- Modify: `src/bon.test.js`

Regeln (aus der Spec): Override schlägt Vorlage; Zeile, die **nur** aus einem Platzhalter besteht und leer ist, entfällt komplett; Schritte werden nummeriert; Hinweise mit `! ` präfigiert; alles auf 42 Zeichen umgebrochen; maximal eine Leerzeile am Stück, keine am Anfang oder Ende.

- [ ] **Step 1: Failing Tests schreiben**

Import erweitern:

```js
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen,
         VORLAGE_FALLBACK, aufloeseVorlage, renderBon } from "./bon.js";
```

Anhängen:

```js
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `renderBon is not a function`

- [ ] **Step 3: Implementierung**

In `src/bon.js` anhängen:

```js
export function schritteZeilen(produkt) {
  return textZeilen(produkt?.bon_schritte).map((z, i) => `${i + 1}. ${z}`);
}

export function hinweisZeilen(produkt) {
  return textZeilen(produkt?.bon_hinweise).map(z => `! ${z}`);
}

// Hoechstens eine Leerzeile am Stueck, keine am Anfang oder Ende.
function verdichte(zeilen) {
  const out = [];
  for (const z of zeilen) {
    if (z === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(z);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// Der eine Weg vom Rezept zum Bon-Text.
export function renderBon(produkt, vorlagen) {
  if (!produkt) return "";

  const override = typeof produkt.bon_override === "string" ? produkt.bon_override.trim() : "";
  const vorlage  = override || aufloeseVorlage(produkt.gruppe, vorlagen);

  const werte = {
    "{produkt}":     produkt.name || "",
    "{gruppe}":      produkt.gruppe || "",
    "{untergruppe}": produkt.untergruppe || "",
    "{vk}":          produkt.vk_out_brutto != null ? formatEuro(produkt.vk_out_brutto) : "",
  };
  const bloecke = {
    "{zutaten}":  zutatenZeilen(produkt),
    "{schritte}": schritteZeilen(produkt),
    "{hinweise}": hinweisZeilen(produkt),
  };

  const aus = [];
  for (const zeile of String(vorlage).split("\n")) {
    const roh = zeile.trim();

    // Zeile besteht NUR aus einem Blockplatzhalter
    if (Object.prototype.hasOwnProperty.call(bloecke, roh)) {
      for (const b of bloecke[roh]) aus.push(...wrapZeile(b, BON_BREITE, "  "));
      continue;
    }
    // Zeile besteht NUR aus einem Einzelplatzhalter -> leer heisst: Zeile entfaellt
    if (Object.prototype.hasOwnProperty.call(werte, roh)) {
      if (!werte[roh]) continue;
      aus.push(...wrapZeile(werte[roh]));
      continue;
    }
    // Gemischte Zeile: alles ersetzen, Bloecke einzeilig zusammenziehen
    let text = zeile;
    for (const [k, v] of Object.entries(werte))   text = text.split(k).join(v);
    for (const [k, v] of Object.entries(bloecke)) text = text.split(k).join(v.join(" "));
    if (!text.trim()) { aus.push(""); continue; }
    aus.push(...wrapZeile(text));
  }
  return verdichte(aus);
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 25 Tests

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: renderBon als einzige Stelle fuer den Bon-Text"
```

---

### Task 6: Status je Rezept und Export-Formate

**Files:**
- Modify: `src/bon.js`
- Modify: `src/bon.test.js`

- [ ] **Step 1: Failing Tests schreiben**

Import erweitern:

```js
import { BON_BREITE, wrapZeile, formatMenge, formatEuro, zutatenZeilen,
         VORLAGE_FALLBACK, aufloeseVorlage, renderBon,
         bonStatus, bonsAlsCsv, bonsAlsJson } from "./bon.js";
```

Anhängen:

```js
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `bonStatus is not a function`

- [ ] **Step 3: Implementierung**

In `src/bon.js` anhängen:

```js
// "abweichend" = folgt der Rezeptur nicht mehr, "gepflegt" = Schritte da,
// "auto" = rein aus Vorlage + Live-Zutaten.
export function bonStatus(produkt) {
  const hat = (f) => typeof produkt?.[f] === "string" && produkt[f].trim().length > 0;
  if (hat("bon_override") || hat("bon_zutaten")) return "abweichend";
  if (hat("bon_schritte")) return "gepflegt";
  return "auto";
}

export function bonsAlsCsv(produkte, vorlagen) {
  const esc = (s) => `"${String(s ?? "").split(`"`).join(`""`)}"`;
  const zeilen = [["produkt", "gruppe", "bon_text"].join(";")];
  for (const p of produkte || []) {
    zeilen.push([esc(p.name), esc(p.gruppe), esc(renderBon(p, vorlagen))].join(";"));
  }
  // BOM, damit Excel die Umlaute richtig liest
  return "\uFEFF" + zeilen.join("\r\n");
}

export function bonsAlsJson(produkte, vorlagen, stand) {
  return JSON.stringify({
    stand,
    quelle: "calku",
    bon_vorlagen: vorlagen || {},
    bons: (produkte || []).map(p => ({
      id: p.id,
      name: p.name,
      gruppe: p.gruppe,
      bon_zutaten:  p.bon_zutaten  || null,
      bon_schritte: p.bon_schritte || null,
      bon_hinweise: p.bon_hinweise || null,
      bon_override: p.bon_override || null,
      bon_text: renderBon(p, vorlagen),
    })),
  }, null, 2);
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: PASS, 32 Tests

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: Bon-Status und Export als CSV und JSON"
```

---

### Task 7: State und Persistenz in App.jsx

**Files:**
- Modify: `src/App.jsx` (Zeilen 2690, 2721-2731, 2736, 2746-2754, 2764, 2781-2786, 2860-2868)

Ab hier keine Vitest-Tests mehr — verifiziert wird im Browser (Task 12).

- [ ] **Step 1: State anlegen**

In `src/App.jsx` die Zeile

```jsx
  const [letzterImport, setLetzterImport] = useState(null);
```

ersetzen durch:

```jsx
  const [letzterImport, setLetzterImport] = useState(null);
  // Bon-Vorlagen je Warengruppe + "_default"; leer = Fallback aus bon.js
  const [bonVorlagen, setBonVorlagen] = useState({});
```

- [ ] **Step 2: Laden aus der Cloud**

Nach dem Block

```jsx
          if (row.data.geloescht?.length) {
            setGeloeschteArtikel(row.data.geloescht);
            setPriceList(prev => { const m = { ...prev }; for (const k of row.data.geloescht) delete m[k]; return m; });
          }
```

einfügen:

```jsx
          if (row.data.bon_vorlagen) setBonVorlagen(row.data.bon_vorlagen);
```

- [ ] **Step 3: Live-Sync (Realtime) nachziehen**

Im `subscribeKalkulation`-Callback nach

```jsx
      if (data.geloescht) {
        setGeloeschteArtikel(data.geloescht);
        setPriceList(prev => { const m = { ...prev }; for (const k of data.geloescht) delete m[k]; return m; });
      }
```

einfügen:

```jsx
      if (data.bon_vorlagen) setBonVorlagen(data.bon_vorlagen);
```

- [ ] **Step 4: Beide Speicher-Aufrufe ergänzen**

Es gibt **zwei** Stellen mit exakt diesem Aufruf (Erstbefüllung ~Z. 2736 und `handleCloudSave` ~Z. 2764). **Beide** ersetzen:

```jsx
      await saveKalkulation({ mix, produkte, artikel: manuelleArtikel, geloescht: geloeschteArtikel });
```

durch:

```jsx
      await saveKalkulation({ mix, produkte, artikel: manuelleArtikel, geloescht: geloeschteArtikel, bon_vorlagen: bonVorlagen });
```

Kontrolle: `grep -c "bon_vorlagen: bonVorlagen" src/App.jsx` muss **2** ergeben.

- [ ] **Step 5: JSON-Upload und JSON-Export ergänzen**

Im `handleJsonUpload` den Block

```jsx
        if (db.produkte) {
          setProdukte(db.produkte);
          if (db.mix) setMix(db.mix);
```

erweitern zu:

```jsx
        if (db.produkte) {
          setProdukte(db.produkte);
          if (db.mix) setMix(db.mix);
          if (db.bon_vorlagen) setBonVorlagen(db.bon_vorlagen);
```

In `handleJsonDownload` das Objekt

```jsx
      artikel: Object.values(priceList),
    };
```

erweitern zu:

```jsx
      artikel: Object.values(priceList),
      bon_vorlagen: bonVorlagen,
    };
```

- [ ] **Step 6: Handler für die Bon-Felder**

Direkt nach `handleProduktDelete` (~Z. 3086) einfügen:

```jsx
  // Bon-Felder eines Rezepts setzen. Leerstring wird zu null, damit
  // "leer" ueberall dasselbe bedeutet (= Automatik).
  const handleBonFeld = (produktId, patch) => {
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => (p.id === produktId ? { ...p, ...sauber } : p)));
  };
```

- [ ] **Step 7: Build prüfen**

Run: `npm run build`
Expected: „built in …", keine Fehler. Bei „UNKNOWN: read" (OneDrive) Befehl wiederholen.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: Bon-Vorlagen laden, speichern, exportieren"
```

---

### Task 8: Vorlagen-Editor

**Files:**
- Create: `src/BonVorlagenEditor.jsx`

- [ ] **Step 1: Komponente schreiben**

Create `src/BonVorlagenEditor.jsx`:

```jsx
import React, { useRef, useState } from "react";
import { standardVorlage, aufloeseVorlage } from "./bon.js";

const PLATZHALTER = [
  { tag: "{produkt}",     hilfe: "Produktname" },
  { tag: "{gruppe}",      hilfe: "Warengruppe" },
  { tag: "{untergruppe}", hilfe: "Untergruppe, z. B. Salatbowls" },
  { tag: "{vk}",          hilfe: "Verkaufspreis brutto" },
  { tag: "{zutaten}",     hilfe: "Zutatenliste mit Mengen" },
  { tag: "{schritte}",    hilfe: "Arbeitsschritte, nummeriert" },
  { tag: "{hinweise}",    hilfe: "Hinweise, mit ! markiert" },
];

// Kopfbereich des Bon-Reiters: eine Vorlage je Warengruppe, sonst Standard.
export default function BonVorlagenEditor({ warengruppen, vorlagen, onChange, canEdit }) {
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState("_default");
  const areaRef = useRef(null);

  const eigen    = vorlagen?.[gewaehlt];
  const hatEigen = gewaehlt === "_default" || (typeof eigen === "string" && eigen.trim().length > 0);
  const wert     = gewaehlt === "_default"
    ? standardVorlage(vorlagen)
    : (hatEigen ? eigen : aufloeseVorlage(gewaehlt, vorlagen));

  const setzeVorlage = (text) => onChange({ ...(vorlagen || {}), [gewaehlt]: text });

  const platzhalterEinfuegen = (tag) => {
    const el = areaRef.current;
    if (!el || !canEdit || !hatEigen) return;
    const s = el.selectionStart ?? wert.length;
    const e = el.selectionEnd ?? wert.length;
    setzeVorlage(wert.slice(0, s) + tag + wert.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };

  const eintraege = [{ id: "_default", label: "Standard" }, ...warengruppen.map(g => ({ id: g, label: g }))];

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <button onClick={() => setOffen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-700">
          Bon-Vorlagen{" "}
          <span className="font-normal text-gray-400">
            ({eintraege.filter(e => e.id !== "_default" && vorlagen?.[e.id]?.trim()).length} Warengruppen abweichend)
          </span>
        </span>
        <span className="text-xs text-gray-400">{offen ? "zuklappen" : "aufklappen"}</span>
      </button>

      {offen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="flex gap-1 flex-wrap mb-3">
            {eintraege.map(e => {
              const abweichend = e.id !== "_default" && typeof vorlagen?.[e.id] === "string" && vorlagen[e.id].trim();
              return (
                <button key={e.id} onClick={() => setGewaehlt(e.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    gewaehlt === e.id
                      ? "bg-green-700 text-white border-green-700"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}>
                  {e.label}{abweichend ? " ●" : ""}
                </button>
              );
            })}
          </div>

          {!hatEigen && (
            <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-xs text-gray-500">
                {`Diese Warengruppe nutzt die Standardvorlage.`}
              </span>
              {canEdit && (
                <button onClick={() => setzeVorlage(wert)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
                  Eigene Vorlage anlegen
                </button>
              )}
            </div>
          )}

          <div className="flex gap-1 flex-wrap mb-2">
            {PLATZHALTER.map(p => (
              <button key={p.tag} title={p.hilfe} onClick={() => platzhalterEinfuegen(p.tag)}
                disabled={!canEdit || !hatEigen}
                className="px-2 py-1 rounded-md text-[11px] font-mono bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 disabled:opacity-40">
                {p.tag}
              </button>
            ))}
          </div>

          <textarea ref={areaRef} value={wert} rows={12} spellCheck={false}
            readOnly={!canEdit || !hatEigen}
            onChange={(ev) => setzeVorlage(ev.target.value)}
            className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />

          {hatEigen && gewaehlt !== "_default" && canEdit && (
            <button
              onClick={() => {
                if (!window.confirm(`Eigene Vorlage fuer ${gewaehlt} loeschen? Danach gilt wieder der Standard.`)) return;
                const next = { ...(vorlagen || {}) };
                next[gewaehlt] = null;
                onChange(next);
              }}
              className="mt-2 text-xs font-medium text-red-600 hover:text-red-700">
              Auf Standard zuruecksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: „built in …", keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/BonVorlagenEditor.jsx
git commit -m "feat: Vorlagen-Editor je Warengruppe"
```

---

### Task 9: Bon-Editor mit Vorschau

**Files:**
- Create: `src/BonEditor.jsx`

- [ ] **Step 1: Komponente schreiben**

Create `src/BonEditor.jsx`:

```jsx
import React, { useState } from "react";
import { renderBon, zutatenZeilen, BON_BREITE } from "./bon.js";

function Feld({ label, hinweis, wert, rows, onCommit, canEdit }) {
  const [lokal, setLokal] = useState(wert || "");
  // Rezeptwechsel: lokalen Puffer nachziehen
  const [letzterWert, setLetzterWert] = useState(wert || "");
  if ((wert || "") !== letzterWert) { setLetzterWert(wert || ""); setLokal(wert || ""); }

  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {hinweis && <p className="text-[11px] text-gray-400 mb-1">{hinweis}</p>}
      <textarea value={lokal} rows={rows} spellCheck={false} readOnly={!canEdit}
        onChange={(e) => setLokal(e.target.value)}
        onBlur={() => { if ((wert || "") !== lokal) onCommit(lokal); }}
        className="w-full text-sm p-3 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />
    </div>
  );
}

// Rechte Spalte des Bon-Reiters: Felder, Notausgang, Live-Vorschau.
export default function BonEditor({ produkt, vorlagen, onFeld, canEdit }) {
  const [overrideOffen, setOverrideOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  if (!produkt) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        Links ein Rezept waehlen.
      </div>
    );
  }

  const abweichendeZutaten = typeof produkt.bon_zutaten === "string" && produkt.bon_zutaten.trim().length > 0;
  const hatOverride        = typeof produkt.bon_override === "string" && produkt.bon_override.trim().length > 0;
  const text = renderBon(produkt, vorlagen);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch (_) {
      window.prompt("Bon-Text kopieren:", text);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">{produkt.name}</h3>
            <p className="text-xs text-gray-400">{produkt.gruppe}</p>
          </div>
          {hatOverride && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
              Freier Bon aktiv, Vorlage wirkungslos
            </span>
          )}
        </div>

        <div className="mb-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-600">Zutaten</span>
          {abweichendeZutaten ? (
            <>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                abweichend, folgt der Rezeptur nicht mehr
              </span>
              {canEdit && (
                <button onClick={() => onFeld(produkt.id, { bon_zutaten: null })}
                  className="text-[11px] font-medium text-green-700 hover:text-green-800">
                  Zurueck auf Automatik
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-[11px] text-gray-400">live aus der Rezeptur</span>
              {canEdit && (
                <button onClick={() => onFeld(produkt.id, { bon_zutaten: zutatenZeilen(produkt).join("\n") })}
                  className="text-[11px] font-medium text-green-700 hover:text-green-800">
                  Aus Rezeptur befuellen
                </button>
              )}
            </>
          )}
        </div>
        {abweichendeZutaten ? (
          <Feld label="" wert={produkt.bon_zutaten} rows={6} canEdit={canEdit}
            onCommit={(v) => onFeld(produkt.id, { bon_zutaten: v })} />
        ) : (
          <pre className="w-full text-sm p-3 mb-4 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 whitespace-pre-wrap">
            {zutatenZeilen(produkt).join("\n") || "(keine Zutaten im Rezept)"}
          </pre>
        )}

        <Feld label="Arbeitsschritte" hinweis="Eine Zeile = ein Schritt, wird automatisch nummeriert."
          wert={produkt.bon_schritte} rows={6} canEdit={canEdit}
          onCommit={(v) => onFeld(produkt.id, { bon_schritte: v })} />

        <Feld label="Hinweise" hinweis="Eine Zeile = ein Hinweis, erscheint mit ! auf dem Bon."
          wert={produkt.bon_hinweise} rows={3} canEdit={canEdit}
          onCommit={(v) => onFeld(produkt.id, { bon_hinweise: v })} />

        <button onClick={() => setOverrideOffen(o => !o)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700">
          {overrideOffen ? "Freien Bon zuklappen" : "Kompletten Bon frei schreiben"}
        </button>
        {overrideOffen && (
          <div className="mt-2">
            <Feld label="Freier Bon (ersetzt die Vorlage)"
              hinweis="Nur fuer Sonderfaelle. Platzhalter funktionieren auch hier."
              wert={produkt.bon_override} rows={10} canEdit={canEdit}
              onCommit={(v) => onFeld(produkt.id, { bon_override: v })} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-600">Vorschau ({BON_BREITE} Zeichen)</span>
          <button onClick={kopieren}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
            {kopiert ? "kopiert" : "Bon kopieren"}
          </button>
        </div>
        <div className="flex justify-center">
          <pre className="bg-white text-gray-800 font-mono text-[11px] leading-[1.45] px-3 py-4 whitespace-pre shadow-md"
            style={{
              width: `${BON_BREITE}ch`,
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), 96% 100%, 92% calc(100% - 6px), 88% 100%, 84% calc(100% - 6px), 80% 100%, 76% calc(100% - 6px), 72% 100%, 68% calc(100% - 6px), 64% 100%, 60% calc(100% - 6px), 56% 100%, 52% calc(100% - 6px), 48% 100%, 44% calc(100% - 6px), 40% 100%, 36% calc(100% - 6px), 32% 100%, 28% calc(100% - 6px), 24% 100%, 20% calc(100% - 6px), 16% 100%, 12% calc(100% - 6px), 8% 100%, 4% calc(100% - 6px), 0 100%)",
            }}>
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: „built in …", keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/BonEditor.jsx
git commit -m "feat: Bon-Editor mit Live-Vorschau und Kopieren"
```

---

### Task 10: Tab-Layout mit Rezeptliste und Export

**Files:**
- Create: `src/BonsTab.jsx`

- [ ] **Step 1: Komponente schreiben**

Create `src/BonsTab.jsx`:

```jsx
import React, { useMemo, useState } from "react";
import BonVorlagenEditor from "./BonVorlagenEditor.jsx";
import BonEditor from "./BonEditor.jsx";
import { bonStatus, bonsAlsCsv, bonsAlsJson } from "./bon.js";

const PUNKT = {
  auto:       { farbe: "#cbd5e1", titel: "nur Automatik" },
  gepflegt:   { farbe: "#15803d", titel: "Schritte gepflegt" },
  abweichend: { farbe: "#ea580c", titel: "abweichend von der Rezeptur" },
};

function download(inhalt, dateiname, typ) {
  const blob = new Blob([inhalt], { type: typ });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

// Reiter "Produktionsbons": Vorlagen oben, Rezeptliste links, Editor rechts.
export default function BonsTab({ produkte, warengruppen, vorlagen, onVorlagen, onFeld, canEdit }) {
  const [filter, setFilter] = useState("Alle");
  const [suche, setSuche]   = useState("");
  const [gewaehlt, setGewaehlt] = useState(null);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return produkte
      .filter(p => filter === "Alle" || p.gruppe === filter)
      .filter(p => !q || (p.name || "").toLowerCase().includes(q));
  }, [produkte, filter, suche]);

  const aktiv = produkte.find(p => p.id === gewaehlt) || sichtbar[0] || null;
  const gepflegt = produkte.filter(p => bonStatus(p) !== "auto").length;

  const exportieren = (art) => {
    const stand = new Date().toISOString().slice(0, 10);
    if (art === "csv") {
      download(bonsAlsCsv(produkte, vorlagen), `bons_${stand}.csv`, "text/csv;charset=utf-8");
    } else {
      download(bonsAlsJson(produkte, vorlagen, stand), `bons_${stand}.json`, "application/json");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Produktionsbons</h2>
          <p className="text-xs text-gray-400">
            {`${gepflegt} von ${produkte.length} Rezepten gepflegt. Zutaten kommen live aus der Rezeptur.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportieren("csv")}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300">
            Export CSV
          </button>
          <button onClick={() => exportieren("json")}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300">
            Export JSON
          </button>
        </div>
      </div>

      <BonVorlagenEditor warengruppen={warengruppen} vorlagen={vorlagen}
        onChange={onVorlagen} canEdit={canEdit} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 h-fit">
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Rezept suchen"
            className="w-full text-sm px-3 py-2 mb-2 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none" />
          <div className="flex gap-1 flex-wrap mb-3">
            {["Alle", ...warengruppen].map(g => (
              <button key={g} onClick={() => setFilter(g)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                  filter === g
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}>
                {g}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
            {sichtbar.length === 0 && <p className="text-xs text-gray-400 px-2 py-3">Kein Rezept gefunden.</p>}
            {sichtbar.map(p => {
              const s = PUNKT[bonStatus(p)];
              return (
                <button key={p.id} onClick={() => setGewaehlt(p.id)}
                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition ${
                    aktiv?.id === p.id ? "bg-green-50" : "hover:bg-gray-50"
                  }`}>
                  <span title={s.titel} className="h-2 w-2 rounded-full shrink-0" style={{ background: s.farbe }} />
                  <span className="text-sm text-gray-700 truncate">{p.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">{p.gruppe}</span>
                </button>
              );
            })}
          </div>
        </div>

        <BonEditor produkt={aktiv} vorlagen={vorlagen} onFeld={onFeld} canEdit={canEdit} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: „built in …", keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/BonsTab.jsx
git commit -m "feat: Reiter-Layout fuer Produktionsbons"
```

---

### Task 11: Tab in App.jsx verdrahten

**Files:**
- Modify: `src/App.jsx` (Import-Block oben, Zeilen 3123-3129, 3311-3318, 3336)

- [ ] **Step 1: Import ergänzen**

Am Ende des Import-Blocks oben in `src/App.jsx` (nach dem Import aus `./supabase`) einfügen:

```jsx
import BonsTab from "./BonsTab.jsx";
import { bonStatus } from "./bon.js";
```

- [ ] **Step 2: Tab-Eintrag ergänzen**

Die `tabs`-Definition

```jsx
  const tabs = [
    ...WARENGRUPPEN.map(g => ({ id: g, label: g })),
    { id: "SystemWE",       label: "System-Wareneinsatz" },
    { id: "Naehrwerte",     label: "Nährwerttabelle" },
    { id: "Einkaufspreise", label: "Einkaufspreise" },
    { id: "Inventur",       label: "Inventur" },
  ];
```

ersetzen durch:

```jsx
  const tabs = [
    ...WARENGRUPPEN.map(g => ({ id: g, label: g })),
    { id: "SystemWE",       label: "System-Wareneinsatz" },
    { id: "Naehrwerte",     label: "Nährwerttabelle" },
    { id: "Einkaufspreise", label: "Einkaufspreise" },
    { id: "Produktionsbons", label: "Produktionsbons" },
    { id: "Inventur",       label: "Inventur" },
  ];

  const bonsGepflegt = useMemo(() => produkte.filter(p => bonStatus(p) !== "auto").length, [produkte]);
```

- [ ] **Step 3: Zähler in der Tab-Leiste**

In der Tab-Leiste die Zeile

```jsx
                  if (t.id === "Inventur")       return <span className="ml-1.5 text-xs text-gray-400">({inventurArtikelGesamt})</span>;
```

ersetzen durch:

```jsx
                  if (t.id === "Inventur")       return <span className="ml-1.5 text-xs text-gray-400">({inventurArtikelGesamt})</span>;
                  if (t.id === "Produktionsbons") return <span className="ml-1.5 text-xs text-gray-400">({bonsGepflegt}/{produkte.length})</span>;
```

- [ ] **Step 4: Tab rendern**

Die Zeile

```jsx
        {aktiverTab === "Inventur"       && <InventurTab inventur={inventurJson} />}
```

ersetzen durch:

```jsx
        {aktiverTab === "Inventur"       && <InventurTab inventur={inventurJson} />}
        {aktiverTab === "Produktionsbons" && (
          <BonsTab produkte={produkte} warengruppen={WARENGRUPPEN} vorlagen={bonVorlagen}
            onVorlagen={setBonVorlagen} onFeld={handleBonFeld} canEdit={writer} />
        )}
```

- [ ] **Step 5: Build und Tests prüfen**

Run: `npm test && npm run build`
Expected: 32 Tests PASS, Build ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: Reiter Produktionsbons in die App einhaengen"
```

---

### Task 12: Verifikation im Browser gegen die Erfolgskriterien

**Files:** keine Änderung, nur Prüfung. Gefundene Fehler werden hier behoben und einzeln committet.

- [ ] **Step 1: Lokalen Preview-Modus starten**

Über das Preview-Tooling starten: `preview_start` mit `{ name: "calku" }` (launch.json-Eintrag, Port 5605, nutzt `.env.preview` → lokaler Modus, kein Login nötig, `writer` ist dort `true`).

- [ ] **Step 2: Kriterien 1, 2, 6 prüfen**

Im Reiter „Produktionsbons":
- Rezeptliste zeigt Produkte, Warengruppen-Filter und Suche greifen.
- Ein ungepflegtes Rezept zeigt in der Vorschau Kopf + Live-Zutaten.
- Keine Vorschauzeile ist länger als 42 Zeichen — im Browser prüfen mit:

```js
Array.from(document.querySelectorAll("pre")).map(p => Math.max(0, ...p.textContent.split("\n").map(z => z.length)))
```

Erwartet: kein Wert über 42 im Vorschau-`pre`.

- [ ] **Step 3: Kriterium 3 prüfen (Vorlagen-Vererbung)**

Vorlagen aufklappen → „Bowls" wählen → „Eigene Vorlage anlegen" → erste Zeile in `BOWL {produkt}` ändern → ein Bowl-Rezept zeigt die neue Vorlage, ein Smoothie-Rezept nicht. Dann „Auf Standard zurücksetzen" → Bowl-Rezept sieht wieder aus wie vorher.

- [ ] **Step 4: Kriterien 4 und 5 prüfen (Zutaten-Automatik)**

- Bei einem Rezept „Aus Rezeptur befüllen" → Text erscheint, oranges Badge da, Liste zeigt orangen Punkt.
- Text ändern (z. B. zwei Zeilen zu „Sauce 40 g" zusammenfassen) → Vorschau folgt.
- „Zurück auf Automatik" → Badge weg, Live-Zutaten wieder da.
- Bei einem Rezept **ohne** `bon_zutaten`: im Warengruppen-Tab eine Zutatenmenge ändern, zurück in den Bon-Reiter → Vorschau zeigt die neue Menge.

- [ ] **Step 5: Kriterium 8 prüfen (Export)**

„Export CSV" klicken → Datei öffnen, Umlaute korrekt, drei Spalten, Bon-Text in Anführungszeichen mit Zeilenumbrüchen.
„Export JSON" klicken → `bon_vorlagen` und je Rezept `bon_text` enthalten.

- [ ] **Step 6: Kriterien 7 und 9 prüfen (Persistenz, Bestand)**

Im lokalen Modus ist „Speichern" ein JSON-Download: speichern → Datei enthält `bon_vorlagen` und die Bon-Felder an den Produkten. Datei anschließend wieder hochladen (Import) → Vorlagen und Felder sind zurück.
Bestandsprüfung: Rezepte ohne Bon-Felder verursachen keinen Fehler — Konsole prüfen:

Run: `read_console_messages` mit `onlyErrors: true`
Expected: keine Fehler.

- [ ] **Step 7: Screenshot für Mark**

Screenshot des Reiters mit gefüllter Vorschau erstellen und in der Antwort zeigen.

- [ ] **Step 8: Abschluss-Commit, falls Korrekturen nötig waren**

```bash
git add -A
git commit -m "fix: Korrekturen aus der Browser-Verifikation"
```

---

### Task 13: Deploy

**Files:** keine.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `dist/` neu erzeugt, keine Fehler.

- [ ] **Step 2: Deploy**

Mark entscheidet: `git push` (Netlify baut automatisch) oder Netlify-CLI mit Site-ID `4bc85613-76eb-4e28-ad9a-b1e4a62ce12b`. **Vor dem Push kurz rückfragen** — Deploy ist eine nach außen wirkende Aktion.

- [ ] **Step 3: Live-Verifikation**

Live-Bundle nach dem ASCII-Marker `Produktionsbons` greppen (nicht nach dem Bundle-Hash, der weicht bei Netlify ab):

```bash
curl -s https://igcalku.netlify.app/ | grep -o 'assets/index-[^"]*\.js'
```

Dann das gefundene Bundle laden und `grep -c Produktionsbons` — Ergebnis muss > 0 sein.

- [ ] **Step 4: Memory aktualisieren**

`C:\Users\Media\.claude\projects\C--Users-Media-OneDrive-Desktop-n8n-workflows\memory\calku-app.md` um einen Abschnitt zum Bon-Reiter ergänzen (Datenmodell `bon_vorlagen` + vier Rezeptfelder, `src/bon.js` als einzige Render-Stelle, Vitest neu im Projekt, Export-Wege).
