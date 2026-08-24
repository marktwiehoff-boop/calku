# -*- coding: utf-8 -*-
"""Eiswuerfel fuer alle Juices -> zweite CALKU-Importdatei.

Marks Vorgabe (02.08.2026): Die Ace-Staffel gilt fuer alle Juices -
1 / 2 / 3 Eiswuerfel je 0,3 / 0,4 / 0,5 l, 1 Wuerfel = 20 g, 0,80 EUR/kg.
Ace selbst hat die Wuerfel schon und bleibt unangetastet; die uebrigen
30 Varianten werden ersetzt (ids, VK, Verpackung bleiben).

Preise der uebrigen Zutaten werden dabei wie beim Smoothie-Import auf die
Einkaufspreisliste gestellt (Ausnahme Apfelsaft-Karton, Preisfrage offen).

Ausfuehren:  py -3 juice_eiswuerfel_generator.py
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HIER = Path(__file__).resolve().parent
STAND = HIER / "src" / "data" / "stand_2026-08-01.json"
ZIEL_JSON = HIER / "import_juices_eiswuerfel.json"
ZIEL_REPORT = HIER / "juice_eiswuerfel_report.md"

WUERFEL_GRAMM = {300: 20.0, 400: 40.0, 500: 60.0}   # Ace-Staffel x 20 g
EIS_PREIS = 0.0008                                   # 0,80 EUR/kg (TG 878375)
PREISLISTE_IGNORIEREN = {"Apfelsaft"}


def groesse_ml(name):
    m = re.search(r"0,(\d)\s*l", name)
    if not m:
        raise SystemExit(f"Keine Groesse im Namen: {name!r}")
    return int(m.group(1)) * 100


def main():
    with open(STAND, encoding="utf-8") as f:
        stand = json.load(f)

    preisliste = {(a.get("ingredient_name") or "").lower(): a.get("price_per_gram_ml")
                  for a in stand.get("artikel", [])}

    produkte, entfernen, korrekturen = [], [], []
    for alt in stand["produkte"]:
        if alt.get("gruppe") != "Juices":
            continue
        if any("eiswürfel" in z["name"].lower() for z in alt["zutaten"]):
            continue   # Ace ist schon versorgt
        ml = groesse_ml(alt["name"])
        zutaten = []
        for z in alt["zutaten"]:
            z = dict(z)
            aus_liste = preisliste.get(z["name"].lower())
            if (z["name"] not in PREISLISTE_IGNORIEREN and aus_liste
                    and abs(aus_liste - (z.get("preis_pro_g") or 0)) > 1e-9):
                korrekturen.append((alt["name"], z["name"],
                                    z.get("preis_pro_g"), aus_liste))
                z["preis_pro_g"] = aus_liste
            z["cost"] = round((z.get("menge_g") or 0) * (z.get("preis_pro_g") or 0), 6)
            zutaten.append(z)
        zutaten.append({
            "name": "Eiswürfel",
            "menge_g": WUERFEL_GRAMM[ml],
            "lieferant": "Transgourmet",
            "preis_pro_g": EIS_PREIS,
            "cost": round(WUERFEL_GRAMM[ml] * EIS_PREIS, 6),
        })
        neu = {k: v for k, v in alt.items() if k != "zutaten"}
        neu["zutaten"] = zutaten
        produkte.append(neu)
        entfernen.append(alt["id"])

    out = {
        "meta": {
            "quelle": "Ace-Staffel auf alle Juices (Mark, 02.08.2026)",
            "erzeugt": "2026-08-02",
            "hinweis": "Ersetzt die 30 Juice-Varianten ohne Eiswuerfel; "
                       "Ace bleibt unveraendert.",
        },
        "entfernen": entfernen,
        "produkte": produkte,
    }
    with open(ZIEL_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    zeilen = [
        "# Juices: Eiswuerfel nach Ace-Staffel", "",
        f"{len(produkte)} Varianten ersetzt (Ace war schon versorgt).",
        "Je Groesse: 0,3 l = 1 Wuerfel (20 g), 0,4 l = 2 (40 g), 0,5 l = 3 (60 g);",
        "Preis 0,80 EUR/kg wie Crushed Ice TK 5kg (TG 878375).",
        "",
        "## Preiskorrekturen (Quelle: Einkaufspreisliste)",
    ]
    je_zutat = {}
    for produkt, zutat, alt_p, neu_p in korrekturen:
        je_zutat.setdefault((zutat, alt_p, neu_p), []).append(produkt)
    for (zutat, alt_p, neu_p), betroffen in sorted(je_zutat.items(), key=str):
        zeilen.append(f"- {zutat}: {alt_p:.6f} -> {neu_p:.6f} EUR/g "
                      f"({len(betroffen)} Varianten)")
    if not je_zutat:
        zeilen.append("- keine")
    with open(ZIEL_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(zeilen) + "\n")

    print(f"Import:  {ZIEL_JSON.name}  ({len(produkte)} Produkte ersetzt)")
    print(f"Report:  {ZIEL_REPORT.name}")
    for (zutat, alt_p, neu_p), betroffen in sorted(je_zutat.items(), key=str):
        print(f"  PREIS {zutat}: {alt_p:.6f} -> {neu_p:.6f} ({len(betroffen)} Varianten)")


if __name__ == "__main__":
    main()
