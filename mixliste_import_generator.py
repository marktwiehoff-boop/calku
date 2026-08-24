# -*- coding: utf-8 -*-
"""Smoothie-Mixliste 2026 (.xls) -> CALKU-Importdatei.

Quelle der Wahrheit: Smoothie_Mixliste 2026.xls (Susanne/Produktion).
  Seite 1 = Fluessig-Mix je Groesse (Saefte, Milch, Eiswuerfel, Banane)
  Seite 2 = Sorbets, Fruechte, Pulver, Toppings je Groesse

Ausgabe: import_smoothies_mixliste.json fuer den Rezept-Import in CALKU
(ersetzt alle 51 Smoothie-Varianten ueber die entfernen-Liste, behaelt
ids, VK-Preise und Verpackung) + mixliste_diff_report.md.

Loeffel-Konventionen (aus den bestehenden CALKU-Rezepten abgeleitet):
  Vanille Protein Loeffel = 10 g, Kollagen Loeffel = 10 g,
  Spirulina Loeffel/Kickloeffel = 3 g, Haferflocken Loeffel = 30 g,
  Frappe/Kaffee Frappe = Zahl 1:1 (Preis je Loeffel gepflegt),
  Deko am Becherrand (Puerees/Sossen) = 20 g, Teeloeffel Kokosraspeln = 5 g.
Eiswuerfel werden wie bisher nicht bepreist (Wasser, Kostenanteil ~0).

Ausfuehren:  py -3 mixliste_import_generator.py
"""
import json
import re
import sys
from pathlib import Path

import xlrd

sys.stdout.reconfigure(encoding="utf-8")

HIER = Path(__file__).resolve().parent
XLS = Path(r"C:\Users\Media\Downloads\Smoothie_Mixliste 2026.xls")
STAND = HIER / "src" / "data" / "stand_2026-08-01.json"
ZIEL_JSON = HIER / "import_smoothies_mixliste.json"
ZIEL_REPORT = HIER / "mixliste_diff_report.md"

GROESSEN = (400, 500, 600)

# Mixlisten-Name (normalisiert) -> (CALKU-Zutatname, Umrechnung)
# Umrechnung: "g" = Wert ist Gramm/ml, "faktor:<n>" = Wert x n Gramm,
# "fix:<n>" = feste Grammzahl unabhaengig vom Zellwert (Deko-Texte)
ZUTAT_MAP = {
    "milch": ("Milch", "g"),
    "apfelsaft": ("Apfelsaft", "g"),
    "frischer apfelsaft": ("Frischer Apfelsaft", "g"),
    "frischer orangensaft": ("Frischer Orangensaft", "g"),
    "mango / maracujasaft": ("Mangonektar", "g"),
    "mangosaft / maracujasaft": ("Mangonektar", "g"),
    "kokosmilch": ("Kokosmilch", "g"),
    "hafermilch": ("Hafermilch", "g"),
    "honig": ("Honig", "g"),
    "honig in gram": ("Honig", "g"),
    "frischer spinat in gram": ("Frischer Spinat", "g"),
    "erdbeersorbet": ("Erdbeersorbet", "g"),
    "mangosorbet": ("Mangosorbet", "g"),
    "erdbeeren": ("Erdbeeren TK", "g"),
    "himbeere": ("Himbeeren TK", "g"),
    "himbeeren": ("Himbeeren TK", "g"),
    "heidelbeeren": ("Heidelbeeren TK", "g"),
    "ananas": ("Ananas TK", "g"),
    "mango": ("Mango TK", "g"),
    "drachenfrucht": ("Drachenfrucht TK", "g"),
    "naturjoghurt": ("Joghurteis (Naturjoghurt)", "g"),
    "erdnuss butter": ("Erdnussbutter", "g"),
    "frappe (weiss)": ("Frappe weiß", "g"),
    "frappe ( weiss )": ("Frappe weiß", "g"),
    "kaffee frappe": ("Kaffee Frappe", "g"),
    "oreo cookies": ("Oreo Cookies (154g)", "g"),      # Stueck, Preis je Stueck
    "vanille protein": ("Vanille Protein", "faktor:10"),
    "vanille protein loeffel": ("Vanille Protein", "faktor:10"),
    "kollagen loeffel": ("Kollagen Pulver", "faktor:10"),
    "spirulina loeffel klein": ("Spirulina (grün)", "faktor:3"),
    "gruenes spirulina": ("Spirulina (grün)", "fix:3"),   # Kickloeffel Deko
    "blaues spirulina": ("Spirulina (blau)", "fix:3"),
    "haferflocken loeffel": ("Haferflocken", "faktor:30"),
    "haferflocken": ("Haferflocken", "ignorieren"),        # Deko-Streuung
    "kokosraspeln": ("Kokosraspeln", "fix:5"),             # 1 Teeloeffel
    "erdbeerpueree": ("Erdbeerpüree (Deko)", "fix:20"),
    "himbeerpueree": ("Himbeerpüree (Deko)", "fix:20"),
    "schokoladensosse": ("Schokoladensoße", "fix:20"),
    "karamellsosse": ("Karamellsoße", "fix:20"),
    "eiswuerfel": ("Eiswürfel", "faktor:20"),              # 1 Wuerfel = 20 g (Mark, 01.08.)
}

