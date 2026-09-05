# Bowl-Basis (Kartoffel / Reis) — Rezeptvarianten für CALKU

> **Überholt seit 05.09.2026.** Die Varianten werden nicht mehr als eigene
> Produkte importiert. CALKU führt jede Bowl als EIN Rezept mit den drei
> Basen Salat / Kartoffel / Reis (Bowls-Tab: „Basis-Rezeptur“, Spalten je
> Variante) und schreibt beim Speichern `produkte_aufgeloest` mit den ids
> `<id>`, `<id>_kartoffel`, `<id>_reis` — dieselben ids wie unten, deshalb
> bleibt der BigQuery-Plan („Danach“) gültig. Salatmix ist in Kartoffel- und
> Reisbowl 50 g (nicht 100 g wie in den Tabellen unten). `import_bowl_basis.json`
> **nicht mehr importieren**; falls schon geschehen, bietet der Bowls-Tab
> „Duplikate entfernen“ an.

Erzeugt am 2026-09-03 mit `bowl_basis_generator.py` aus dem Schnappschuss `stand_2026-08-02b.json` (Stand 2026-08-02). Importdatei: `import_bowl_basis.json`.

## Warum

Die Bowls in CALKU enthalten keine Basis. In der Kasse (SIDES) sind
„Julius Caesar Bowl“ (Salat), „Julius Caesar Kartoffel (normal)“ und
„Julius Caesar Reis (normal)“ drei Artikel, die in BigQuery alle auf dasselbe
CALKU-Rezept zeigen — Kartoffeln, Basissauce, Röstzwiebeln und Reis tauchen
dadurch in keinem Bestellvorschlag auf (siehe `wilde_ziege_report.md`,
„Bewusst weggelassen“). Entscheidung 03.09.2026 (Mark): die Basis wird in
CALKU als eigene Rezeptvarianten nachgepflegt, passend zu den drei
Kassenartikeln je Bowl und Größe.

## Datenbasis

- Quelle ist der lokale Schnappschuss `stand_2026-08-02b.json` (exportiert 2026-08-02T14:06:46.796Z).
  Die Live-Daten liegen in Supabase; darauf hatte der Generator keinen
  Zugriff. Änderungen an den Bowls seit dem Export (Mengen, Preise, VK)
  stecken deshalb **nicht** in den Varianten — bitte beim Prüfen gegen den
  Live-Stand halten.
- Die **Wilde Ziege** (Import vom 07.08.) ist im Schnappschuss noch nicht
  enthalten und hat deshalb noch keine Varianten. Abhilfe: in CALKU
  „JSON-Download“ ziehen und den Generator mit dieser Datei erneut laufen
  lassen (`py -3 bowl_basis_generator.py <export.json>`); er nimmt alle
  Bowls mit id `bowl_klein_*` / `bowl_normal_*` automatisch mit.
- Gefunden: 14 Bowls → 28 Varianten (14 Kartoffel, 14 Reis).

## Basis-Rezeptur

| Zutat | Normal | Klein | Preis €/g | Preisquelle | TG-Artikel (Preisliste) | Listenpreis €/g |
|---|---|---|---|---|---|---|
| Kartoffeln gegart (Kartoffelbowls) | 230 g | 155 g | 0,001988 | Einkaufspreisliste (artikel im Schnappschuss), Artikel „Garkartoffel“ | Garkartoffel (310895) | 0,001988 |
| Kartoffel Basissauce (Kartoffelbowls) | 40 g | 25 g | 0,004380 | CALKU-Rezept `quark_kartoffel_bowl` | Basissauce Kartoffel vegan (792707) | 0,004012 |
| Röstzwiebeln (Kartoffelbowls) | 5 g | 5 g | 0,005080 | Einkaufspreisliste (artikel im Schnappschuss), Artikel „Röstzwiebeln (kg)“ | Röstzwiebeln (kg) (63102) | 0,005080 |
| Quinoa Reismix (Reisbowls) | 150 g | 100 g | 0,001450 | CALKU-Rezept `ki_1782923311403_0_2zqy` | Quinoa Reis gekocht (XXX) | 0,001450 |

Klein = ⅔ der Normal-Menge, auf 5 g gerundet (Reis fest 100 g). Lieferant überall Transgourmet.

## Varianten

Wareneinsatz (WE) = Zutatenkosten ohne Verpackung; Quote = WE inkl. Verpackung in % vom VK außer Haus netto (7 % MwSt.), so wie die App rechnet. Ampel rot ab 26,0 % (Schwellwert Bowls). VK ist vom Original übernommen — **bitte prüfen**, Kartoffel- und Reis-Bowls kosten in der Kasse ggf. mehr.

