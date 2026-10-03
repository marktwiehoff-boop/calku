# Bauplan: CALKU neu (Version 2)

Stand: 03.10.2026 · Entscheidung Mark Twiehoff: Neuaufbau des Kerns, Zutat-Ebene bleibt (unsichtbar),
Version 1 = Rezepte, Einkauf, Übersicht, Schnittstelle · neue Adresse, Umstellung nach Abnahme.

## 1. Warum neu

Die heutige App rechnet richtig, aber ihr Datenmodell erzeugt die Fehler, die wir seit Wochen reparieren:

| Ursache im Modell | Folge in der Praxis | Reparaturwerkzeug, das es deshalb gibt |
|---|---|---|
| Jede Rezeptzeile trägt eine eigene Preiskopie (`preis_pro_g`, `cost`) | Rezepturpreis und Einkaufspreis laufen auseinander (Joghurteis 2,61 statt 5,90 €/kg) | Rezeptur-Check „Preis weicht ab“, „Preise aus Liste ziehen“, Preis übernehmen |
| Zutat und Artikel hängen über den Namen zusammen | 129 von 165 Zutaten erreicht kein Preisimport | Zutatenstamm, Zuordnung |
| Jede Größe ist ein eigenes Produkt | Staffelfehler (600 ml mit weniger Zutat als 400 ml) | Staffel-Prüfung |
| Artikelstamm aus zwei Quellen (Excel-Erbe im Code + Handpflege) | falsche Einheiten (1000 kg), Kartonpreise auf Einzelpackung | Einheiten reparieren, Gebinde-Check |
| Der ganze Stand ist ein JSON-Dokument | keine Historie, wer zuletzt speichert, überschreibt alles | – |

Version 2 beseitigt die Ursachen. Damit entfallen die Reparaturwerkzeuge, und aus 14 Reitern werden 3 Arbeitsbereiche.

## 2. Grundsätze

1. **Jeder Preis steht an genau einer Stelle: am Einkaufsartikel.** Rezepte speichern nur Mengen. Kosten und Wareneinsatz werden immer live gerechnet.
2. **Ein Rezept, mehrere Größen.** Cookie Monster ist ein Rezept mit den Größen 400, 500 und 600 ml. Jede Zutat hat eine Menge je Größe.
3. **Zutaten hängen über eine feste Verknüpfung am Artikel**, nicht über den Namen. Die Zutat ist für den Nutzer unsichtbar: Er wählt beim Rezeptschreiben einen Artikel, die Zutat entsteht nebenbei.
4. **Prüfungen stehen dort, wo man arbeitet.** Eine rote Markierung im Rezept statt eines eigenen Prüf-Reiters.
5. **Die abhängigen Systeme merken den Umstieg nicht.** Version 2 liefert die bisherige Schnittstelle weiter (Abschnitt 6).

## 3. Datenmodell (Supabase, eigene Tabellen im bestehenden CALKU-Projekt)

```
artikel ──< zutat ──< rezept_zeile >── rezept ──< rezept_groesse
   │                       │                          │
   └─< artikel_preis       └─< rezept_menge >─────────┘
       (Historie)              (Menge je Zeile und Größe)
```

**`artikel`**: Einkaufsartikel, eine Zeile je Lieferant und Artikelnummer
- `id`, `lieferant` (Transgourmet | BUNZL | eigen), `artikel_nr`, `name`, `warengruppe` (Pflicht), `nonfood`
- `basis` (g | ml | stk) und `gebinde_menge` (in der Basis) sowie `gebinde_preis` beschreiben das Liefergebinde, wie es geliefert wird
- `preis_je_basis` wird berechnet (€ je g/ml bzw. je Stück)
- `stueck_gramm` (bei Stückware), `preis_stand`, `preis_quelle`, `aktiv`
- eindeutig: (`lieferant`, `artikel_nr`)

**`artikel_preis`**: Preishistorie (`artikel_id`, `preis_je_basis`, `gueltig_ab`, `quelle`). Jeder Import schreibt eine Zeile. So wird sichtbar, wann ein Preis gesprungen ist.

**`zutat`**: Küchenzutat, wie sie im Rezept heißt
- `id` (stabiler Schlüssel, kompatibel mit dem IG-Store-Stamm T16), `name`, `aliase`
- `artikel_id` **oder** `eigener_preis` (€ je Basis, mit Begründung, für Hausgemachtes wie Saucen und Frischpress-Säfte)
- `ausbeute_prozent`, `stueck_gramm`, `einheit` (g | ml | stk), `arbeitseinheit`, `klasse`