# Preise fuer Zutaten, die bisher in keinem Smoothie-Rezept vorkommen
# (aus der artikel-Sektion des Stands; Oreo = Preis je Stueck)
NEUE_PREISE = {
    "Oreo Cookies (154g)": 0.09928571429,
    "Kokosraspeln": 0.00649,
    # wie in den Iced-Drinks-/Ace-Rezepten (0,80 EUR/kg); Beschaffungsfrage
    # (Eigenproduktion vs. Crushed Ice TK 878375) laeuft separat ueber igorder
    "Eiswürfel": 0.0008,
}

# Preisquelle ist die Einkaufspreisliste (artikel-Sektion). Ausnahmen, bei
# denen bewusst der bisherige Rezeptpreis bleibt, weil die Preisliste selbst
# fraglich ist (Z002 traegt den Frischsaft-Preis, TG-Karton "Sunny" = 1,15):
PREISLISTE_IGNORIEREN = {"Apfelsaft"}


def norm(text):
    t = str(text).strip().lower()
    t = re.sub(r"\s+", " ", t)
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        t = t.replace(a, b)
    return t


def zutat_aufloesen(rohname):
    """Mixlisten-Zeile -> Schluessel in ZUTAT_MAP (Klammerzusaetze ab)."""
    n = norm(rohname)
    n = re.sub(r"\s*\(\s*40\s*g\s*\)", "", n).strip()   # "banane ( 40g )"
    if n in ZUTAT_MAP:
        return n
    if n.startswith("banane"):
        return "banane"
    return None


def wert_in_gramm(schluessel, rohwert, rohname):
    """Zellwert -> Gramm laut Umrechnungsregel; None = Zeile ueberspringen."""
    if schluessel == "banane":
        # numerisch 0.333 Stueck = 40 g; Banana Power: "40 g ( 1/3 )" als Text
        if isinstance(rohwert, (int, float)):
            return 40.0
        m = re.match(r"\s*(\d+)\s*g", str(rohwert))
        if m:
            return float(m.group(1))
        raise ValueError(f"Banane unlesbar: {rohwert!r}")
    ziel, regel = ZUTAT_MAP[schluessel]
    if regel == "ignorieren":
        return None
    if regel.startswith("fix:"):
        return float(regel.split(":")[1])
    if regel.startswith("faktor:"):
        return float(rohwert) * float(regel.split(":")[1])
    return float(rohwert)   # "g"


ZUTAT_MAP["banane"] = ("Banane", "g")   # Sonderfall, eigene Wertlogik


def lese_bloecke(ws):
    """Liest alle Rezeptbloecke eines Blattes (zwei Spaltenbloecke je Zeile)."""
    bloecke = []
    for start_spalte in (0, 5):
        r = 0
        while r < ws.nrows:
            kopf = str(ws.cell_value(r, start_spalte)).strip()
            groesse1 = str(ws.cell_value(r, start_spalte + 1)).strip()
            if kopf and groesse1.startswith("0,4"):
                name = kopf
                zeilen = []
                r += 1
                while r < ws.nrows:
                    z0 = ws.cell_value(r, start_spalte)
                    z0s = str(z0).strip()
                    naechster_kopf = (z0s and str(ws.cell_value(
                        r, start_spalte + 1)).strip().startswith("0,4"))
                    if naechster_kopf:
                        break
                    werte = [ws.cell_value(r, start_spalte + c) for c in (1, 2, 3)]
                    if not z0s:
                        # Summenzeile beendet den Block, Leerzeile nicht
                        if any(str(w).strip() for w in werte):
                            r += 1
                            break
                        r += 1
                        continue
                    zeilen.append((z0s, werte))
                    r += 1
                bloecke.append((name, zeilen))
            else:
                r += 1
    return bloecke


