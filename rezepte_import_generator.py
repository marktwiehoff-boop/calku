# -*- coding: utf-8 -*-
"""Einmal-Generator: fehlende Rezepturen (Excel, 2026-08-01) als CALKU-Import.

Quelle: Downloads/fehlende Rezepturen.xlsx (Quark Kartoffel, ACE, Mango
Matcha, Strawberry Matcha je 0,3/0,4/0,5 l). Dazu je Matcha die
Sweet-Eis-Variante (= Klassik + Frappe weiss; Menge folgt von Mark,
vorerst 0). VK-Preise aus SIDES (Median letzte 30 Tage Luebeck);
0,3-l-Matchas und Sweet-Varianten sind Startwerte.

Ausgabe: Downloads/calku_rezepte_import_<datum>.json -> in CALKU ueber
den Knopf "Rezepte importieren" einspielen, danach "Speichern".
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

STAND = Path(__file__).parent / "src" / "data" / "stand_2026-06-05.json"
ZIEL = Path.home() / "Downloads" / f"calku_rezepte_import_{date.today().isoformat()}.json"

stand = json.loads(STAND.read_text(encoding="utf-8"))
preise = {}
for p in stand["produkte"]:
    for z in p.get("zutaten", []):
        preise.setdefault(z["name"], z.get("preis_pro_g") or 0)

bowls_verpackung = sorted(
    p.get("verpackung_eur") or 0 for p in stand["produkte"] if p["gruppe"] == "Bowls"
)[len([p for p in stand["produkte"] if p["gruppe"] == "Bowls"]) // 2]


def zutat(name, menge):
    preis = preise.get(name, 0)
    return {"name": name, "menge_g": menge, "lieferant": "Transgourmet",
            "preis_pro_g": preis, "cost": round(menge * preis, 4)}


def produkt(pid, name, gruppe, zutaten, vk, verpackung, portion_ml=None):
    p = {"id": pid, "name": name, "gruppe": gruppe, "untergruppe": None,
         "zutaten": zutaten, "verpackung_eur": verpackung,
         "vk_in_brutto": vk, "vk_out_brutto": vk,
         "kampagne_start": None, "kampagne_ende": None, "alte_kategorie": None}
    if portion_ml:
        p["meta"] = {"portion_ml": portion_ml}
    return p


GROESSEN = [("0,3 l", "03", 300), ("0,4 l", "04", 400), ("0,5 l", "05", 500)]

# ACE: Saefte in ml, Marks Auspress-Semantik -> vorhandene Saft-Zutaten
ACE = {"Frischer Apfelsaft": (100, 150, 200), "Karottensaft": (150, 150, 150),
       "Frischer Orangensaft": (50, 50, 100), "Eiswürfel": (20, 40, 60)}
ACE_VK = {"03": 5.45, "04": 6.45, "05": 6.95}          # aus SIDES

# Matcha-Basis (Klassik = ohne Frappe; Sweet = + Frappe weiss, Menge folgt)
MATCHA = {"Milch": (100, 120, 150), "Eiswürfel": (80, 120, 160),
          "Matcha Pulver": (2, 3, 4)}
MATCHA_VK = {"03": 5.95, "04": 6.95, "05": 7.95}       # 0,3 l geschaetzt

produkte = []

produkte.append(produkt(
    "quark_kartoffel_bowl", "Quark Kartoffel Bowl", "Bowls",
    [zutat("Kartoffeln gegart", 230), zutat("Kartoffel Basissauce", 40),
     zutat("Röstzwiebeln", 15),                        # 10 g Zange + 5 g EL
     zutat("Mixsalat", 50), zutat("Zitronenvinaigr", 20),
     zutat("Kirschtomaten", 40), zutat("Kräuterquark", 100)],
    8.95, bowls_verpackung))

for gr, suffix, ml in GROESSEN:
    idx = {"03": 0, "04": 1, "05": 2}[suffix]
    produkte.append(produkt(
        f"ace_{suffix}", f"Ace {gr}", "Juices",
        [zutat(n, m[idx]) for n, m in ACE.items()],
        ACE_VK[suffix], 0.1165, ml))

for frucht, puree in (("Mango", "Mangopüree"), ("Strawberry", "Erdbeerpüree")):
    for gr, suffix, ml in GROESSEN:
        idx = {"03": 0, "04": 1, "05": 2}[suffix]
        basis = [zutat(n, m[idx]) for n, m in MATCHA.items()]
        basis.append(zutat(puree, (40, 60, 80)[idx]))
        produkte.append(produkt(
            f"{frucht.lower()}_matcha_{suffix}", f"{frucht} Matcha {gr}",
            "Iced Drinks", basis, MATCHA_VK[suffix], 0.12, ml))
        # Sweet-Eis-Variante: + Frappe weiss, IMMER 15 g unabhaengig von der
        # Groesse (Mark, 01.08.2026)
        sweet = [zutat(n, m[idx]) for n, m in MATCHA.items()]
        sweet.append(zutat(puree, (40, 60, 80)[idx]))
        sweet.append(zutat("Frappe weiß", 15))
        produkte.append(produkt(
            f"sweet_eis_matcha_{frucht.lower()}_{suffix}",
            f"Sweet Eis Matcha {frucht} {gr}", "Iced Drinks",
            sweet, MATCHA_VK[suffix], 0.12, ml))

out = {"meta": {"quelle": "fehlende Rezepturen.xlsx", "stand": date.today().isoformat()},
       "produkte": produkte}
ZIEL.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"{len(produkte)} Rezepte -> {ZIEL}")
ohne_preis = sorted({z['name'] for p in produkte for z in p['zutaten']
                     if not z['preis_pro_g'] and z['menge_g'] > 0})
print("Zutaten ohne Startpreis (zieht die App beim Import/Abgleich):",
      ", ".join(ohne_preis))