| Variante | id | Untergruppe | Zutaten | WE alt | WE neu | VK brutto | Quote alt | Quote neu |
|---|---|---|---|---|---|---|---|---|
| Julius Caesar Kartoffel Normal | `bowl_normal_julius_caesar_kartoffel` | Kartoffelbowls | Salatmix 100 g, Caesar Dressing 20 g, Kirschtomaten 50 g, Ei (gekocht) 50 g, Hartkäse 20 g, Hähnchen 80 g, Caesar Dressing 10 g, Croutons 10 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 1,85 € | 2,51 € | 12,95 € | 17,3 % | 22,8 % |
| Julius Caesar Reis Normal | `bowl_normal_julius_caesar_reis` | Reisbowls | Salatmix 100 g, Caesar Dressing 20 g, Kirschtomaten 50 g, Ei (gekocht) 50 g, Hartkäse 20 g, Hähnchen 80 g, Caesar Dressing 10 g, Croutons 10 g, **Quinoa Reismix 150 g** | 1,85 € | 2,07 € | 12,95 € | 17,3 % | 19,1 % |
| Teriyaki Chicken Kartoffel Normal | `bowl_normal_teriyaki_chicken_kartoffel` | Kartoffelbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Karottenstifte 30 g, Gurkenwürfel 40 g, Hähnchen 80 g, Teriyaki Sauce 5 g, Sesam Streuer 5 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 1,70 € | 2,36 € | 11,95 € | 17,5 % | 23,4 % |
| Teriyaki Chicken Reis Normal | `bowl_normal_teriyaki_chicken_reis` | Reisbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Karottenstifte 30 g, Gurkenwürfel 40 g, Hähnchen 80 g, Teriyaki Sauce 5 g, Sesam Streuer 5 g, **Quinoa Reismix 150 g** | 1,70 € | 1,92 € | 11,95 € | 17,5 % | 19,4 % |
| Falafel Freunde Kartoffel Normal | `bowl_normal_falafel_freunde_kartoffel` | Kartoffelbowls | Salatmix 100 g, Wild Karachi Dressing 20 g, Avocado 40 g, Karottenstifte 30 g, Rotkohl 50 g, Falafel à 80 g, Nordic Vegan 10 g, Körnermix 10 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 1,81 € | 2,47 € | 11,95 € | 18,5 % | 24,4 % |
| Falafel Freunde Reis Normal | `bowl_normal_falafel_freunde_reis` | Reisbowls | Salatmix 100 g, Wild Karachi Dressing 20 g, Avocado 40 g, Karottenstifte 30 g, Rotkohl 50 g, Falafel à 80 g, Nordic Vegan 10 g, Körnermix 10 g, **Quinoa Reismix 150 g** | 1,81 € | 2,03 € | 11,95 € | 18,5 % | 20,4 % |
| Chicken Avocado Crush Kartoffel Normal | `bowl_normal_chicken_avocado_crush_kartoffel` | Kartoffelbowls | Salatmix 100 g, Zitronenvinaigr 20 g, Avocado 40 g, Kirschtomaten 50 g, Gurkenwürfel 40 g, Hähnchen 80 g, Chipotle Sauce 10 g, Körnermix 10 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 2,04 € | 2,70 € | 12,95 € | 18,9 % | 24,4 % |
| Chicken Avocado Crush Reis Normal | `bowl_normal_chicken_avocado_crush_reis` | Reisbowls | Salatmix 100 g, Zitronenvinaigr 20 g, Avocado 40 g, Kirschtomaten 50 g, Gurkenwürfel 40 g, Hähnchen 80 g, Chipotle Sauce 10 g, Körnermix 10 g, **Quinoa Reismix 150 g** | 2,04 € | 2,26 € | 12,95 € | 18,9 % | 20,7 % |
| Beef Banditos Kartoffel Normal | `bowl_normal_beef_banditos_kartoffel` | Kartoffelbowls | Salatmix 100 g, Cinnam.Dressing 20 g, Kirschtomaten 50 g, Mais 30 g, Rotkohl 50 g, Pulled Beef 80 g, Chipotle Sauce 10 g, 6 Tortilla Chips 20 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 2,80 € | 3,46 € | 12,95 € | 25,2 % | 30,7 % 🔴 |
| Beef Banditos Reis Normal | `bowl_normal_beef_banditos_reis` | Reisbowls | Salatmix 100 g, Cinnam.Dressing 20 g, Kirschtomaten 50 g, Mais 30 g, Rotkohl 50 g, Pulled Beef 80 g, Chipotle Sauce 10 g, 6 Tortilla Chips 20 g, **Quinoa Reismix 150 g** | 2,80 € | 3,02 € | 12,95 € | 25,2 % | 27,0 % 🔴 |
| Lachsfang Kartoffel Normal | `bowl_normal_lachsfang_kartoffel` | Kartoffelbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Karottenstifte 30 g, Gurkenwürfel 40 g, Pulled Lachs 50 g, Teriyaki Sauce 5 g, Sesam Streuer 5 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 2,10 € | 2,76 € | 13,95 € | 18,0 % | 23,1 % |
| Lachsfang Reis Normal | `bowl_normal_lachsfang_reis` | Reisbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Karottenstifte 30 g, Gurkenwürfel 40 g, Pulled Lachs 50 g, Teriyaki Sauce 5 g, Sesam Streuer 5 g, **Quinoa Reismix 150 g** | 2,10 € | 2,32 € | 13,95 € | 18,0 % | 19,7 % |
| Soya Power Kartoffel Normal | `bowl_normal_soya_power_kartoffel` | Kartoffelbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Rotkohl 50 g, Gurkenwürfel 40 g, Sesam Tofu 60 g, Erdnuss Sauce 10 g, Erdnüsse (10g) 10 g, **Kartoffeln gegart 230 g**, **Kartoffel Basissauce 40 g**, **Röstzwiebeln 5 g** | 2,06 € | 2,72 € | 12,95 € | 19,1 % | 24,5 % |
| Soya Power Reis Normal | `bowl_normal_soya_power_reis` | Reisbowls | Salatmix 100 g, ger. Sesam Dressing 20 g, Edamame 40 g, Rotkohl 50 g, Gurkenwürfel 40 g, Sesam Tofu 60 g, Erdnuss Sauce 10 g, Erdnüsse (10g) 10 g, **Quinoa Reismix 150 g** | 2,06 € | 2,28 € | 12,95 € | 19,1 % | 20,9 % |
| Julius Caesar Kartoffel Klein | `bowl_klein_julius_caesar_kartoffel` | Kartoffelbowls | Salatmix 60 g, Caesar Dressing 10 g, Kirschtomaten 25 g, Ei (gekocht) 50 g, Hartkäse 10 g, Hähnchen 50 g, Caesar Dressing 5 g, Croutons 10 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,10 € | 1,54 € | 8,95 € | 16,1 % | 21,4 % |
| Julius Caesar Reis Klein | `bowl_klein_julius_caesar_reis` | Reisbowls | Salatmix 60 g, Caesar Dressing 10 g, Kirschtomaten 25 g, Ei (gekocht) 50 g, Hartkäse 10 g, Hähnchen 50 g, Caesar Dressing 5 g, Croutons 10 g, **Quinoa Reismix 100 g** | 1,10 € | 1,24 € | 8,95 € | 16,1 % | 17,8 % |
| Teriyaki Chicken Kartoffel Klein | `bowl_klein_teriyaki_chicken_kartoffel` | Kartoffelbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Karottenstifte 20 g, Gurkenwürfel 20 g, Hähnchen 50 g, Teriyaki Sauce 3 g, Sesam Streuer 5 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,04 € | 1,48 € | 7,95 € | 17,3 % | 23,3 % |
| Teriyaki Chicken Reis Klein | `bowl_klein_teriyaki_chicken_reis` | Reisbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Karottenstifte 20 g, Gurkenwürfel 20 g, Hähnchen 50 g, Teriyaki Sauce 3 g, Sesam Streuer 5 g, **Quinoa Reismix 100 g** | 1,04 € | 1,18 € | 7,95 € | 17,3 % | 19,2 % |
| Falafel Freunde Kartoffel Klein | `bowl_klein_falafel_freunde_kartoffel` | Kartoffelbowls | Salatmix 60 g, Wild Karachi Dressing 10 g, Avocado 25 g, Karottenstifte 20 g, Rotkohl 25 g, Falafel à 20 g, Nordic Vegan 5 g, Körnermix 10 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,01 € | 1,46 € | 7,95 € | 17,0 % | 23,0 % |
| Falafel Freunde Reis Klein | `bowl_klein_falafel_freunde_reis` | Reisbowls | Salatmix 60 g, Wild Karachi Dressing 10 g, Avocado 25 g, Karottenstifte 20 g, Rotkohl 25 g, Falafel à 20 g, Nordic Vegan 5 g, Körnermix 10 g, **Quinoa Reismix 100 g** | 1,01 € | 1,16 € | 7,95 € | 17,0 % | 18,9 % |
| Chicken Avocado Crush Kartoffel Klein | `bowl_klein_chicken_avocado_crush_kartoffel` | Kartoffelbowls | Salatmix 60 g, Zitronenvinaigr 20 g, Avocado 25 g, Kirschtomaten 25 g, Gurkenwürfel 20 g, Hähnchen 50 g, Chipotle Sauce 5 g, Körnermix 10 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,36 € | 1,80 € | 8,95 € | 19,3 % | 24,6 % |
| Chicken Avocado Crush Reis Klein | `bowl_klein_chicken_avocado_crush_reis` | Reisbowls | Salatmix 60 g, Zitronenvinaigr 20 g, Avocado 25 g, Kirschtomaten 25 g, Gurkenwürfel 20 g, Hähnchen 50 g, Chipotle Sauce 5 g, Körnermix 10 g, **Quinoa Reismix 100 g** | 1,36 € | 1,51 € | 8,95 € | 19,3 % | 21,0 % |
| Beef Banditos Kartoffel Klein | `bowl_klein_beef_banditos_kartoffel` | Kartoffelbowls | Salatmix 60 g, Cinnam.Dressing 20 g, Kirschtomaten 25 g, Mais 20 g, Rotkohl 25 g, Pulled Beef 50 g, Chipotle Sauce 5 g, 3 Tortilla Chips 10 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,73 € | 2,18 € | 8,95 € | 23,7 % | 29,0 % 🔴 |
| Beef Banditos Reis Klein | `bowl_klein_beef_banditos_reis` | Reisbowls | Salatmix 60 g, Cinnam.Dressing 20 g, Kirschtomaten 25 g, Mais 20 g, Rotkohl 25 g, Pulled Beef 50 g, Chipotle Sauce 5 g, 3 Tortilla Chips 10 g, **Quinoa Reismix 100 g** | 1,73 € | 1,88 € | 8,95 € | 23,7 % | 25,5 % |
| Lachsfang Kartoffel Klein | `bowl_klein_lachsfang_kartoffel` | Kartoffelbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Karottenstifte 20 g, Gurkenwürfel 20 g, Pulled Lachs 40 g, Teriyaki Sauce 3 g, Sesam Streuer 5 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,45 € | 1,89 € | 9,95 € | 18,3 % | 23,0 % |
| Lachsfang Reis Klein | `bowl_klein_lachsfang_reis` | Reisbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Karottenstifte 20 g, Gurkenwürfel 20 g, Pulled Lachs 40 g, Teriyaki Sauce 3 g, Sesam Streuer 5 g, **Quinoa Reismix 100 g** | 1,45 € | 1,59 € | 9,95 € | 18,3 % | 19,8 % |
| Soya Power Kartoffel Klein | `bowl_klein_soya_power_kartoffel` | Kartoffelbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Rotkohl 25 g, Gurkenwürfel 20 g, Sesam Tofu 40 g, Erdnuss Sauce 5 g, Erdnüsse (10g) 10 g, **Kartoffeln gegart 155 g**, **Kartoffel Basissauce 25 g**, **Röstzwiebeln 5 g** | 1,29 € | 1,73 € | 8,95 € | 18,4 % | 23,7 % |
| Soya Power Reis Klein | `bowl_klein_soya_power_reis` | Reisbowls | Salatmix 60 g, ger. Sesam Dressing 10 g, Edamame 25 g, Rotkohl 25 g, Gurkenwürfel 20 g, Sesam Tofu 40 g, Erdnuss Sauce 5 g, Erdnüsse (10g) 10 g, **Quinoa Reismix 100 g** | 1,29 € | 1,43 € | 8,95 € | 18,4 % | 20,1 % |