def parse_mixliste():
    wb = xlrd.open_workbook(str(XLS))
    rezepte = {}   # name -> {groesse -> [(calku_zutat, gramm), ...]}
    for ws in (wb.sheet_by_index(0), wb.sheet_by_index(1)):
        for name, zeilen in lese_bloecke(ws):
            produkt = rezepte.setdefault(name, {g: [] for g in GROESSEN})
            for rohname, werte in zeilen:
                schluessel = zutat_aufloesen(rohname)
                if schluessel is None:
                    raise SystemExit(f"Unbekannte Zutat in Mixliste: {rohname!r} ({name})")
                ziel, _ = ZUTAT_MAP[schluessel]
                if ziel is None:
                    continue
                for groesse, roh in zip(GROESSEN, werte):
                    # Deko-Texte stehen nur in der ersten Wertspalte
                    if str(roh).strip() == "" and not isinstance(roh, (int, float)):
                        roh = werte[0]
                    gramm = wert_in_gramm(schluessel, roh, rohname)
                    if gramm is None:
                        break
                    vorhanden = dict(produkt[groesse])
                    if ziel in vorhanden:   # z. B. Spirulina Masse + Deko
                        produkt[groesse] = [(z, m + gramm if z == ziel else m)
                                            for z, m in produkt[groesse]]
                    else:
                        produkt[groesse].append((ziel, gramm))
    return rezepte


