# -*- coding: utf-8 -*-
"""
Baut aus Susannes Rezepturvorlage (immergruen_acai_rezepturen.xlsx) und der
Bestellliste (Bestellliste Acai Bowl.xlsx) die CALKU-Importdatei
import_acai_bowls.json.

Erzeugt sechs Produkte: Classic und Pistazie in je 0,3 / 0,4 / 0,5 l,
Warengruppe Kampagnen, Kampagne "Acai Bowls".

Die Handlungsanweisungen aus Susannes Spalte wandern als bon_anweisung an die
Zutat und erscheinen damit direkt auf dem Produktionsbon. Die Zutatennamen
bleiben genau ihr Wortlaut, damit der Bon so liest, wie sie ihn entworfen hat.

Einkaufspreise sind aus der Bestellliste gerechnet (Preis geteilt durch
Gebindegewicht). Sie stehen direkt an der Rezeptzeile, weil die meisten
Artikel noch nicht in der CALKU-Einkaufspreisliste stehen.
"""
import json, io

# Einkaufspreise in Euro je Gramm, gerechnet aus Gebinde und Preis der Bestellliste
PREIS = {
    "Erdnussbutter":                  45.43 / 10000,
    "Pistaziensauce":                 13.92 / 950,
    "Kokos-Joghurt Greek Style pur":   8.94 / 2500,
    "Granola (Kölln Knusper Klassik)":  8.42 / 2000,
    "Erdnüsse":                        1.95 / 200,
    "Blaubeeren frisch":               4.09 / 500,
    "Banane (Scheiben)":               1.49 / 1000,
    "Cacao Nibs":                    182.03 / 6000,
    "Kokoschips (Layer)":              4.98 / 600,
    "Kokoschips (Streu-Deko)":         4.98 / 600,
    "Goji-Beeren":                    20.90 / 1000,
}
# Acai-Püree TK, Artikel 826897, 6 kg zu 49,66 Euro
ACAI = 49.66 / 6000
for schicht in ("Açaí (Schicht 1 – Boden)", "Açaí (Schicht 2)", "Açaí (Schicht 3 – Deckschicht)"):
    PREIS[schicht] = ACAI

# Chia-Kokos-Pudding ist eine Vorproduktion (Blatt "Chia-Pudding Vortag"):
# 1000 g Kokos-Joghurt + 120 g Chiasamen + 30 g Agavendicksaft ergeben ca. 1150 g.
PUDDING = (1000 * (8.94 / 2500) + 120 * (6.82 / 1000) + 30 * (1.99 / 340)) / 1150
PREIS["Chia-Kokos-Pudding"] = PUDDING

GROESSEN = [("0,3 l", 0, 8.95), ("0,4 l", 1, 9.95), ("0,5 l", 2, 10.95)]

# (Zutat, [g bei 0,3 / 0,4 / 0,5], Handlungsanweisung) in Bau-Reihenfolge
CLASSIC = [
    ("Erdnussbutter", [22, 30, 38], "Am Becherrand rundherum verteilen (Coating), sichtbar von außen"),
    ("Açaí (Schicht 1 – Boden)", [60, 80, 100], "Gleichmäßig einfüllen, Boden komplett bedecken"),
    ("Chia-Kokos-Pudding", [38, 50, 63], "Aus Quetschflasche kreisend auftragen"),
    ("Açaí (Schicht 2)", [60, 80, 100], "Gleichmäßig einfüllen"),
    ("Granola (Kölln Knusper Klassik)", [30, 45, 50], "Gleichmäßig einstreuen"),
    ("Erdnüsse", [8, 10, 13], "Gleichmäßig einstreuen"),
    ("Açaí (Schicht 3 – Deckschicht)", [60, 80, 100], "Glatt abschließen, saubere Oberfläche"),
    ("Blaubeeren frisch", [15, 20, 25], "Dekorativ auf eine Seite legen"),
    ("Banane (Scheiben)", [30, 40, 50], "Bananenschneider für gleichmäßige Scheiben, fächern"),
    ("Cacao Nibs", [4, 5, 5], "Sparsam über die Mitte streuen"),
]
PISTAZIE = [
    ("Pistaziensauce", [22, 30, 38], "Am Becherrand rundherum verteilen (Coating), sichtbar von außen"),
    ("Açaí (Schicht 1 – Boden)", [60, 80, 100], "Gleichmäßig einfüllen, Boden komplett bedecken"),
    ("Kokos-Joghurt Greek Style pur", [38, 50, 63], "Gleichmäßig auftragen"),
    ("Açaí (Schicht 2)", [60, 80, 100], "Gleichmäßig einfüllen"),
    ("Granola (Kölln Knusper Klassik)", [30, 45, 50], "Gleichmäßig einstreuen"),
    ("Kokoschips (Layer)", [8, 10, 13], "Gleichmäßig einstreuen"),
    ("Açaí (Schicht 3 – Deckschicht)", [60, 80, 100], "Glatt abschließen, saubere Oberfläche"),
    ("Goji-Beeren", [5, 5, 5], "Dekorativ verteilen (rot)"),
    ("Kokoschips (Streu-Deko)", [4, 5, 5], "Über die Mitte streuen (hell)"),
    ("Blaubeeren frisch", [15, 20, 25], "Dekorativ auf eine Seite legen (dunkelblau)"),
]