**3 Varianten liegen über 26,0 %** (mit dem VK des Originals):

- Beef Banditos Kartoffel Normal: 30,7 %
- Beef Banditos Reis Normal: 27,0 %
- Beef Banditos Kartoffel Klein: 29,0 %

## Annahmen — bitte bestätigen

1. **Mengen der Basis:** Kartoffeln gegart 230 g, Kartoffel Basissauce 40 g,
   Röstzwiebeln 5 g (normal); Klein jeweils ⅔ auf 5 g gerundet
   (155 / 25 / 5 g). Reis: Quinoa Reismix 150 g normal, 100 g klein.
   Abweichende Vorbilder: die Excel-Kalkulation (Blatt `Bowls_Kartoffel`)
   und die Quark Kartoffel Bowl führen Röstzwiebeln mit 10 bzw. 15 g; die
   Korean Glaze Bowl und das Excel-Blatt `Reis_Bowls` rechnen mit 200 g Reis
   normal / 100 g klein. Die Mengen stehen als Konstanten oben im Generator.
2. **Zutatennamen** exakt wie schon in CALKU: „Kartoffeln gegart“,
   „Kartoffel Basissauce“, „Röstzwiebeln“ (Quark Kartoffel Bowl) und
   „Quinoa Reismix“ (Korean Glaze Bowl). Keine neuen Zutaten.
