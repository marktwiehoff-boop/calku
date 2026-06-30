# Setup: KI-Rezept-Upload (Netlify-Function + Git-Anbindung)

Der „Rezept hochladen"-Button schickt die Datei an eine **Netlify-Function**, die
Claude aufruft. Functions werden **nicht** per dist-Drag&Drop deployt — dafür
binden wir die Site an ein Git-Repo. Ab dann: **`git push` = automatischer Deploy**
(Seite **und** Function).

Das Repo ist lokal schon vorbereitet (erster Commit liegt). Es fehlen nur die
Schritte, die nur du machen kannst.

---

## 1) GitHub-Repo anlegen + pushen  (~5 Min)
1. Auf https://github.com → neues, **privates** Repo, z. B. `calku` (ohne README/.gitignore anhaken).
2. Im Projektordner (PowerShell):
   ```powershell
   cd "C:\Users\Media\OneDrive\Desktop\08_Tech_und_Tools\immergrun-cowork\kalkulations-app-deploy"
   git branch -M main
   git remote add origin https://github.com/<DEIN-USER>/calku.git
   git push -u origin main
   ```

## 2) Netlify mit dem Repo verbinden  (~3 Min)
- Variante A (neue Site): Netlify → **Add new site → Import an existing project** → GitHub → `calku` wählen. Build-Command `npm run build`, Publish `dist` (kommen aus `netlify.toml`).
- Variante B (bestehende igcalku-Site behalten): Site **igcalku** → **Site configuration → Build & deploy → Continuous deployment → Link repository** → `calku`.
  → So bleibt die URL **igcalku.netlify.app**.

## 3) Umgebungsvariablen in Netlify setzen  (~3 Min)
**Site configuration → Environment variables → Add a variable:**

| Key | Value | Zweck |
|---|---|---|
| `ANTHROPIC_API_KEY` | dein Claude-API-Key (`sk-ant-…`) | Function (KI-Erkennung) |
| `VITE_SUPABASE_URL` | `https://bvddngdzoppbtmkytqtm.supabase.co` | Build (Login/Cloud) |
| `VITE_SUPABASE_ANON_KEY` | dein anon-Key (`eyJ…`) | Build (Login/Cloud) |

⚠️ Die beiden `VITE_…` sind nötig, weil beim Git-Build **kein** lokales `.env`
mitkommt (das ist bewusst nicht im Repo). Ohne sie käme kein Login-Screen.
Den **ANTHROPIC_API_KEY** bekommst du unter https://console.anthropic.com → API Keys.

## 4) Deploy auslösen
- Nach dem Verbinden deployt Netlify automatisch. Sonst: **Deploys → Trigger deploy → Deploy site**.
- Im Deploy-Log sollte „**Function bundled: extract-recipe**" o. ä. erscheinen.

---

## Testen
1. Auf igcalku einloggen → Button **„Rezept hochladen"** (oben, nur für Schreibberechtigte).
2. Ein Rezept als **Bild / PDF / Text** hochladen.
3. Die KI liest es, erkannte Produkte werden angehängt (Warengruppe + Zutaten + Mengen).
4. Prüfen, ggf. Preise/VK ergänzen → **„In Cloud speichern"**.

## Kosten / Hinweise
- Jeder Upload ist **ein Claude-Aufruf** (Modell `claude-opus-4-8`) → wenige Cent pro Rezept.
- Erkennung ist KI-gestützt → **immer gegenprüfen**, bevor gespeichert wird.
- Ab jetzt gilt: **Code-Änderung → `git push`** (kein dist-Drag&Drop mehr nötig).