**`rezept`**: Verkaufsprodukt
- `id`, `name`, `warengruppe`, `untergruppe`, `artikelart` (Pflicht/Zusatz), `mwst_satz`, `kampagne_start/_ende`, `status` (aktiv | archiv), `basis_waehlbar` (Bowls), `notiz`
- `bon` (JSON, unverändert aus der alten App übernommen, für Version 2)

**`rezept_groesse`**: `id`, `rezept_id`, `label` („400 ml“, „Klein“), `sortierung`, **`kassen_id`** (die bisherige Produkt-ID, z. B. `smoothie_r040`, stabil für Kasse und Pipeline), `vk_in_brutto`, `vk_out_brutto`, `verpackung_eur`

**`rezept_zeile`**: `id`, `rezept_id`, `zutat_id`, `sortierung`, `bon_anweisung`
**`rezept_menge`**: `zeile_id`, `groesse_id`, `menge` (in der Einheit der Zutat)

**`einstellung`**: Bowl-Basis (Salat/Kartoffel/Reis), Umsatzmix, Wareneinsatz-Ziele je Warengruppe
**`schreibrecht`**: E-Mail-Adressen mit Schreibrecht. Ersetzt die doppelte Liste in Code und SQL, RLS liest daraus.

Jede Tabelle führt `geaendert_am` und `geaendert_von`. Gespeichert wird je Zeile statt als ganzes Dokument, damit sich zwei Personen nicht mehr überschreiben.

## 4. Rechenkern (pur, getestet)

- **Kosten einer Zeile je Größe:** Menge × Preis je Basis ÷ Ausbeute. Bei Stückzutaten ohne Artikel-Stückpreis rechnet der Kern über das Stückgewicht.
- **Wareneinsatz je Größe:** wie heute. Außer Haus = (Material + Verpackung) ÷ Netto-VK außer Haus, im Haus = Material ÷ Netto-VK im Haus. MwSt 7 % bzw. 19 % je Warengruppe, am Rezept übersteuerbar.
- **Bowl-Varianten:** Die heutige Logik (Kartoffel und Reis mit angepasstem Salatmix, eigene Kassen-IDs `<id>_kartoffel`, `<id>_reis`) wird übernommen und gegen die heutigen Werte getestet.
- **Prüfungen**, im Rezept als Markierung, in der Übersicht als Zähler:
  - Zutat ohne Preis (weder Artikel noch eigener Preis)
  - Menge 0 in einer Größe, wo andere Größen eine Menge haben
  - Größere Größe mit weniger Menge (Staffel)
  - Kein Verkaufspreis
  - **Wareneinsatz außer Haus unter 15 % oder über 35 %: Plausibilitätsfehler**
  - Wareneinsatz über dem Ziel der Warengruppe (heute 24 % Getränke, 26 % Speisen): Ampel

## 5. Oberfläche Version 1: drei Arbeitsbereiche

**Rezepte**
- Links die Liste mit Suche und Warengruppe als Filter (statt sechs Reitern). Je Rezept die Ampel aller Größen.
- Rechts der Editor:
  - Kopf: Name, Warengruppe, Artikelart, MwSt, Kampagnenzeitraum.
  - Größen als Spalten: VK im Haus und außer Haus, Verpackung, Material und Wareneinsatz live.
  - Zutaten als Zeilen: Artikelwahl mit Suche und Preisanzeige, Menge je Größe, Kosten je Größe.
- Neue Zutat = Artikel suchen und wählen. Hausgemachtes bekommt einen eigenen Preis mit Begründung.
- Prüfmarkierungen direkt an Zeile und Größe.

**Einkauf**
- Artikeltabelle: Suche, Warengruppe, Preis je kg, l oder Stück, Liefergebinde, Preisstand, Lieferant. Ein Klick zeigt die Preishistorie und „wird verwendet in“.
- Preisimport Transgourmet „CSV Erweitert“ (Logik aus `tgimport.js` übernommen) und BUNZL.
- **Vor dem Übernehmen zeigt der Import die Wirkung:** welche Rezepte sich wie stark im Wareneinsatz ändern. Sprünge ab Faktor 2 und Widersprüche zwischen Bezeichnung und Menge werden einzeln entschieden.
- Neuer Artikel von Hand (Warengruppe Pflicht, Rechenbasis g, ml oder Stück).