3. **Preise:**
   - Kartoffeln gegart: 0,001988 €/g aus Einkaufspreisliste (artikel im Schnappschuss), Artikel „Garkartoffel“ — steht in `quark_kartoffel_bowl` bisher mit 0 €
   - Kartoffel Basissauce: 0,004380 €/g aus CALKU-Rezept `quark_kartoffel_bowl` — die Einkaufspreisliste sagt 0,004012 €/g (Basissauce Kartoffel vegan, TG 792707); der Rezeptpreis wurde übernommen, bitte klären, welcher gilt
   - Röstzwiebeln: 0,005080 €/g aus Einkaufspreisliste (artikel im Schnappschuss), Artikel „Röstzwiebeln (kg)“ — steht in `quark_kartoffel_bowl` bisher mit 0 €
   - Quinoa Reismix: 0,001450 €/g aus CALKU-Rezept `ki_1782923311403_0_2zqy`
   Alle Listenpreise tragen das Prüfdatum 21.03.2025. Garkartoffel ist 1:1
   als „Kartoffeln gegart“ gerechnet (kein Garverlust angesetzt).
   „Quinoa Reismix“ / „Quinoa Reis gekocht“ hat in der Preisliste keine
   Transgourmet-Artikelnummer (Platzhalter XXX) — für den Bestellvorschlag
   fehlt damit die Zuordnung zum Rohartikel (Jasminreis 358785 / Quinoa Bunt
   952717).
