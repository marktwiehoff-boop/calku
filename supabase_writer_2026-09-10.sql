-- ============================================================
--  CALKU — dritter Writer: Pascal Hammesfahr (Entscheidung E11.9, 10.09.2026)
--  Im Supabase SQL-Editor des Projekts immergruen-kalkulation ausführen (idempotent).
--  Grund: Pascal pflegt den Zutatenstamm (Arbeitseinheiten, Stückgewichte, Ausbeute)
--  für die IG-Store-Schnittliste; RLS gilt dokumentweit, eine Trennung je Tab gibt es nicht.
--  Die App-Seite steht in src/supabase.js (WRITER_EMAILS) — beide Listen müssen gleich sein.
-- ============================================================

drop policy if exists "kalk_insert_writers" on public.kalkulation_state;
create policy "kalk_insert_writers"
  on public.kalkulation_state
  for insert
  to authenticated
  with check ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de',
    'pascal.hammesfahr@mein-immergruen.de'
  ) );

drop policy if exists "kalk_update_writers" on public.kalkulation_state;
create policy "kalk_update_writers"
  on public.kalkulation_state
  for update
  to authenticated
  using ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de',
    'pascal.hammesfahr@mein-immergruen.de'
  ) )
  with check ( lower(auth.jwt() ->> 'email') in (
    'mark.twiehoff@mein-immergruen.de',
    'susanne.sedlaczek@mein-immergruen.de',
    'pascal.hammesfahr@mein-immergruen.de'
  ) );

-- Kontrolle: beide Policies müssen drei Adressen nennen.
select policyname, cmd, coalesce(qual, with_check) as regel
  from pg_policies
 where tablename = 'kalkulation_state'
 order by policyname;
