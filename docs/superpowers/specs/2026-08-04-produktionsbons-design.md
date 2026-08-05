# CALKU — Reiter „Produktionsbons"

**Datum:** 2026-08-04
**Auftraggeber:** Mark Twiehoff
**Status:** freigegeben

## Zweck

Aus einem CALKU-Rezept soll eine **Produktionsanleitung** werden, die in der Filiale
als Bon gedruckt wird, sobald der Gast in SIDES bestellt und bezahlt hat. CALKU wird
dabei die Quelle der Wahrheit für den Bon-Text: gepflegt wird in CALKU, ausgeleitet
wird per Export, das Einpflegen in SIDES erfolgt manuell bzw. später per Schnittstelle.

Kernvorteil gegenüber Handpflege direkt in SIDES: Zutaten und Mengen kommen live aus
der Rezeptur. Ändert sich ein Rezept in CALKU, ist der Bon automatisch mit.

## Nicht im Umfang

- Kein direkter Schreibzugriff auf die SIDES-API (bewusst später)
- Keine Versionierung/Historie der Bon-Texte
- Keine filialspezifischen Bon-Varianten
- Keine Bilder auf dem Bon
- Keine neue Supabase-Tabelle, keine neue RLS-Regel

## Datenmodell

Alles im bestehenden Cloud-Dokument `kalkulation_state` (jsonb, id='main').

### Global: `bon_vorlagen`

Neuer Top-Level-Schlüssel neben `produkte`, `mix`, `artikel`, `geloescht`:

```json
{
  "_default": "…Vorlagentext…",
  "Smoothies": "…",
  "Juices": null,
  "Iced Drinks": null,
  "Bowls": "…",
  "Wraps": null,
  "Kampagnen": null
}
```

- `_default` ist die Standardvorlage.
- Eine Warengruppe mit `null` oder fehlendem Schlüssel **erbt `_default`**.
- Auflösung: `bon_vorlagen[produkt.gruppe] ?? bon_vorlagen._default ?? VORLAGE_FALLBACK`
  (Konstante im Code, damit die App auch ohne gepflegte Vorlage sinnvoll rendert).

**Platzhalter** (case-sensitiv, unbekannte Platzhalter bleiben unersetzt stehen):

| Platzhalter | Quelle |
|---|---|
| `{produkt}` | `produkt.name` |
| `{gruppe}` | `produkt.gruppe` |
| `{kampagne}` | `produkt.kampagne` (leer → Zeile entfällt) |
| `{untergruppe}` | `produkt.untergruppe` (leer → Zeile entfällt, s. u.) |
| `{vk}` | `produkt.vk_out_brutto`, de-DE mit „€" |
| `{zutaten}` | Zutatenblock (s. u.) |
| `{schritte}` | nummerierte Arbeitsschritte aus `bon_schritte` |
| `{hinweise}` | Hinweiszeilen aus `bon_hinweise` |

Leerzeilen-Regel: Eine Vorlagenzeile entfällt komplett, wenn sie mindestens einen
bekannten Platzhalter enthält und **alle** darin vorkommenden bekannten Platzhalter
leer sind (verhindert Löcher im Bon). Ist mindestens einer gefüllt, bleibt die Zeile
und die leeren werden durch Leerstring ersetzt. Zeilen ganz ohne bekannte Platzhalter
(Trennstriche, fester Text) bleiben immer. Unbekannte Platzhalter bleiben wörtlich
stehen und gelten als gefüllt.

**Label-Konvention:** Ein Label gehört mit seinem Platzhalter auf eine eigene Zeile
(`VK {vk}`). Steht es zusammen mit einem anderen, gefüllten Platzhalter in derselben
Zeile (`{gruppe} VK {vk}`), überlebt die Zeile und das Label steht bei leerem Wert
allein da (`Smoothies VK`). Das ist keine Fehlfunktion, sondern die Kehrseite der
Regel — Code kann nicht wissen, dass „VK" zu `{vk}` gehört. Die Konvention steht als
Hinweis im Vorlagen-Editor; `VORLAGE_FALLBACK` führt sie vor.

### Je Rezept (vier optionale Felder am Produkt-Objekt)

| Feld | Typ | Bedeutung |
|---|---|---|
| `bon_zutaten` | `string \| null` | Abweichende Zutatenformulierung. **Leer/null = live aus der Rezeptur.** |
| `bon_schritte` | `string \| null` | Arbeitsschritte, eine Zeile = ein Schritt |
| `bon_hinweise` | `string \| null` | Warnungen, Verpackung, Allergene, eine Zeile = ein Hinweis |
| `bon_override` | `string \| null` | Kompletter Bon-Text, ersetzt die Vorlage für dieses Rezept |

### Je Zutat (zwei optionale Felder in `produkte[].zutaten[]`, 05.08.2026)

