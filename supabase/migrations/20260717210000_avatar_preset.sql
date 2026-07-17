-- Phase 7.5 : avatar_preset — identifiant stable d'un avatar loup prédéfini
-- (galerie locale, voir constants/avatars.ts), distinct de avatar_url (photo
-- personnelle uploadée, Phase 5.1, inchangée). Ordre d'affichage côté client
-- (AvatarImage, déjà en place depuis la Phase 7.1) : avatar_url si présent,
-- sinon avatar_preset, sinon initiale — cette migration ne touche à aucun des
-- deux autres repos.
--
-- Principe directeur, identique aux migrations Phase 5.1/5.S3 : aucun GRANT
-- UPDATE direct sur la nouvelle colonne (ni élargissement du GRANT existant
-- sur username/display_name/avatar_url) — la seule voie d'écriture est la RPC
-- SECURITY DEFINER update_my_avatar_preset ci-dessous, qui n'agit que sur
-- auth.uid() et ne touche jamais role/id/email.
--
-- Réversibilité (procédure manuelle documentée, jamais exécutée
-- automatiquement — même approche que l'attribution du owner, Phase 5.S3) :
--
--   drop function if exists public.update_my_avatar_preset(text);
--   -- restaurer les définitions précédentes de search_public_profiles et
--   -- list_my_conversations (voir migrations 20260715104100 et 20260715130037)
--   alter table public.profiles drop constraint avatar_preset_valid;
--   alter table public.profiles drop column avatar_preset;

-- ---------------------------------------------------------------------------
-- 1. Colonne + contrainte. NOT NULL avec valeur par défaut : Postgres 11+
--    applique le défaut aux lignes existantes au moment même de l'ADD COLUMN
--    (optimisation catalogue seul, aucune réécriture de table, aucune ligne
--    ne peut donc rester NULL) — « initialise proprement les profils
--    existants » sans UPDATE explicite séparé.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column avatar_preset text not null default 'wolf_white_calm';

alter table public.profiles
  add constraint avatar_preset_valid check (avatar_preset in (
    'wolf_white_calm', 'wolf_grey', 'wolf_black', 'wolf_brown', 'wolf_snow',
    'wolf_green_eye', 'wolf_young', 'wolf_guardian', 'wolf_alpha'
  ));

comment on column public.profiles.avatar_preset is
  'Identifiant stable d''un avatar loup prédéfini (galerie locale, voir '
  'constants/avatars.ts), jamais un chemin de fichier ni une URL. Valeur '
  'par défaut ''wolf_white_calm''. Modifiable uniquement via '
  'update_my_avatar_preset (aucun GRANT UPDATE direct sur cette colonne).';

-- ---------------------------------------------------------------------------
-- 2. RPC dédiée à la mise à jour de l'avatar prédéfini. Paramètre unique :
--    contrairement à update_my_profile (Phase 5.1), l'écran galerie n'a pas
--    besoin de connaître/renvoyer username/display_name à chaque sélection.
--    La contrainte CHECK (section 1) est la garde ultime ; la vérification
--    explicite ci-dessous n'existe que pour renvoyer un message français
--    plutôt que de laisser fuiter la violation Postgres brute.
-- ---------------------------------------------------------------------------
create function public.update_my_avatar_preset(p_avatar_preset text)
returns table (
  id uuid,
  avatar_preset text
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

  if p_avatar_preset is null or p_avatar_preset not in (
    'wolf_white_calm', 'wolf_grey', 'wolf_black', 'wolf_brown', 'wolf_snow',
    'wolf_green_eye', 'wolf_young', 'wolf_guardian', 'wolf_alpha'
  ) then
    raise exception 'Avatar invalide.';
  end if;

  update public.profiles p
  set avatar_preset = p_avatar_preset
  where p.id = current_user_id;

  return query
    select p.id, p.avatar_preset
    from public.profiles p
    where p.id = current_user_id;
end;
$$;

comment on function public.update_my_avatar_preset(text) is
  'Met à jour avatar_preset de auth.uid() uniquement, restreint à la liste '
  'officielle des 9 loups (contrainte CHECK avatar_preset_valid en dernier '
  'rempart). Ne touche jamais role, id, avatar_url ni aucun champ sensible. '
  'Réservée à authenticated.';

revoke execute on function public.update_my_avatar_preset(text) from public;
revoke execute on function public.update_my_avatar_preset(text) from anon;
grant execute on function public.update_my_avatar_preset(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Propagation dans les RPC publiques qui affichent déjà avatar_url à
--    d'autres utilisateurs autorisés (recherche, liste de conversations) —
--    avatar_preset est traité exactement comme avatar_url : une donnée
--    visuelle publique par conception (voir migration 20260716140000).
--    Aucune colonne supplémentaire exposée (pas d'email, pas de role, pas
--    d'UUID superflu). CREATE OR REPLACE ne permet pas d'ajouter une colonne
--    de sortie à une fonction RETURNS TABLE existante : DROP puis CREATE,
--    avec REVOKE/GRANT identiques à l'original.
-- ---------------------------------------------------------------------------
drop function public.search_public_profiles(text);

create function public.search_public_profiles(search_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_preset text
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
    select p.id, p.username, p.display_name, p.avatar_url, p.avatar_preset
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
  'Recherche de profils publics (id, username, display_name, avatar_url, '
  'avatar_preset uniquement, jamais d''email) par username/display_name, '
  'insensible à la casse. Réservée à authenticated.';

revoke execute on function public.search_public_profiles(text) from public;
revoke execute on function public.search_public_profiles(text) from anon;
grant execute on function public.search_public_profiles(text) to authenticated;

drop function public.list_my_conversations();

create function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_avatar_preset text,
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
      p.avatar_preset as other_avatar_preset,
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
  'l''autre participant dont avatar_preset, dernier message et sa date). '
  'Jamais d''email. Réservée à authenticated.';

revoke execute on function public.list_my_conversations() from public;
revoke execute on function public.list_my_conversations() from anon;
grant execute on function public.list_my_conversations() to authenticated;
