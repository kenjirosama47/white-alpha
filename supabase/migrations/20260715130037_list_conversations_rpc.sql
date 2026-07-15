-- RPC dédiée à l'écran Conversations : liste les conversations de
-- l'utilisateur courant avec le profil public de l'autre participant et un
-- aperçu du dernier message. Aucun accès élargi n'est ouvert via RLS : la
-- policy "Un participant peut voir ses conversations" (SELECT uniquement)
-- reste inchangée, et la policy Phase 2 "Un utilisateur peut lire son
-- propre profil" sur public.profiles n'est pas touchée non plus (elle
-- interdirait de toute façon la lecture du profil de l'autre participant).
-- SECURITY DEFINER est nécessaire pour lire le profil de l'autre
-- participant ; la fonction filtre elle-même explicitement sur auth.uid()
-- pour ne jamais exposer autre chose que les conversations de l'appelant.

create function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_content text,
  last_message_created_at timestamptz
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
      c.id as conversation_id,
      p.id as other_user_id,
      p.username as other_username,
      p.display_name as other_display_name,
      p.avatar_url as other_avatar_url,
      lm.content as last_message_content,
      lm.created_at as last_message_created_at
    from public.conversations c
    join public.profiles p
      on p.id = case
        when c.user_a = current_user_id then c.user_b
        else c.user_a
      end
    left join lateral (
      select m.content, m.created_at
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) lm on true
    where c.user_a = current_user_id or c.user_b = current_user_id
    order by coalesce(lm.created_at, c.created_at) desc;
end;
$$;

comment on function public.list_my_conversations() is
  'Liste les conversations de l''utilisateur courant (id, profil public de '
  'l''autre participant, dernier message et sa date). Jamais d''email. '
  'Réservée à authenticated.';

revoke execute on function public.list_my_conversations() from public;
revoke execute on function public.list_my_conversations() from anon;
grant execute on function public.list_my_conversations() to authenticated;