| Feld | Typ | Bedeutung |
|---|---|---|
| `bon_menge` | `string \| null` | Küchenmaß als Freitext. Leer = `"{menge_g} g"` aus der Rezeptur. |
| `bon_anweisung` | `string \| null` | Handlungsanweisung dieser Zeile. Leer = keine Anweisungszeile. |

Beide gehören bewusst an die **Rezeptzeile**, nicht an den Artikel: `1/4 Cup` gilt für
40 g in diesem Gericht, bei 80 g wäre es `1/2 Cup`. Umgekehrter Fall zur Ausbeute, die
am Artikel hängt.

Bestand ist unberührt: alle sechs Felder undefined = Bon rein aus Vorlage +
Live-Zutaten. **Keine Migration nötig.**

## Rendering-Regeln

`renderBon(produkt, bonVorlagen)` → String, ist die **eine** Stelle, an der ein Bon
entsteht (Vorschau, Kopieren, Export nutzen alle diese Funktion).

1. Ist `bon_override` gesetzt (nach `trim()` nicht leer), wird **nur** dieser Text
   verwendet — Platzhalter werden auch darin ersetzt.
2. Sonst: Vorlage der Warengruppe auflösen, Platzhalter ersetzen.
3. **Zutatenblock — gestaffelt** (Susannes Vorgabe, 05.08.2026):
   - `bon_zutaten` gesetzt → dieser Text wird zeilenweise übernommen
   - sonst je Zutat bis zu drei Zeilen, in dieser Reihenfolge:
     1. **Menge** — `zutat.bon_menge`, falls gepflegt (Küchenmaß als Freitext,
        z. B. `1/4 Cup (40 g)` oder `5 g / 1 Pumpstoß`), sonst `"{menge} g"` aus
        `zutat.menge_g`, deutsch formatiert
     2. **Zutat**, zwei Leerzeichen eingerückt
     3. **Handlungsanweisung** `"  > {text}"`, nur wenn `zutat.bon_anweisung` gepflegt
   - Übersprungen wird eine Zutat nur, wenn sie keinen Namen hat oder weder
     `bon_menge` noch eine Menge > 0 trägt.
   - Die **Reihenfolge der Zutaten ist die Bau-Reihenfolge** — das ersetzt für diesen
     Aufbau den nummerierten `{schritte}`-Block, der für übergreifende Hinweise bleibt.
   - Beim Umbruch bleibt der Einzug einer Zeile erhalten; Folgezeilen sitzen zwei
     Zeichen tiefer als ihre eigene Zeile.
4. **Schritte:** nichtleere Zeilen aus `bon_schritte`, durchnummeriert `1. `, `2. ` …
5. **Hinweise:** nichtleere Zeilen aus `bon_hinweise`, präfigiert mit `! `
6. **Zeilenumbruch:** harter Umbruch auf **48 Zeichen** (80-mm-Thermodrucker, Mark 05.08.2026; vorher 42).
   Umbruch an Wortgrenzen; Fortsetzungszeilen von Zutaten/Schritten werden um zwei
   Leerzeichen eingerückt. Wörter länger als die Bonbreite werden hart getrennt.
7. Ausgabe ohne führende/abschließende Leerzeilen, maximal eine Leerzeile am Stück.

## Oberfläche

Neuer Tab `{ id: "Produktionsbons", label: "Produktionsbons" }` in `tabs`
(App.jsx ~Z. 3123), eingeordnet **nach „Einkaufspreise", vor „Inventur"**.

### Kopfbereich

- Aufklappbarer **Vorlagen-Editor** mit Umschalter über `Standard` + die sechs
  Warengruppen aus `WARENGRUPPEN`.
- Gruppe ohne eigene Vorlage zeigt die geerbte Standardvorlage schreibgeschützt an,
  plus Button **„Eigene Vorlage anlegen"** (kopiert den Standard als Startwert).
  Gruppe mit eigener Vorlage: Button **„Auf Standard zurücksetzen"** (setzt `null`,
  mit Bestätigungsdialog).
- **Platzhalter-Legende** als Chips; Klick fügt den Platzhalter an der Cursorposition ein.
- **Export-Button** (s. u.).

### Split-Ansicht

