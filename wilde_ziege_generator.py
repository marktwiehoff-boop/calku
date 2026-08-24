# -*- coding: utf-8 -*-
"""Rezeptur "Wilde Ziege" aus dem PDF "Mini Rezept neu" nach CALKU.

Quelle: Marks PDF vom 07.08.2026, Tabelle "Wilde Ziege" (Spalten Bowl/Salat).
Die Wilde Ziege fehlte in CALKU komplett - dadurch konnte der Forecast fuer
ihre vier Verkaufsvarianten keinen Zutatenbedarf rechnen (rund 3.700 EUR
Quartalsumsatz allein in Mannheim).

HAUSHALTSMASSE: Das PDF rechnet in EL und Cup, CALKU in Gramm. Die Faktoren
sind NICHT geraten, sondern aus Rezepten abgeleitet, die in BEIDEN Quellen
stehen (Julius Caesar, Lachsfang, Beef Banditos, Falafel Freunde, Soya Power):
    1 EL      = 10 g   (Knuspererbsen -> Koernermix)
    1/4 Cup   = 40 g   (Gurke -> Gurkenwuerfel, Edamame, Avocado)
    1/4 Cup   = 50 g   bei Tomaten (Cocktailtomaten -> Kirschtomaten)
    1/3 Cup   = 50 g   (Pulled Lachs)
    1/2 Cup   = 80 g   (Pfannenhaehnchen -> Haehnchen, Pulled Beef)

CALKU-KONVENTION der bestehenden Bowls, hier uebernommen:
  - Die Bowl-Basis (Kartoffel/Reis 230 g, Basissauce 40 ml, Roestzwiebel)
    steht in KEINEM CALKU-Bowlrezept und bleibt deshalb auch hier aussen vor.
  - "Normal" nimmt die Salatmenge der PDF-Spalte Salat (100 g) und die
    Dressingmenge der Spalte Bowl (20 ml).
  - "Klein" folgt dem Verhaeltnis von Julius Caesar Klein zu Normal:
    Salat 60/100, Dressing und Tomaten halb, Kaese halb, Kleinkram unveraendert.

Ausfuehren:  py -3 wilde_ziege_generator.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HIER = Path(__file__).resolve().parent
STAND = HIER / "src" / "data" / "stand_2026-08-02b.json"
ZIEL_JSON = HIER / "import_wilde_ziege.json"
ZIEL_REPORT = HIER / "wilde_ziege_report.md"

# (CALKU-Zutat, PDF-Angabe, Gramm Normal, Gramm Klein, Herkunft der Umrechnung)
ZUTATEN = [
    ("Salatmix",              "Mixsalat 50 g Bowl / 100 g Salat", 100, 60,
     "PDF-Spalte Salat; Klein wie Julius Caesar (60 g)"),
    ("w. Balsamico Dressing", "20 ml Bowl / 60 ml Salat",          20, 10,
     "PDF-Spalte Bowl; Klein halb, wie Julius Caesar"),
    ("Kirschtomaten",         "Cocktailtomaten 1/4 Cup",           50, 25,
     "1/4 Cup Tomaten = 50 g (Beef Banditos, Julius Caesar)"),
    ("Pink Onions",           "10 g",                              10, 10,
     "direkt aus dem PDF"),
    ("Grillgemüse",           "1/4 Cup",                           40, 25,
     "1/4 Cup Gemüse = 40 g (Gurke, Edamame, Avocado)"),
    ("Bedda Hirtenkäse",      "1/3 Cup",                           50, 30,
     "1/3 Cup = 50 g (Pulled Lachs); Klein anteilig"),
    ("Walnüsse",              "1 EL",                              10, 10,
     "1 EL = 10 g (Knuspererbsen -> Körnermix)"),
    ("Balsamico Creme",       "2 ml",                               2,  2,
     "direkt aus dem PDF"),
]

# Basiszeilen des PDF, die CALKU bei ALLEN Bowls weglaesst
WEGGELASSEN = [
    ("Kartoffel Gegart", "230 g"),
    ("Basissauce",        "40 ml"),
    ("Röstzwiebel",       "1 EL"),
]

PRODUKTE = [
    ("bowl_normal_wilde_ziege", "Wilde Ziege Normal", 2),
    ("bowl_klein_wilde_ziege",  "Wilde Ziege Klein",  3),
]


def main():
    stand = json.loads(STAND.read_text(encoding="utf-8"))
    preise = {}
    for produkt in stand["produkte"]:
        for zutat in produkt["zutaten"]:
            preise.setdefault(zutat["name"], zutat.get("preis_pro_g") or 0.0)

    # Vergleichsprodukt fuer VK und Verpackung
    vorbild = {p["name"]: p for p in stand["produkte"]}
    vk_normal = vorbild["Julius Caesar Normal"]
    vk_klein = vorbild["Julius Caesar Klein"]

    produkte, ohne_preis = [], set()
    for produkt_id, name, spalte in PRODUKTE:
        muster = vk_normal if "Normal" in name else vk_klein
        zutaten = []
        for calku_name, _pdf, gramm_normal, gramm_klein, _q in ZUTATEN:
            menge = gramm_normal if "Normal" in name else gramm_klein
            preis = preise.get(calku_name)
            if preis is None:
                ohne_preis.add(calku_name)
                preis = 0.0
            zutaten.append({
                "name": calku_name,
                "menge_g": float(menge),
                "lieferant": "Transgourmet",
                "preis_pro_g": preis,
                "cost": round(menge * preis, 6),
            })
        produkte.append({
            "id": produkt_id,
            "name": name,
            "gruppe": "Bowls",
            "untergruppe": None,
            "verpackung_eur": muster.get("verpackung_eur", 0),
            "vk_in_brutto": muster.get("vk_in_brutto", 0),
            "vk_out_brutto": muster.get("vk_out_brutto", 0),
            "kampagne_start": None,
            "kampagne_ende": None,
            "zutaten": zutaten,
        })

    ZIEL_JSON.write_text(json.dumps({
        "meta": {
            "quelle": "PDF 'Mini Rezept neu', Tabelle Wilde Ziege",
            "erzeugt": "2026-08-07",
            "hinweis": "Haushaltsmaße über Vergleichsrezepte in Gramm "
                       "umgerechnet, Herkunft je Zeile im Report.",
        },
        "produkte": produkte,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    zeilen = ["# Wilde Ziege — Rezeptur aus dem PDF", "",
              "Zwei Produkte für CALKU, passend zu den vier Verkaufsvarianten",
              "(Kartoffel/Reis/Salat, klein und normal).", "",
              "| Zutat | PDF | Normal | Klein | Umrechnung |",
              "|---|---|---|---|---|"]
    for calku_name, pdf, gn, gk, quelle in ZUTATEN:
        marke = " ⚠️" if calku_name in ohne_preis else ""
        zeilen.append(f"| {calku_name}{marke} | {pdf} | {gn} g | {gk} g | {quelle} |")
    zeilen += ["", "## Bewusst weggelassen", "",
               "Die Bowl-Basis steht in **keinem** CALKU-Bowlrezept — weder bei",
               "Julius Caesar noch bei Lachsfang, Beef Banditos, Soya Power oder",
               "Falafel Freunde. Die Wilde Ziege folgt dieser Konvention:", ""]
    for name, menge in WEGGELASSEN:
        zeilen.append(f"- {name} ({menge})")
    zeilen += ["",
               "Das ist eine bestehende Lücke im System, keine Entscheidung dieses",
               "Imports: Kartoffeln und Reis für Bowls tauchen dadurch in keinem",
               "Bestellvorschlag auf. Separat zu klären.", ""]
    if ohne_preis:
        zeilen += ["## ⚠️ Zutaten ohne Preis in CALKU", "",
                   "Diese Zutaten gibt es noch nicht. Sie sind mit 0 € angelegt, der",
                   "Wareneinsatz der Wilden Ziege ist deshalb noch unvollständig, und",
                   "für igorder fehlt ihnen zusätzlich die Transgourmet-Artikelnummer:", ""]
        for name in sorted(ohne_preis):
            zeilen.append(f"- **{name}**")
    ZIEL_REPORT.write_text("\n".join(zeilen) + "\n", encoding="utf-8")

    print(f"Import: {ZIEL_JSON.name} ({len(produkte)} Produkte)")
    for p in produkte:
        we = sum(z["cost"] for z in p["zutaten"])
        print(f"   {p['name']:<20} {len(p['zutaten'])} Zutaten, "
              f"Wareneinsatz bisher {we:.2f} EUR (ohne die neuen Zutaten)")
    print(f"\nOhne Preis in CALKU ({len(ohne_preis)}): {', '.join(sorted(ohne_preis))}")
    print(f"Report: {ZIEL_REPORT.name}")


if __name__ == "__main__":
    main()
