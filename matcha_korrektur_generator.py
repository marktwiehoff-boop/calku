# -*- coding: utf-8 -*-
"""Korrektur-Import fuer die Matcha-Struktur (Mark, 01.08.2026).

Ersetzt die 12 zuerst importierten Matcha-Varianten durch die richtige
Struktur:
  Kategorie "Classic Iced Matcha": Mango Matcha, Strawberry Matcha
  Kategorie "Sweet Iced Matcha":   Sweet Iced Matcha Mango / Strawberry
  jeweils NUR 0,4 l und 0,5 l (keine 0,3-l-Variante mehr).

Erdbeerpuereepreis wird auf 0,004127 EUR/g gesetzt (4,13 EUR/kg) - der
manuell angelegte Preislisten-Artikel traegt vermutlich 4,13 EUR je GRAMM
(Packungsgroesse 1 statt 1000); den Artikel selbst in den Einkaufspreisen
korrigieren, sonst zieht der naechste Abgleich wieder den falschen Wert.

Ausgabe: Downloads/calku_matcha_korrektur_2026-08-01.json
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

STAND = Path(__file__).parent / "src" / "data" / "stand_2026-06-05.json"
ZIEL = Path.home() / "Downloads" / f"calku_matcha_korrektur_{date.today().isoformat()}.json"

stand = json.loads(STAND.read_text(encoding="utf-8"))
preise = {}
for p in stand["produkte"]:
    for z in p.get("zutaten", []):
        preise.setdefault(z["name"], z.get("preis_pro_g") or 0)

# Erdbeerpueree explizit bepreisen: 4,13 EUR/kg (Verdacht: als EUR/g angelegt)
preise["Erdbeerpüree"] = 0.004127

ENTFERNEN = [
    "mango_matcha_03", "mango_matcha_04", "mango_matcha_05",
    "strawberry_matcha_03", "strawberry_matcha_04", "strawberry_matcha_05",
    "sweet_eis_matcha_mango_03", "sweet_eis_matcha_mango_04", "sweet_eis_matcha_mango_05",
    "sweet_eis_matcha_strawberry_03", "sweet_eis_matcha_strawberry_04",
    "sweet_eis_matcha_strawberry_05",
]

GROESSEN = [("0,4 l", "04", 400, 6.95), ("0,5 l", "05", 500, 7.95)]
MATCHA = {"Milch": (120, 150), "Eiswürfel": (120, 160), "Matcha Pulver": (3, 4)}
FRAPPE_SWEET = 15   # immer 15 g, groessenunabhaengig (Mark, 01.08.)


def zutat(name, menge):
    preis = preise.get(name, 0)
    return {"name": name, "menge_g": menge, "lieferant": "Transgourmet",
            "preis_pro_g": preis, "cost": round(menge * preis, 4)}


produkte = []
for frucht, puree in (("Mango", "Mangopüree"), ("Strawberry", "Erdbeerpüree")):
    for gr, suffix, ml, vk in GROESSEN:
        idx = 0 if suffix == "04" else 1
        basis = [zutat(n, m[idx]) for n, m in MATCHA.items()]
        basis.append(zutat(puree, (60, 80)[idx]))
        produkte.append({
            "id": f"classic_iced_matcha_{frucht.lower()}_{suffix}",
            "name": f"{frucht} Matcha {gr}", "gruppe": "Iced Drinks",
            "untergruppe": "Classic Iced Matcha", "zutaten": basis,
            "verpackung_eur": 0.12, "vk_in_brutto": vk, "vk_out_brutto": vk,
            "kampagne_start": None, "kampagne_ende": None,
            "alte_kategorie": None, "meta": {"portion_ml": ml}})
        sweet = [zutat(n, m[idx]) for n, m in MATCHA.items()]
        sweet.append(zutat(puree, (60, 80)[idx]))
        sweet.append(zutat("Frappe weiß", FRAPPE_SWEET))
        produkte.append({
            "id": f"sweet_iced_matcha_{frucht.lower()}_{suffix}",
            "name": f"Sweet Iced Matcha {frucht} {gr}", "gruppe": "Iced Drinks",
            "untergruppe": "Sweet Iced Matcha", "zutaten": sweet,
            "verpackung_eur": 0.12, "vk_in_brutto": vk, "vk_out_brutto": vk,
            "kampagne_start": None, "kampagne_ende": None,
            "alte_kategorie": None, "meta": {"portion_ml": ml}})

out = {"meta": {"quelle": "Matcha-Korrektur (Kategorien, Groessen, Erdbeerpreis)",
                "stand": date.today().isoformat()},
       "entfernen": ENTFERNEN, "produkte": produkte}
ZIEL.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(produkte)} Rezepte (+{len(ENTFERNEN)} zu entfernen) -> {ZIEL}")
for p in produkte:
    material = sum(z["cost"] for z in p["zutaten"])
    print(f"  {p['name']:34s} {p['untergruppe']:20s} Material {material:.2f} EUR")