**Übersicht**
- Alle Produkte und Größen mit Wareneinsatz im Haus und außer Haus, Ampel, Filter „außerhalb 15–35 %“.
- System-Wareneinsatz nach Umsatzmix.
- Datenqualität in einer Zeile: Zutaten ohne Preis, Rezepte mit Prüfmarkierung, Artikelpreise älter als 8 Wochen.

**Einstellungen** (kleines Menü, kein Reiter): Bowl-Basis, Umsatzmix, Ziele je Warengruppe, Schreibrechte.

**Nicht in Version 1:**

| Funktion | Bleibt bis Version 2 |
|---|---|
| Produktionsbons | in der alten App (nur lesend). Bon-Daten werden mit übernommen. |
| Nährwerttabelle | in der alten App (nur lesend) |
| KI-Rezeptupload | entfällt vorerst |
| Inventurliste | entfällt, dafür gibt es iginventur |
| Rezept-JSON-Import | entfällt, nur die einmalige Übernahme |
| Unterrezepte (hausgemachte Saucen aus Artikeln gerechnet) | Kandidat für Version 2, bis dahin „eigener Preis“ |

## 6. Schnittstelle zu den abhängigen Systemen (bleibt unverändert)

Version 2 schreibt nach jeder Änderung (gebündelt, wenige Sekunden verzögert) das bisherige Dokument in `kalkulation_state` (`id = 'main'`). Die Leser müssen nichts ändern:

| Leser | liest | Version 2 liefert |
|---|---|---|
| BigQuery-Pipeline `calku_rezepte.py` (igorder_rezept, igorder_calku_produkt, IG Store) | `produkte_aufgeloest[]`: id, name, gruppe, untergruppe, artikelart, kampagne_start/_ende, zutaten[name, menge_g] | je Größe ein Produkt mit `kassen_id` als id, Bowl-Varianten aufgelöst, Zutatnamen wie bisher, Stückzutaten mit Gramm-Äquivalent |
| IG Store Verkaufsartikel (über Pipeline) | artikelart | unverändert |
| iginventur `preise.js` | `artikel[]`: article_number, ingredient_name, package_price, date_last_checked, unit, lieferant; `geloescht` | aus `artikel` abgeleitet, Packung = Liefergebinde (iginventur wählt die passende Lesart schon heute selbst) |
| Soll-Wareneinsatz (systemzentrale, Worktree `soll-wes`) | Rezepte über BigQuery | unverändert über die Pipeline |
| Export-Datei (igorder) | Gesamtdokument | Knopf „Export“ bleibt |

Zusätzlich liefert Version 2 die Felder `produkte`, `mix`, `zutaten`, `meta.generiert_am`. Der Erzeuger der Schnittstelle (`vertrag.js`) bekommt einen **Vergleichstest gegen den letzten Export der alten App**. Gleiche Produkt-IDs, gleiche Zutatnamen, gleiche Mengen, Abweichungen nur dort, wo die Übernahme bewusst korrigiert hat (Bericht).

## 7. Übernahme der Daten (einmalig, wiederholbar)

Ein Übernahme-Skript liest den Stand der alten App (`kalkulation_state`) und baut die neuen Tabellen. Es läuft im Probelauf beliebig oft und schreibt jedes Mal einen **Übernahmebericht** zum Abnehmen.

1. **Artikel:**
   - Quelle sind alle Artikel des alten Stamms.
   - Einheiten werden bereinigt (kg/l mit Gramm-Mengen → g/ml).
   - Wo eine Transgourmet-Liste vorliegt, gilt das Liefergebinde der Liste.
   - Dubletten mit gleicher Nummer werden zusammengeführt.
2. **Zutaten:**
   - Alle Zutatnamen aus den Rezepten, in den Zutatenstamm.
   - Die Verknüpfung kommt aus deinem Zutatenstamm und der Zuordnung, sonst über den exakten Artikelnamen.
   - Ohne Treffer gilt die Zutat als „eigener Preis“ mit dem bisherigen Rezepturpreis und landet auf der Liste im Bericht.
3. **Rezepte:**
   - Größen werden zusammengeführt: gleicher Name ohne Größenangabe, also ml, l, Klein oder Normal.
   - Die Zeilen werden über die Zutat vereint, mit der Menge je Größe.
   - Doppelte Zeilen werden addiert und gemeldet.
   - Die Kassen-ID je Größe bleibt.
4. **Einstellungen:** Bowl-Basis, Mix, Bon-Vorlagen und Bon-Felder werden übernommen.
5. **Bericht:** Zahl der Artikel, Zutaten und Rezepte, Liste der Zutaten ohne Artikel, Staffelbrüche, zusammengeführte Dubletten, und **Wareneinsatz alt gegen neu je Produkt**.

