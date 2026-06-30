-- ============================================================
--  immergrün Kalkulations-App — Datenbank-Setup
--  Einmalig im Supabase SQL-Editor ausführen (Project → SQL Editor → New query)
-- ============================================================

-- 1) Tabelle: ein Dokument hält den kompletten Kalkulationsstand ({ produkte, mix })
create table if not exists public.kalkulation_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- 2) Row-Level-Security einschalten (ohne Policy = niemand darf etwas)
alter table public.kalkulation_state enable row level security;

-- 3) LESEN: jeder eingeloggte Nutzer mit @mein-immergruen.de-Adresse
drop policy if exists "kalk_read_company" on public.kalkulation_state;
create policy "kalk_read_company"
  on public.kalkulation_state
  for select
  to authenticated
  using ( (auth.jwt() ->> 'email') ilike '%@mein-immergruen.de' );

-- 4) SCHREIBEN: nur die beiden Schreibberechtigten (Mark + Susanne)
--    -> Hier weitere Writer ergänzen, falls nötig.
drop policy if exists "kalk_insert_writers" on public.kalkulation_state;
create policy "kalk_insert_writers"
  on public.kalkulation_state
  for insert
  to authenticated
  with check ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de'
  ) );

drop policy if exists "kalk_update_writers" on public.kalkulation_state;
create policy "kalk_update_writers"
  on public.kalkulation_state
  for update
  to authenticated
  using ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de'
  ) )
  with check ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de'
  ) );

-- 5) Live-Sync (Realtime) für die Tabelle aktivieren
alter publication supabase_realtime add table public.kalkulation_state;

-- Fertig. Die Startdaten (Susannes Stand) werden beim ersten Login
-- eines Schreibberechtigten automatisch in die Tabelle geschrieben.