SORTEN = [("Classic", "acai_classic", CLASSIC), ("Pistazie", "acai_pistazie", PISTAZIE)]

produkte = []
for sorte, id_stamm, zeilen in SORTEN:
    for label, spalte, vk in GROESSEN:
        zutaten = []
        for name, mengen, anweisung in zeilen:
            g = mengen[spalte]
            preis = PREIS[name]
            zutaten.append({
                "name": name,
                "menge_g": g,
                "lieferant": "Transgourmet",
                "preis_pro_g": round(preis, 6),
                "cost": round(g * preis, 4),
                "bon_anweisung": anweisung,
            })
        produkte.append({
            "id": f"{id_stamm}_{label.replace(',', '').replace(' ', '')}",
            "name": f"Açaí Bowl {sorte} {label}",
            "gruppe": "Kampagnen",
            "untergruppe": None,
            "kampagne": "Acai Bowls",
            "zutaten": zutaten,
            "verpackung_eur": 0.25,
            "vk_in_brutto": vk,
            "vk_out_brutto": vk,
            "bon_hinweise": "1x Cup = gestrichen bis zum Rand gefüllt\nGrammatur = Zielwert, im Store justierbar\nAçaí immer 3 gleiche Schichten",
        })

# Platzhalter aus der Kampagne, den die sechs echten Rezepte ersetzen.
# ID aus den Exporten vom 01./02.08. (dort noch "Acai 0,3 " in Kampagne "Acai",
# im Stand vom 10.08. umbenannt zu "Acai Classic", Wareneinsatz 0,18 EUR).
# Trifft die ID nicht mehr zu, entfernt der Import schlicht nichts.
PLATZHALTER = ["neu_1783671186003_pwqsv"]

out = {
    "meta": {
        "quelle": "Susanne, immergruen_acai_rezepturen.xlsx + Bestellliste Acai Bowl.xlsx",
        "stand": "2026-08-12",
        "hinweis": "Einkaufspreise aus der Bestellliste gerechnet, noch nicht in der CALKU-Preisliste",
    },
    "entfernen": PLATZHALTER,
    "produkte": produkte,
}
io.open("import_acai_bowls.json", "w", encoding="utf-8").write(
    json.dumps(out, ensure_ascii=False, indent=2))

# Kontrollausgabe
print(f"{len(produkte)} Produkte gebaut\n")
print(f"{'Produkt':30} {'Material':>9} {'+Verp.':>8} {'VK netto':>9} {'WE %':>7}")
for p in produkte:
    mat = sum(z["cost"] for z in p["zutaten"])
    we = mat + p["verpackung_eur"]
    netto = p["vk_out_brutto"] / 1.19
    print(f"{p['name']:30} {mat:8.2f} € {we:7.2f} € {netto:8.2f} € {we/netto*100:6.1f} %")
print("\nAcai-Anteil je Bowl:")
for p in produkte[:3]:
    acai = sum(z["cost"] for z in p["zutaten"] if z["name"].startswith("Açaí"))
    mat = sum(z["cost"] for z in p["zutaten"])
    print(f"  {p['name']:30} {acai:.2f} € von {mat:.2f} €  ({acai/mat*100:.0f} %)")
