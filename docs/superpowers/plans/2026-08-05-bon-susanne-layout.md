# Produktionsbons — Susannes Aufbau

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Den Bon auf den Aufbau umstellen, den Susanne am 05.08.2026 an zwei Produkten vorgegeben hat: Menge, Zutat und Handlungsanweisung gestaffelt untereinander, Küchenmaße statt reiner Gramm, eine Anweisung je Zutat statt eines nummerierten Blocks am Ende.

**Architecture:** Zwei neue optionale Felder je **Rezeptzeile** (`zutat.bon_menge`, `zutat.bon_anweisung`), gepflegt in einer Tabelle im Bon-Editor. Die Rendering-Regeln bleiben in `src/bon.js`; `zutatenZeilen` erzeugt jetzt drei Zeilen je Zutat statt einer. Bonbreite 42 → 48 Zeichen.

**Tech Stack:** unverändert (Vite 6, React 18, Tailwind, Vitest).

**Vorlage:** `docs/superpowers/specs/2026-08-04-produktionsbons-design.md`

---

## Fachliche Grundlage

Susannes zwei Excel-Vorlagen (Korean Glaze Bowl, Iced Pistachio Vanilla Coffee) zeigen:

```
Menge                        | Zutat               | Handlungsanweisung
1 großer Eisportionierer (200 g) | Quinoa Reismix  | Als große Kugelform einfüllen
60 g                         | Salatmix            | Daneben legen
1/4 Cup (40 g)               | Gurkenwürfel        | (keine)
5 g / 1 Pumpstoß             | Vanille Sirup       | Dazugeben
```

Befunde:
- **Menge zuerst**, dann Zutat — umgekehrt zur bisherigen Zeile `Milch 140 g`.
- Die Mengenspalte ist **Freitext**: mal Maß mit Gramm dahinter (`1/4 Cup (40 g)`), mal
  Gramm mit Maß dahinter (`5 g / 1 Pumpstoß`), mal nur Gramm (`140 g`).
- Die Anweisung hängt **an der Zutat**, nicht am Rezept, und fehlt bei manchen Zeilen.
- Die Zutatenreihenfolge **ist** die Bau-Reihenfolge.
- `Iced Pistachio Vanilla Coffee` steht bereits in CALKU — mit denselben sechs Zutaten,
  denselben Gramm und derselben Reihenfolge. Der Bon ist also die vorhandene Rezeptur
  plus die zwei neuen Angaben je Zeile.

Marks Entscheidungen (05.08.2026): Layout **gestaffelt**, Bonbreite **48 Zeichen**.

## Zielbild (48 Zeichen)

```
Korean Glaze Bowl Normal
Bowls
Seoul Mate
------------------------------------------------
1 großer Eisportionierer (200 g)
  Quinoa Reismix
  > Als große Kugelform einfüllen
60 g
  Salatmix
  > Daneben legen
1/4 Cup (40 g)
  Gurkenwürfel
------------------------------------------------
Reihenfolge = Bau-Reihenfolge von oben nach unten.
```

## Datenmodell (Ergänzung)

Je **Zutat** in `produkte[].zutaten[]`, beide optional, Default `null`:

| Feld | Bedeutung |
|---|---|
| `bon_menge` | Küchenmaß als Freitext. Leer = `"{menge_g} g"` aus der Rezeptur. |
| `bon_anweisung` | Handlungsanweisung dieser Zeile. Leer = keine Anweisungszeile. |

Bestand unberührt (Felder undefined), keine Migration. Beide reisen in `produkte` mit,
also automatisch im Cloud-Dokument und in beiden Exporten.

Neuer Platzhalter `{kampagne}` (aus `produkt.kampagne`).

**Warum an der Rezeptzeile und nicht am Artikel:** `1/4 Cup` gilt für 40 g in diesem
Gericht; bei 80 g wäre es `1/2 Cup`. Umgekehrter Fall zur Ausbeute, die bewusst am
Artikel hängt.

