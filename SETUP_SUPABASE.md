# Setup: Geteilter Zugriff (Supabase + Google-Login)

Ziel: Susanne + Mark können speichern (synchronisiert), alle anderen
`@mein-immergruen.de`-Konten haben nur Lesezugriff.

Die App ist bereits vorbereitet. Es fehlen nur die zwei Zugänge, die nur
**du** anlegen kannst. Schritt 1–4 machst du, danach übernehme ich (URL + Key).

---

## 1) Supabase-Projekt anlegen  (~5 Min)
1. Auf https://supabase.com → „Start your project" → mit Google anmelden.
2. „New Project":
   - **Name:** `immergruen-kalkulation`
   - **Region:** `Central EU (Frankfurt)`  ← wichtig wegen DSGVO
   - **Database Password:** setzen + sicher merken
3. Warten bis das Projekt „ready" ist.

## 2) Tabelle + Rechte anlegen  (~2 Min)
1. Links im Menü: **SQL Editor** → „New query".
2. Inhalt der Datei **`supabase_setup.sql`** (liegt im Projektordner) komplett
   hineinkopieren → **Run**.
3. Ergebnis sollte „Success" sein. (Legt Tabelle, Lese-/Schreibrechte und
   Live-Sync an.)

## 3) Google-Login aktivieren  (~10 Min)
1. In Supabase: **Authentication → Providers → Google** → einschalten.
   Dort wird eine **Callback-URL** angezeigt (Form:
   `https://<projekt>.supabase.co/auth/v1/callback`) → kopieren.
2. In der **Google Cloud Console** (https://console.cloud.google.com):
   - Projekt anlegen/auswählen → **APIs & Services → OAuth consent screen**
     → User Type **Internal** (nur eure Workspace-Domain) → speichern.
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**
     → Typ **Web application**.
   - Unter **Authorized redirect URIs** die kopierte Supabase-Callback-URL
     einfügen → erstellen.
   - Du bekommst **Client ID** + **Client Secret**.
3. Zurück in Supabase (Google-Provider): **Client ID** + **Client Secret**
   eintragen → **Save**.  ← Das Secret bleibt hier, nicht in den Code/Chat.

## 4) Zugänge an mich geben
Aus Supabase **Project Settings → API** kopieren und mir schicken:
- **Project URL**  (`https://<projekt>.supabase.co`)
- **anon public key**

Beides ist für Frontends gedacht und unkritisch. Damit trage ich sie in
`.env` ein, baue neu und teste den Login.

---

## Was dann passiert
- Beim ersten Login von dir (Writer) werden **Susannes aktuelle Daten**
  automatisch in die Cloud geschrieben (Erstbefüllung).
- Susanne + du: voller Zugriff, „In Cloud speichern", Änderungen
  synchronisieren live.
- Alle anderen `@mein-immergruen.de`: sehen alles, Button „Nur-Lese-Zugriff",
  Speichern ist serverseitig (RLS) blockiert.
- Weitere Schreibberechtigte später: in `supabase_setup.sql` (Policies) und
  in `src/supabase.js` (`WRITER_EMAILS`) die E-Mail ergänzen.

## Deploy (Netlify)
Die zwei `VITE_…`-Variablen zusätzlich in Netlify hinterlegen:
**Site settings → Environment variables**, dann neu deployen.