def main():
    with open(STAND, encoding="utf-8") as f:
        stand = json.load(f)
    bestand = {p["name"]: p for p in stand["produkte"]
               if p.get("gruppe") == "Smoothies"}

    # Preisaufloesung: Einkaufspreisliste > bisheriger Rezeptpreis > NEUE_PREISE
    preisliste = {(a.get("ingredient_name") or "").lower(): a.get("price_per_gram_ml")
                  for a in stand.get("artikel", [])}
    rezeptpreise = {}
    for p in bestand.values():
        for z in p["zutaten"]:
            rezeptpreise.setdefault(z["name"], z["preis_pro_g"])
    preise, preiskorrekturen = dict(NEUE_PREISE), []
    for name, alt_preis in rezeptpreise.items():
        aus_liste = preisliste.get(name.lower())
        if (name not in PREISLISTE_IGNORIEREN and aus_liste
                and abs(aus_liste - (alt_preis or 0)) > 1e-9):
            preise[name] = aus_liste
            preiskorrekturen.append((name, alt_preis, aus_liste))
        else:
            preise[name] = alt_preis

    rezepte = parse_mixliste()

    produkte, entfernen, diffs = [], [], []
    for mix_name in sorted(rezepte):
        for groesse in GROESSEN:
            calku_name = f"{mix_name} {groesse}ml"
            alt = bestand.get(calku_name)
            if alt is None:
                raise SystemExit(f"Kein CALKU-Produkt zu {calku_name!r} gefunden")
            zutaten = []
            for zutat_name, gramm in rezepte[mix_name][groesse]:
                if zutat_name not in preise:
                    raise SystemExit(f"Kein Preis fuer Zutat {zutat_name!r}")
                preis = preise[zutat_name]
                zutaten.append({
                    "name": zutat_name,
                    "menge_g": round(gramm, 2),
                    "lieferant": "Transgourmet",
                    "preis_pro_g": preis,
                    "cost": round(gramm * (preis or 0), 6),
                })
            neu = {k: v for k, v in alt.items() if k != "zutaten"}
            neu["zutaten"] = zutaten
            produkte.append(neu)
            entfernen.append(alt["id"])

            # Diff alt vs. neu
            alt_mengen = {z["name"]: z["menge_g"] for z in alt["zutaten"]}
            neu_mengen = {z["name"]: z["menge_g"] for z in zutaten}
            for name in sorted(set(alt_mengen) | set(neu_mengen)):
                a, n = alt_mengen.get(name), neu_mengen.get(name)
                if a is None:
                    diffs.append((calku_name, f"NEU {name} {n:g} g"))
                elif n is None:
                    diffs.append((calku_name, f"RAUS {name} (war {a:g} g)"))
                elif abs(a - n) > 0.01:
                    diffs.append((calku_name, f"{name} {a:g} -> {n:g} g"))

    out = {
        "meta": {
            "quelle": "Smoothie_Mixliste 2026.xls (Seite 1 + 2)",
            "erzeugt": "2026-08-01",
            "hinweis": "Ersetzt alle 51 Smoothie-Varianten; ids, VK und "
                       "Verpackung bleiben erhalten.",
        },
        "entfernen": entfernen,
        "produkte": produkte,
    }
    with open(ZIEL_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # Wareneinsatz alt/neu je Variante fuer die Uebersicht
    def wareneinsatz(zutaten):
        return sum((z.get("menge_g") or 0) * (z.get("preis_pro_g") or 0)
                   for z in zutaten)

    uebersicht = []
    for neu in produkte:
        alt = bestand[neu["name"]]
        we_alt, we_neu = wareneinsatz(alt["zutaten"]), wareneinsatz(neu["zutaten"])
        vk = neu.get("vk_in_brutto") or 0
        quote = we_neu / (vk / 1.07) * 100 if vk else 0
        uebersicht.append((neu["name"], we_alt, we_neu, vk, quote))

    # Report
    zeilen = ["# Smoothie-Mixliste 2026 -> CALKU: Abweichungsreport", ""]
    zeilen.append(f"51 Varianten neu aus der Mixliste aufgebaut, {len(diffs)} "
                  "Rezeptabweichungen gegenueber dem Stand 2026-08-01. VK-Preise, "
                  "Verpackung und Produkt-ids bleiben unveraendert.")
    zeilen.append("\n## Rezeptabweichungen")
    aktuell = None
    for produkt, text in diffs:
        if produkt != aktuell:
            zeilen.append(f"\n### {produkt}")
            aktuell = produkt
        zeilen.append(f"- {text}")
    zeilen.append("\n## Preiskorrekturen (Quelle: Einkaufspreisliste)")
    for name, alt_p, neu_p in sorted(preiskorrekturen):
        zeilen.append(f"- {name}: {alt_p:.6f} -> {neu_p:.6f} EUR/g "
                      f"(Faktor {neu_p / alt_p:.1f})")
    zeilen += [
        "",
        "## Offene Preisfragen (nicht angefasst)",
        "- Apfelsaft (Karton): Rezept 0,94 EUR/l, Preisliste Z002 sagt 2,30 "
        "(= Frischsaft-Preis?), TG-Artikel Apfelsaft Sunny 331067 sagt 1,15. "
        "Bitte klaeren, welcher gilt - bis dahin bleibt 0,94.",
        "- Banane: Rezept 1,48 EUR/kg; TG-Artikel Bananen 12110510 sagt 1,91 "
        "brutto = 2,73 je kg Fruchtfleisch (70 % Ausbeute).",
        "",
        "## Annahmen (Loeffel-Gewichte)",
        "- Vanille Protein Loeffel 10 g, Kollagen Loeffel 10 g (wie Oat Berry)",
        "- Spirulina Loeffel klein / Kickloeffel je 3 g",
        "- Haferflocken Loeffel 30 g (Deko-Streuung nicht separat bepreist)",
        "- Teeloeffel Kokosraspeln 5 g",
        "- Deko am Becherrand (Puerees, Schoko-/Karamellsosse) 20 g wie bisher",
        "- Oreo: 1 Stueck je Drink, Preis 0,0993 EUR je Stueck (TG 451991)",
        "- Eiswuerfel: 1 Wuerfel = 20 g (Mark, 01.08.), Preis 0,80 EUR/kg wie "
        "in den Iced-Drinks- und Ace-Rezepten; Stueckzahlen aus der Mixliste "
        "(5-13 je Groesse)",
        "",
        "## Wareneinsatz je Variante (ohne Verpackung)",
        "| Produkt | WE alt | WE neu | VK brutto | WE-Quote neu |",
        "|---|---|---|---|---|",
    ]
    for name, we_alt, we_neu, vk, quote in uebersicht:
        zeilen.append(f"| {name} | {we_alt:.2f} | {we_neu:.2f} | "
                      f"{vk:.2f} | {quote:.1f} % |")
    with open(ZIEL_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(zeilen) + "\n")

    print(f"Import:  {ZIEL_JSON.name}  ({len(produkte)} Produkte, "
          f"{len(entfernen)} ersetzt)")
    print(f"Report:  {ZIEL_REPORT.name}  ({len(diffs)} Rezeptabweichungen)")
    print()
    for name, alt_p, neu_p in sorted(preiskorrekturen):
        print(f"  PREIS {name}: {alt_p:.6f} -> {neu_p:.6f} EUR/g")
    for produkt, text in diffs:
        print(f"  {produkt}: {text}")


if __name__ == "__main__":
    main()