4. **VK, Verpackung, Kampagne:** vom Original übernommen (Verpackung 0,25 €, keine Kampagne).
5. **Namen:** „<Bowl> Kartoffel Normal“ / „<Bowl> Reis Klein“ — der
   Größenzusatz bleibt wie bei allen CALKU-Bowls hinten, so wie in der Kasse
   („Julius Caesar Kartoffel (normal)“).
6. **Originale unverändert.** Der Import kann bestehende Produkte nicht
   ändern, nur über `entfernen` ersetzen. Mit einem Schnappschuss vom 02.08.
   würde das Live-Änderungen überschreiben, deshalb fasst die Importdatei die
   Originale nicht an. Die App zeigt Bowls ohne Untergruppe ohnehin als
   „Salatbowls“ (Default in `src/App.jsx`).

## To-do Susanne

1. Tabelle oben prüfen: Mengen der Basis, Preise, VK je Variante.
2. In CALKU anmelden → „Rezepte importieren“ → `import_bowl_basis.json`
   wählen. Erwartete Meldung: „✓ 28 Rezepte importiert“
   (Produkte, deren id oder Name schon existiert, überspringt der Import).
3. Prüfen, oben „Speichern“ / „In Cloud speichern“.
4. Bei den 14 Original-Bowls im Bearbeiten-Dialog die Untergruppe
   „Salatbowls“ ausdrücklich setzen (aktuell leer, wird nur als Default
   angezeigt).
5. Nebenbefund: in der Quark Kartoffel Bowl stehen „Kartoffeln gegart“ und
   „Röstzwiebeln“ mit 0 € — die Preise aus der Tabelle oben passen dort auch.
6. Sobald die Wilde Ziege live ist: frischen JSON-Export ziehen, Generator
   erneut laufen lassen, die vier neuen Varianten nachimportieren.

## Danach (Mark, nicht Susanne)

Die Kassen-Zuordnung in BigQuery (`igorder_mapping_verkaufsartikel`, 42 Zeilen
„… Kartoffel …“ / „… Reis …“) wird von den bisherigen Salat-Rezepten auf die
neuen ids `<id>_kartoffel` / `<id>_reis` umgehängt. Erst dann rechnet der
Forecast Kartoffeln, Basissauce, Röstzwiebeln und Reis in den Bedarf.

