-- Correctif Anomalie 1 (build 16) : get_conversation_for_notification (Phase
-- 6, migration 20260717190000) ne renvoyait pas avatar_preset, contrairement
-- à search_public_profiles et list_my_conversations (migration
-- 20260717210000) — l'ouverture d'une conversation depuis une notification
-- retombait donc silencieusement sur l'avatar loup par défaut côté client
-- (voir services/conversations.ts) même quand l'autre participant avait
-- choisi un avatar loup personnalisé. CREATE OR REPLACE ne permet pas
-- d'ajouter une colonne de sortie à une fonction RETURNS TABLE existante :
-- DROP puis CREATE, REVOKE/GRANT identiques à l'original (même principe que
-- la migration 20260717210000).
--
-- Réversibilité (manuelle, jamais exécutée automatiquement) :
--   restaurer la définition précédente de get_conversation_for_notification
--   (voir migration 20260717190000).

drop function public.get_conversation_for_notification(uuid);

create function public.get_conversation_for_notification(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_avatar_preset text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  return query
    select
      c.id,
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.avatar_preset
    from public.conversations c
    join public.profiles p
      on p.id = case when c.user_a = current_user_id then c.user_b else c.user_a end
    where c.id = p_conversation_id
      and (c.user_a = current_user_id or c.user_b = current_user_id);
end;
$$;

comment on function public.get_conversation_for_notification(uuid) is
  'Revalide l''appartenance de auth.uid() à une conversation avant de la '
  'rouvrir depuis une notification. Zéro ligne = accès refusé ou '
  'conversation inexistante, jamais une erreur distinctive. Inclut '
  'other_avatar_preset depuis la migration 20260718090000.';

revoke execute on function public.get_conversation_for_notification(uuid) from public;
revoke execute on function public.get_conversation_for_notification(uuid) from anon;
grant execute on function public.get_conversation_for_notification(uuid) to authenticated;