---

### Task 1: bon.js auf 48 Zeichen und den gestaffelten Zutatenblock

**Files:** Modify `src/bon.js`, `src/bon.test.js`

- [ ] **Step 1: Tests anpassen und erweitern**

In `src/bon.test.js`:

a) Die Breitenerwartung zieht automatisch mit `BON_BREITE` — prüfen, dass keine Zahl 42 hart im Test steht. Falls doch, auf `BON_BREITE` umstellen.

b) Den Golden-Test gegen `VORLAGE_FALLBACK` an die neue Fallback-Vorlage und den neuen Zutatenblock anpassen.

c) Die `zutatenZeilen`-Tests ersetzen durch:

```js
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

  it("vertraegt ein Produkt ohne Zutaten und ein kaputtes Zutatenfeld", () => {
    expect(zutatenZeilen({ name: "Leer" })).toEqual([]);
    expect(zutatenZeilen({ zutaten: "nicht-array" })).toEqual([]);
  });
});
```

d) Test für den erhaltenen Einzug beim Umbruch ergänzen:

```js
it("haelt beim Umbruch den Einzug der Zutatenzeile", () => {
  const p = { zutaten: [{ name: "Eine sehr lange Zutatenbezeichnung die umbrechen muss weil sie nicht passt", menge_g: 30 }] };
  const zeilen = renderBon(p, { _default: "{zutaten}" }).split("\n");
  expect(zeilen[0]).toBe("30 g");
  expect(zeilen[1].startsWith("  ")).toBe(true);
  expect(zeilen[2].startsWith("    ")).toBe(true);
  for (const z of zeilen) expect(z.length).toBeLessThanOrEqual(BON_BREITE);
});
```

e) Test für `{kampagne}`:

```js
it("setzt die Kampagne ein und laesst die Zeile ohne Kampagne entfallen", () => {
  const v = { _default: "{produkt}\n{kampagne}" };
  expect(renderBon({ name: "A", kampagne: "Seoul Mate" }, v)).toBe("A\nSeoul Mate");
  expect(renderBon({ name: "A" }, v)).toBe("A");
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL in `zutatenZeilen` (alte einzeilige Form) und beim Golden-Test.

- [ ] **Step 3: Implementierung**

In `src/bon.js`:

Breite ändern:
```js
export const BON_BREITE = 48; // Zeichen je Zeile, 80-mm-Thermodrucker (Mark, 05.08.2026)
```

`zutatenZeilen` ersetzen:
```js
// Gestaffelt je Zutat: Menge, Zutat eingerueckt, optionale Anweisung mit "> ".
// Die Reihenfolge der Zutaten IST die Bau-Reihenfolge (Vorgabe Susanne, 05.08.2026).
// Gepflegter Freitext in bon_zutaten schlaegt die Rezeptur, leer = live.
export function zutatenZeilen(produkt) {
  const eigen = textZeilen(produkt?.bon_zutaten);
  if (eigen.length) return eigen;

  const zutaten = Array.isArray(produkt?.zutaten) ? produkt.zutaten : [];
  const aus = [];
  for (const z of zutaten) {
    if (!gepflegt(z?.name)) continue;
    const eigeneMenge = gepflegt(z.bon_menge);
    if (!eigeneMenge && !((+z.menge_g || 0) > 0)) continue;
    aus.push(eigeneMenge ? z.bon_menge.trim() : `${formatMenge(z.menge_g)} g`);
    aus.push(`  ${z.name.trim()}`);
    if (gepflegt(z.bon_anweisung)) aus.push(`  > ${z.bon_anweisung.trim()}`);
  }
  return aus;
}
```

Umbruch mit erhaltenem Einzug — neue private Funktion neben `wrapZeile`:
```js
// Bricht eine Blockzeile um und erhaelt dabei ihren eigenen Einzug; Folgezeilen
// werden zusaetzlich zwei Zeichen tiefer gesetzt.
function wrapBlockZeile(zeile) {
  const roh = String(zeile ?? "");
  const einzug = (roh.match(/^\s*/) || [""])[0];
  const breite = Math.max(8, BON_BREITE - einzug.length);
  return wrapZeile(roh.slice(einzug.length), breite, "  ").map(z => einzug + z);
}
```

In `renderBon` den Blockzweig umstellen:
```js
    if (Object.prototype.hasOwnProperty.call(bloecke, roh)) {
      for (const b of bloecke[roh]) aus.push(...wrapBlockZeile(b));
      continue;
    }
