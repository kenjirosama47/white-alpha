-- Phase 5.1 : profil utilisateur et paramètres. Modification du nom affiché,
-- du nom d'utilisateur et de l'avatar, via une RPC dédiée (aucun UPDATE
-- direct élargi sur public.profiles : la policy Phase 2 "Un utilisateur peut
-- modifier son propre profil" reste en place mais l'application passe
-- désormais par update_my_profile, qui ajoute la validation/normalisation et
-- un message d'erreur français explicite en cas de nom d'utilisateur déjà
-- pris — un UPDATE direct laisserait fuiter l'erreur de contrainte Postgres
-- brute).
--
-- Aucune adresse email n'est jamais lue ni renvoyée par cette migration :
-- elle ne vit que dans auth.users, jamais dans public.profiles ni dans une
-- RPC publique.
--
-- Défense en profondeur (même principe que la migration
-- harden_conversations_messages_grants, Phase 3) : public.profiles n'avait
-- jusqu'ici aucun GRANT de table explicite pour authenticated/anon (repose
-- implicitement sur les privilèges larges par défaut de Supabase Cloud).
-- getMyProfile() (services/profiles.ts) lit directement cette table
-- (`.from('profiles').select(...)`) : cette migration rend le privilège
-- explicite plutôt que de dépendre d'un défaut de plateforme, avec
-- exactement les verbes couverts par les policies RLS existantes (Phase 2)
-- ci-dessous — ni plus, ni moins.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Contrainte de format resserrée : 3 à 30 caractères (au lieu de 3 à 24),
--    doit commencer par une lettre ou un chiffre (jamais un underscore).
--    Toutes les valeurs existantes ont été vérifiées compatibles avant cette
--    migration (aucune ne commence par un underscore).
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint username_format;
alter table public.profiles add constraint username_format
  check (username ~ '^[a-z0-9][a-z0-9_]{2,29}$');

comment on constraint username_format on public.profiles is
  '3 à 30 caractères, lettres minuscules/chiffres/underscore, doit commencer par une lettre ou un chiffre.';

-- handle_new_user (Phase 2) applique son propre message d'erreur explicite
-- avant même d'atteindre la contrainte de table : mis à jour pour refléter
-- la même règle resserrée, avec un message français à jour.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));

  if chosen_username !~ '^[a-z0-9][a-z0-9_]{2,29}$' then
    raise exception 'Nom d''utilisateur invalide (attendu : 3 à 30 caractères, commence par une lettre ou un chiffre, lettres minuscules, chiffres ou underscore).';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, chosen_username, chosen_username);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC de mise à jour du profil. `p_avatar_path` est le CHEMIN Storage
--    (bucket `avatars`, voir section 3) — jamais une URL complète, jamais une
--    URL signée. `avatar_url` continue d'être le nom de la colonne (Phase 2,
--    pas renommée pour éviter une migration de données inutile) mais stocke
--    désormais ce chemin ; l'application construit l'URL publique côté
--    client via `supabase.storage.from('avatars').getPublicUrl(path)`
--    (aucun appel réseau, le bucket est public — voir section 3).
--    `p_avatar_path = null` (valeur par défaut) laisse l'avatar actuel
--    inchangé : cette RPC ne sert jamais à supprimer un avatar existant.
-- ---------------------------------------------------------------------------
create function public.update_my_profile(
  p_username text,
  p_display_name text,
  p_avatar_path text default null
)
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
  normalized_username text;
  normalized_display_name text;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  normalized_username := lower(trim(coalesce(p_username, '')));
  if normalized_username !~ '^[a-z0-9][a-z0-9_]{2,29}$' then
    raise exception 'Nom d''utilisateur invalide : 3 à 30 caractères, lettres, chiffres ou underscore, doit commencer par une lettre ou un chiffre.';
  end if;

  normalized_display_name := trim(coalesce(p_display_name, ''));
  if length(normalized_display_name) < 2 or length(normalized_display_name) > 50 then
    raise exception 'Le nom affiché doit contenir entre 2 et 50 caractères.';
  end if;

  -- `p_avatar_path` doit obligatoirement pointer vers un fichier appartenant
  -- à l'appelant (premier segment du chemin = auth.uid()) : empêche de
  -- s'approprier le fichier d'un autre utilisateur en fournissant son chemin,
  -- même si ce chemin est par ailleurs un avatar valide.
  if p_avatar_path is not null and (storage.foldername(p_avatar_path))[1] <> current_user_id::text then
    raise exception 'Chemin d''avatar invalide.';
  end if;

  begin
    update public.profiles p
    set username = normalized_username,
        display_name = normalized_display_name,
        avatar_url = coalesce(p_avatar_path, p.avatar_url)
    where p.id = current_user_id;
  exception
    when unique_violation then
      raise exception 'Ce nom d''utilisateur est déjà utilisé.';
  end;

  return query
    select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
    where p.id = current_user_id;