**Links — Rezeptliste**
- Filter nach Warengruppe (inkl. „Alle"), Suchfeld über den Produktnamen.
- Je Zeile: Produktname, Warengruppe, Status-Punkt:
  - grün = `bon_schritte` gepflegt
  - grau = nur Automatik (nichts gepflegt)
  - orange = `bon_override` oder `bon_zutaten` gesetzt (abweichend)
- Zähler im Kopf: „X von Y gepflegt".

**Rechts — Editor + Vorschau**
- **Zutatentabelle** (Normalfall): je Rezeptzeile Name und Gramm schreibgeschützt aus
  der Rezeptur, daneben zwei Eingaben — „Menge auf dem Bon" (Küchenmaß) und
  „Handlungsanweisung". Commit onBlur wie überall.
- Freitextfelder: Arbeitsschritte, Hinweise. Der Button **„Aus Rezeptur befüllen"**
  ersetzt die Tabelle durch einen freien Zutatenblock, **„Zurück auf Automatik"**
  stellt sie wieder her.
- `bon_zutaten` gesetzt → oranges Badge **„abweichend — folgt der Rezeptur nicht mehr"**
  in Liste und Editor.
- `bon_override` in einem separat aufklappbaren Bereich „Kompletten Bon frei schreiben"
  (Notausgang, standardmäßig zu). Ist er gesetzt, wird das im Editor deutlich
  gekennzeichnet und die Vorlage als wirkungslos markiert.
- **Live-Vorschau** darunter: Monospace, 48 Zeichen breit, weißer Papierstreifen mit
  Zackenkante, exakt das Ergebnis von `renderBon`.
- Button **„Bon kopieren"** (Zwischenablage, Erfolgsmeldung direkt am Button).

Alle Eingabefelder committen **onBlur** (Konvention wie Einkaufspreise-Tab), Schreiben
nur für Writer; Leser sehen alles schreibgeschützt.

## Export

Zwei Buttons, je ein Format. *(Abweichung vom ersten Entwurf, der ein Auswahlmenü
hinter einem Button vorsah — zwei Buttons sind ein Klick weniger und ein Bauteil
weniger. Bewusst so umgesetzt.)*

- **CSV** `bons_YYYY-MM-DD.csv`, Trennzeichen `;`, UTF-8 mit BOM (Excel),
  Spalten `produkt;gruppe;bon_text`. Zeilenumbrüche im Bon-Text stehen in
  Anführungszeichen, enthaltene `"` verdoppelt.
- **JSON** `bons_YYYY-MM-DD.json` mit `{ stand, bon_vorlagen, bons: [{ id, name, gruppe,
  bon_zutaten, bon_schritte, bon_hinweise, bon_override, bon_text }] }` —
  analog zum bestehenden Export-Button, der Weg zu Claude/igorder.

## Speichern & Rechte

- Keine neue Tabelle. `bon_vorlagen` wandert in den Payload von `saveKalkulation(...)`
  — **alle Aufrufstellen** (App.jsx ~Z. 2736 und ~Z. 2764) müssen ergänzt werden,
  sonst geht die Vorlage beim nächsten Speichern verloren.
- Laden: `row.data.bon_vorlagen` in den State, fehlt der Schlüssel → `{}`.
- Bon-Felder je Rezept reisen automatisch mit `produkte` mit.
- Es gilt die bestehende Writer-Regel (Mark + Susanne schreiben, alle
  `@mein-immergruen.de` lesen), das UI-Gating der App wird wiederverwendet.
- Ein Speichern-Button wie bisher.

## Erfolgskriterien

1. Neuer Tab sichtbar, Rezeptliste zeigt alle Produkte, Filter und Suche greifen.
2. Ohne jede Pflege erzeugt jedes Rezept einen sinnvollen Bon aus Standardvorlage +
   Live-Zutaten.
3. Eigene Vorlage für eine Warengruppe wirkt nur dort; Zurücksetzen stellt die
   Vererbung wieder her.
4. „Aus Rezeptur befüllen" → Text editierbar → oranges Badge → „Zurück auf Automatik"
   stellt den Live-Bezug wieder her.
5. Änderung einer Zutatenmenge im Warengruppen-Tab schlägt sofort in der Bon-Vorschau
   durch, solange `bon_zutaten` leer ist.
6. Vorschau bricht auf 48 Zeichen um, keine Zeile ist länger.
7. Speichern → Neuladen → Vorlagen und alle vier Rezeptfelder sind da.
8. CSV öffnet in Excel mit korrekten Umlauten; JSON enthält `bon_text` je Rezept.
9. Bestandsrezepte ohne Bon-Felder verursachen keinen Fehler.

## Gotchas (aus dem CALKU-Projektgedächtnis)

- **Template-Literale verwenden**, sobald deutsche Anführungszeichen („…") in Strings
  vorkommen — ASCII-`"` in solchen Meldungen bricht den esbuild-Build, der Fehler
  tarnt sich als IPC-Crash.
- Deploy-Verifikation **nicht per Bundle-Hash**, sondern per Inhalts-grep im
  Live-Bundle mit einem **ASCII-Marker** (Umlaute scheitern im Git-Bash-grep).
- Netlify braucht `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` als normale (nicht
  „secret") Env-Variablen, sonst läuft die App im lokalen Modus ohne Login.
- Lokale Verifikation ohne Login: `vite --mode preview`, launch.json-Eintrag `calku`
  (Port 5605).
- OneDrive-Pfad macht beim Build gelegentlich Ärger („UNKNOWN: read") — Build erneut
  starten bzw. `node_modules` neu installieren.