```

`{kampagne}` in `werte` ergänzen:
```js
    "{kampagne}":    produkt.kampagne || "",
```

`VORLAGE_FALLBACK` ersetzen:
```js
export const VORLAGE_FALLBACK = [
  "{produkt}",
  "{gruppe}",
  "{kampagne}",
  TRENNER,
  "{zutaten}",
  TRENNER,
  "{schritte}",
  "{hinweise}",
  "Reihenfolge = Bau-Reihenfolge von oben nach unten.",
].join("\n");
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bon.js src/bon.test.js
git commit -m "feat: gestaffelter Zutatenblock und 48 Zeichen Bonbreite"
```

---

### Task 2: Pflege der Zeilenfelder in der Oberfläche

**Files:** Modify `src/BonEditor.jsx`, `src/BonsTab.jsx`, `src/App.jsx`

- [ ] **Step 1: Handler in App.jsx**

Direkt nach `handleBonFeld` einfügen:
```jsx
  // Bon-Felder EINER Zutat (Kuechenmass, Handlungsanweisung) setzen.
  const handleBonZutat = (produktId, index, patch) => {
    if (!writer) return;
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => {
      if (p.id !== produktId) return p;
      const zutaten = (p.zutaten || []).map((z, i) => (i === index ? { ...z, ...sauber } : z));
      return { ...p, zutaten };
    }));
  };
```

Und an `BonsTab` durchreichen:
```jsx
          <BonsTab produkte={produkte} warengruppen={WARENGRUPPEN} vorlagen={bonVorlagen}
            onVorlagen={setBonVorlagen} onFeld={handleBonFeld} onZutat={handleBonZutat} canEdit={writer} />