end;
$$;

comment on function public.update_my_profile(text, text, text) is
  'Met à jour le profil de auth.uid() uniquement (username normalisé en '
  'minuscules, display_name, avatar_url optionnel). Ne retourne jamais '
  'd''email. Réservée à authenticated.';

revoke execute on function public.update_my_profile(text, text, text) from public;
revoke execute on function public.update_my_profile(text, text, text) from anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bucket avatars — PUBLIC, à la différence de chat-media (privé).
--
--    Justification : contrairement aux photos/vidéos de conversation, un
--    avatar est déjà traité comme une information publique par le reste du
--    schéma existant (search_public_profiles et list_my_conversations, tous
--    deux SECURITY DEFINER, renvoient déjà avatar_url à n'importe quel
--    utilisateur authentifié qui recherche ce profil ou partage une
--    conversation avec lui — aucune restriction n'existait ni n'était prévue
--    sur qui peut *voir* un avatar). Utiliser des URLs signées pour un
--    avatar affiché potentiellement des dizaines de fois par écran
--    (résultats de recherche, liste de conversations, en-tête) obligerait à
--    régénérer/rafraîchir une URL par élément de liste et par expiration —
--    complexité et appels réseau inutiles pour une donnée déjà publique par
--    conception. Un bucket public élimine ce problème : l'URL est stable,
--    construite une fois côté client, jamais stockée en base au-delà du
--    chemin Storage lui-même.
--
--    "Public" ne veut pas dire "listable" : le endpoint public de Supabase
--    Storage (/storage/v1/object/public/...) sert un fichier à partir de son
--    chemin exact sans jamais consulter les policies RLS de storage.objects,
--    mais SANS ce chemin exact, rien n'est récupérable.
--
--    Une policy SELECT est tout de même créée plus bas, strictement limitée
--    au propre dossier de l'appelant (même condition que les policies INSERT
--    et DELETE) : vérifié empiriquement en local (Docker/Postgres de la CLI
--    Supabase) qu'un DELETE sous RLS sur storage.objects ne matche aucune
--    ligne — silencieusement, sans erreur — si aucune policy SELECT
--    applicable n'existe pour l'appelant, même quand la policy DELETE
--    elle-même serait satisfaite. Sans cette policy SELECT, un utilisateur ne
--    pourrait donc jamais supprimer son propre ancien avatar après un
--    remplacement (fuite de stockage silencieuse, `removeAvatarFile` étant
--    best-effort côté application). Cette policy SELECT ne permet de voir que
--    ses propres fichiers (même prédicat que INSERT/DELETE) : le listing des
--    avatars des AUTRES utilisateurs reste entièrement bloqué (aucune policy
--    SELECT ne les couvre), ce qui continue de satisfaire "aucun listing
--    global" — seul son propre dossier (un seul utilisateur) est visible via
--    l'API authentifiée.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 Mo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Chemin obligatoire : user_id/avatar-uuid.ext (un seul segment de dossier).
create policy "Un utilisateur peut uploader son propre avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Un utilisateur peut supprimer son propre avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Nécessaire pour que la policy DELETE ci-dessus fonctionne réellement (voir
-- justification détaillée plus haut) : strictement limitée à son propre
-- dossier, jamais les avatars des autres utilisateurs (lecture publique de
-- ceux-ci réservée au endpoint /object/public/, hors RLS).
create policy "Un utilisateur peut lister son propre avatar"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Aucune policy pour anon : zéro écriture/suppression/lecture anonyme (la
-- lecture publique des avatars passe exclusivement par le endpoint
-- /object/public/, jamais par l'API authentifiée). Aucune policy UPDATE : un
-- avatar n'est jamais réécrit, seulement créé (nouveau chemin/UUID) puis
-- l'ancien supprimé séparément par l'application après confirmation du succès.
