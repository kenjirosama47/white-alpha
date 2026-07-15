-- Phase 3 : recherche d'utilisateurs, conversations privées 1-to-1, messages texte,
-- temps réel. Aucun groupe, aucun média, aucun appel.
--
-- Principe directeur : la policy Phase 2 "lecture de son propre profil
-- uniquement" reste inchangée. Aucun accès élargi n'est accordé via RLS
-- directe ; tout accès élargi (recherche, création de conversation) passe
-- par une fonction SECURITY DEFINER dédiée, avec ses propres vérifications
-- explicites et un search_path fixé pour éviter tout détournement.

-- ---------------------------------------------------------------------------
-- 1. Recherche publique de profils via RPC (aucun SELECT direct élargi sur
--    public.profiles : la policy Phase 2 "Un utilisateur peut lire son
--    propre profil" n'est pas touchée).
-- ---------------------------------------------------------------------------
create function public.search_public_profiles(search_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_query text;
  escaped_query text;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  normalized_query := trim(coalesce(search_query, ''));
  if length(normalized_query) < 2 then
    raise exception 'La recherche doit contenir au moins 2 caractères.';
  end if;

  -- Échappe les jokers ILIKE (%, _) présents dans la saisie utilisateur pour
  -- qu'ils soient traités comme des caractères littéraux, pas des jokers.
  escaped_query := replace(replace(normalized_query, '%', '\%'), '_', '\_');

  return query
    select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
    where p.id <> current_user_id
      and (
        p.username ilike '%' || escaped_query || '%' escape '\'
        or p.display_name ilike '%' || escaped_query || '%' escape '\'
      )
    order by p.username
    limit 20;
end;
$$;

comment on function public.search_public_profiles(text) is
  'Recherche de profils publics (id, username, display_name, avatar_url uniquement, '
  'jamais d''email) par username/display_name, insensible à la casse. Réservée à authenticated.';

revoke execute on function public.search_public_profiles(text) from public;
revoke execute on function public.search_public_profiles(text) from anon;
grant execute on function public.search_public_profiles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Conversations : toujours exactement 2 participants distincts, paire
--    normalisée (user_a < user_b) pour garantir l'unicité conversation/paire.
--    Les FK pointent vers auth.users (source de vérité du compte) ; la
--    cascade supprime les conversations d'un utilisateur supprimé.
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_users check (user_a <> user_b),
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_unique_pair unique (user_a, user_b)
);

comment on table public.conversations is
  'Conversation privée entre exactement deux utilisateurs. Pas de groupes. '
  'Insertion réservée à la fonction get_or_create_direct_conversation (pas de policy INSERT).';

create index conversations_user_a_idx on public.conversations (user_a);
create index conversations_user_b_idx on public.conversations (user_b);

alter table public.conversations enable row level security;

-- Seule policy sur cette table : lecture par les participants. Volontairement
-- aucune policy INSERT/UPDATE/DELETE pour authenticated : la création passe
-- exclusivement par la fonction SECURITY DEFINER ci-dessous, qui applique ses
-- propres vérifications avant d'insérer.
create policy "Un participant peut voir ses conversations"
  on public.conversations
  for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- RLS ne filtre que les lignes : le privilège SQL de base (SELECT) doit être
-- accordé explicitement, sinon toute requête est refusée avant même
-- évaluation des policies. Pas d'INSERT/UPDATE/DELETE pour authenticated :
-- la création passe exclusivement par la fonction SECURITY DEFINER.
grant select on public.conversations to authenticated;

create function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  ordered_a uuid;
  ordered_b uuid;
  result_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if target_user_id is null then
    raise exception 'Utilisateur cible manquant.';
  end if;

  if target_user_id = current_user_id then
    raise exception 'Impossible de créer une conversation avec soi-même.';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Utilisateur introuvable.';
  end if;

  ordered_a := least(current_user_id, target_user_id);
  ordered_b := greatest(current_user_id, target_user_id);

  -- ON CONFLICT DO NOTHING + SELECT : sûr en cas d'appels concurrents, la
  -- contrainte UNIQUE(user_a, user_b) empêche toute conversation dupliquée
  -- même si deux requêtes arrivent en même temps.
  insert into public.conversations (user_a, user_b)
  values (ordered_a, ordered_b)
  on conflict (user_a, user_b) do nothing;

  select c.id into result_id
  from public.conversations c
  where c.user_a = ordered_a and c.user_b = ordered_b;

  return result_id;
end;
$$;

comment on function public.get_or_create_direct_conversation(uuid) is
  'Retourne l''id de la conversation privée avec target_user_id, en la créant '
  'si nécessaire. Idempotent et sûr en cas d''appels concurrents.';

revoke execute on function public.get_or_create_direct_conversation(uuid) from public;
revoke execute on function public.get_or_create_direct_conversation(uuid) from anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Messages texte, liés à une conversation.
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_content_length check (char_length(trim(content)) between 1 and 4000)
);

comment on table public.messages is
  'Message texte appartenant à une conversation privée 1-to-1.';

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index messages_sender_idx on public.messages (sender_id);

alter table public.messages enable row level security;

create policy "Un participant peut lire les messages de ses conversations"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Un participant peut envoyer un message dans ses conversations"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Un expéditeur peut modifier son propre message"
  on public.messages
  for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "Un expéditeur peut supprimer son propre message"
  on public.messages
  for delete
  to authenticated
  using (sender_id = auth.uid());

-- La policy UPDATE (with check) garantit que sender_id reste égal à
-- auth.uid(), donc ne peut pas être réattribué à un autre utilisateur. Un
-- trigger interdit en plus explicitement tout changement de sender_id ou de
-- conversation_id lors d'un UPDATE, y compris par un rôle qui contournerait
-- RLS (ex. futur usage service_role côté serveur).
create function public.messages_prevent_reassign()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sender_id <> old.sender_id then
    raise exception 'Impossible de modifier l''expéditeur du message.';
  end if;
  if new.conversation_id <> old.conversation_id then
    raise exception 'Impossible de déplacer le message vers une autre conversation.';
  end if;
  return new;
end;
$$;

create trigger messages_prevent_reassign_trigger
  before update on public.messages
  for each row
  execute function public.messages_prevent_reassign();

-- RLS ne filtre que les lignes : les privilèges SQL de base doivent être
-- accordés explicitement pour chaque opération couverte par une policy.
grant select, insert, update, delete on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Temps réel : idempotent, réexécutable sans erreur.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