```

- [ ] **Step 2: Durchreichen in BonsTab.jsx**

Signatur um `onZutat` erweitern und an `BonEditor` weitergeben:
```jsx
export default function BonsTab({ produkte, warengruppen, vorlagen, onVorlagen, onFeld, onZutat, canEdit }) {
```
```jsx
        <BonEditor key={aktiv?.id} produkt={aktiv} vorlagen={vorlagen} onFeld={onFeld} onZutat={onZutat} canEdit={canEdit} />
```

- [ ] **Step 3: Zutatentabelle in BonEditor.jsx**

Import um `formatMenge` erweitern:
```jsx
import { renderBon, zutatenZeilen, formatMenge, BON_BREITE } from "./bon.js";
```

Einzeiliges Eingabefeld neben `Feld` ergänzen (lokaler Puffer, Commit onBlur — Projektkonvention):
```jsx
function ZeileInput({ wert, platzhalter, canEdit, onCommit }) {
  const [lokal, setLokal] = useState(wert || "");
  return (
    <input type="text" value={lokal} placeholder={platzhalter} readOnly={!canEdit}
      onChange={(e) => setLokal(e.target.value)}
      onBlur={() => { if ((wert || "") !== lokal) onCommit(lokal); }}
      className="w-full text-sm px-2 py-1 rounded-md border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />
  );
}
```

Den bisherigen schreibgeschützten `<pre>`-Block im Nicht-abweichend-Fall durch die Tabelle ersetzen:
```jsx
          <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] text-gray-500">
                  <th className="text-left px-2 py-1.5 font-semibold">Zutat</th>
                  <th className="text-left px-2 py-1.5 font-semibold w-[34%]">Menge auf dem Bon</th>
                  <th className="text-left px-2 py-1.5 font-semibold w-[34%]">Handlungsanweisung</th>
                </tr>
              </thead>
              <tbody>
                {(produkt.zutaten || []).length === 0 && (
                  <tr><td colSpan={3} className="px-2 py-3 text-xs text-gray-400">Keine Zutaten im Rezept.</td></tr>
                )}
                {(produkt.zutaten || []).map((z, i) => (
                  <tr key={`${i}-${z.name}`} className="border-t border-gray-100 align-middle">
                    <td className="px-2 py-1 text-gray-700">
                      {z.name}
                      <span className="text-gray-400"> · {formatMenge(z.menge_g)} g</span>
                    </td>
                    <td className="px-1 py-1">
                      <ZeileInput wert={z.bon_menge} platzhalter={`${formatMenge(z.menge_g)} g`} canEdit={canEdit}
                        onCommit={(v) => onZutat(produkt.id, i, { bon_menge: v })} />
                    </td>
                    <td className="px-1 py-1">
                      <ZeileInput wert={z.bon_anweisung} platzhalter="(keine)" canEdit={canEdit}
                        onCommit={(v) => onZutat(produkt.id, i, { bon_anweisung: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
```

Signatur ergänzen: `export default function BonEditor({ produkt, vorlagen, onFeld, onZutat, canEdit })`.

Den Hinweistext neben „Zutaten" von „live aus der Rezeptur" auf „Zutaten und Gramm live aus der Rezeptur, Maß und Anweisung hier" ändern.

- [ ] **Step 4: Platzhalter-Legende im Vorlagen-Editor**

In `src/BonVorlagenEditor.jsx` in `PLATZHALTER` ergänzen, nach `{gruppe}`:
```jsx
  { tag: "{kampagne}",    hilfe: "Kampagnenname, falls gesetzt" },
```

- [ ] **Step 5: Build und Tests**

Run: `npm test && npm run build`
Expected: alle Tests grün, Build ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/BonsTab.jsx src/BonEditor.jsx src/BonVorlagenEditor.jsx
git commit -m "feat: Kuechenmass und Handlungsanweisung je Zutat pflegen"
```

---

### Task 3: Verifikation im Browser

- [ ] **Step 1:** Preview starten (`calku`, Port 5605).
- [ ] **Step 2:** `Iced Pistachio Vanilla Coffee` wählen, die sechs Zeilen aus Susannes Blatt eintragen (Vanille- und Pistazien-Sirup je `5 g / 1 Pumpstoß`, Anweisungen wie im Blatt) und prüfen, dass der Bon exakt ihrer Vorlage entspricht.
- [ ] **Step 3:** Keine Vorschauzeile länger als 48 Zeichen.
- [ ] **Step 4:** Bestandsrezept ohne gepflegte Zeilenfelder zeigt weiterhin `Menge` + eingerückte Zutat.
- [ ] **Step 5:** Speichern-Payload enthält `bon_menge`/`bon_anweisung` an den Zutaten.
- [ ] **Step 6:** Konsole fehlerfrei.

---

### Task 4: Spec nachziehen und Deploy

- [ ] **Step 1:** `docs/superpowers/specs/2026-08-04-produktionsbons-design.md` um das Zeilen-Datenmodell, die 48 Zeichen, `{kampagne}` und den gestaffelten Aufbau ergänzen.
- [ ] **Step 2:** Merge nach `main` und Push — **vorher Mark fragen**, Netlify baut automatisch.
- [ ] **Step 3:** Live-Bundle per ASCII-Marker prüfen (`Handlungsanweisung`) und auf den Supabase-Projektschlüssel grepen (Login-Gate).
- [ ] **Step 4:** Memory `calku-app.md` aktualisieren.