Deine Korrekturen der nächsten Tage in der alten App (Import, Einheiten, Zuordnung) werden so übernommen. Die Rezepturfehler aus Abschnitt 4 der Prüfliste besser erst in Version 2 beheben.

## 8. Technik

- **Neues Repo** `C:\Projekte\calku2`, neue Netlify-Seite (Arbeitstitel `igcalku-neu`), gleiches Supabase-Projekt wie heute, neue Tabellen mit Präfix `k2_`.
- **Stack** wie die übrigen Apps: React, Vite, Tailwind, Supabase mit Google-Login (nur @mein-immergruen.de), RLS über `k2_schreibrecht`.
- **Übernommen:** die reinen Module, die sich bewährt haben und getestet sind: `tgimport.js`, `preisimport.js` (BUNZL), `artikelpreis.js` (Teile), Bowl-Varianten-Logik, MwSt-Regeln.
- **Neu, jeweils mit Tests:** `kalkulation.js` (Rechenkern), `pruefungen.js`, `vertrag.js` (Schnittstelle), `uebernahme/` (Skript und Bericht).
- **Speichern:** je Zeile direkt in Supabase, Live-Abgleich über Realtime, keine Speichern-Knöpfe.

## 9. Ablauf in Etappen

| Etappe | Inhalt | Ergebnis zum Abnehmen |
|---|---|---|
| 1 Fundament | Repo, Tabellen, RLS, Übernahme-Skript im Probelauf | **Übernahmebericht** auf Basis des aktuellen Stands |
| 2 Rechenkern und Schnittstelle | Rechenkern, Prüfungen, `vertrag.js` mit Vergleichstest | Wareneinsatz alt gegen neu je Produkt, Schnittstelle deckungsgleich |
| 3 Rezepte und Einkauf | Rezept-Editor mit Größen, Artikeltabelle, Preisimport mit Wirkungsvorschau | erste Arbeitsversion unter neuer Adresse |
| 4 Übersicht und Schattenbetrieb | Übersicht, Einstellungen. Version 2 schreibt die Schnittstelle zum Vergleich in `kalkulation_state` mit `id = 'v2'`, die alte App bleibt führend. | Probelauf der Pipeline gegen `v2` ohne Unterschiede |
| 5 Umstieg | letzte Übernahme nach deinen Korrekturen, alte App nur lesend (Schreibrechte entzogen), Version 2 schreibt `main`, Adresse igcalku zeigt auf Version 2, die alte App bleibt unter eigener Adresse lesbar | CALKU 2 im Echtbetrieb |

Grobe Schätzung: drei bis fünf Arbeitssitzungen bis Etappe 5. Nach jeder Etappe nimmst du ab, bevor die nächste beginnt.

## 10. Abnahmekriterien für den Umstieg

- Alle Rezepte der Kassensicht sind vorhanden, mit identischen Kassen-IDs und Zutatnamen.
- Die Pipeline läuft im Probelauf gegen `v2` ohne Fehler und ohne unerklärte Mengenabweichung.
- iginventur findet für alle bisher gefundenen Artikelnummern einen Preis.
- Kein aktives Produkt liegt ohne Erklärung außerhalb von 15–35 % Wareneinsatz außer Haus.
- Jede Zutat hat einen Artikel oder einen begründeten eigenen Preis.
- Du und Susanne könnt ein Rezept anlegen, ändern und einen Preisimport durchführen, ohne die Anleitung zu brauchen.

## 11. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Pipeline oder IG Store brechen beim Umstieg | Schattenbetrieb mit `id = 'v2'`, Vergleichstest, Umstieg erst nach fehlerfreiem Probelauf. Die alte App bleibt als Rückfall. |
| Kassen-IDs gehen bei der Zusammenführung der Größen verloren | `kassen_id` je Größe ist Pflichtfeld, Übernahme bricht bei fehlender ID ab |
| Zwei Apps gleichzeitig schreibend | bis Etappe 5 schreibt Version 2 nie `main`. Ab Etappe 5 hat die alte App keine Schreibrechte mehr. |
| Übernahme verfälscht Mengen | Vergleichstest alt gegen neu für jedes Produkt und jede Zutat, Bericht vor jedem Schritt |
| Hausgemachtes ohne Artikel bleibt ungenau | „eigener Preis“ mit Begründung und Datum, Kennzahl in der Übersicht, Unterrezepte als Option für Version 2 |
