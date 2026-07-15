-- Durcissement défense en profondeur des tables Phase 3.
--
-- RLS bloque déjà tout accès effectif pour anon (aucune policy ne l'admet),
-- vérifié empiriquement sur le projet distant. Mais les GRANT de table
-- larges par défaut de Supabase Cloud (SELECT/INSERT/UPDATE/DELETE pour
-- anon ET authenticated) restent un filet de sécurité affaibli en cas de
-- bug RLS futur (policy mal écrite, RLS désactivée par erreur, etc.).
-- Cette migration ne touche à AUCUNE policy RLS déjà testée : elle réduit
-- uniquement les privilèges de table au strict nécessaire.

-- anon : aucun privilège de table sur les tables Phase 3.
revoke all on public.conversations from anon;
revoke all on public.messages from anon;

-- authenticated : uniquement les privilèges correspondant aux policies
-- existantes (inchangées).
-- - conversations : SELECT uniquement (création exclusivement via la
--   fonction SECURITY DEFINER get_or_create_direct_conversation, pas de
--   policy INSERT/UPDATE/DELETE).
-- - messages : SELECT/INSERT/UPDATE/DELETE (une policy RLS par opération).
revoke all on public.conversations from authenticated;
grant select on public.conversations to authenticated;

revoke all on public.messages from authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- Re-déclaration idempotente (déjà en place depuis la migration précédente) :
-- anon ne doit jamais pouvoir exécuter les fonctions RPC Phase 3.
revoke execute on function public.search_public_profiles(text) from anon;
revoke execute on function public.search_public_profiles(text) from public;
revoke execute on function public.get_or_create_direct_conversation(uuid) from anon;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public;
