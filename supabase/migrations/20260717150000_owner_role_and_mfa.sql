-- Phase 5.S3 : rôle propriétaire unique (owner) et base pour l'authentification
-- multifacteur (MFA TOTP), réservée au owner dans cette première version.
--
-- Principe directeur : le rôle ne doit jamais être modifiable par le client,
-- ni via update_my_profile (qui ne l'a jamais pris en paramètre, Phase 5.1),
-- ni via un UPDATE direct sur public.profiles (GRANT UPDATE désormais limité
-- aux colonnes non sensibles, section 3), ni même par un contournement de ce
-- GRANT (trigger de défense en profondeur, section 2, qui bloque tout
-- changement de role quel que soit le chemin emprunté). Un seul owner peut
-- exister à la fois (index unique partiel, section 1). Aucune dépendance à
-- raw_user_meta_data ni à une adresse email : l'attribution du rôle owner se
-- fait exclusivement par UUID, via une instruction SQL manuelle distincte de
-- cette migration (voir note en fin de fichier), jamais automatiquement et
-- jamais codée dans l'application.
--
-- Le MFA TOTP lui-même ne nécessite aucune nouvelle table : Supabase Auth
-- gère déjà l'enrôlement, les facteurs et les challenges via son schéma
-- interne (auth.mfa_factors, auth.mfa_amr_claims, etc.), exposé côté client
-- par supabase.auth.mfa.*. Cette migration se limite donc à exiger le niveau
-- aal2 (Authentication Assurance Level, claim JWT `aal` fourni par Supabase
-- Auth) pour les fonctions réservées au owner, en plus de la vérification du
-- rôle — voir section 4.

-- ---------------------------------------------------------------------------
-- 1. Colonne de rôle sur profiles. Défaut 'user' pour toute ligne existante
--    et toute nouvelle inscription (handle_new_user, Phase 2/5.1, n'est pas
--    modifiée : elle n'insère jamais explicitement de rôle, la valeur par
--    défaut s'applique). Un seul owner possible à la fois : index unique
--    partiel sur la valeur constante 'owner', donc au plus une ligne peut
--    avoir role = 'owner'.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column role text not null default 'user' check (role in ('user', 'owner'));

comment on column public.profiles.role is
  'Rôle applicatif : ''user'' (défaut, tous les comptes) ou ''owner'' (unique, '
  'voir profiles_single_owner_idx). Jamais modifiable via update_my_profile ni '
  'via un UPDATE direct client (GRANT UPDATE limité aux colonnes non '
  'sensibles, section 3, doublé du trigger profiles_prevent_role_change).';

create unique index profiles_single_owner_idx
  on public.profiles (role)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- 2. Défense en profondeur : le rôle ne doit jamais changer via un chemin
--    client, même si le GRANT de colonne (section 3) était un jour élargi
--    par erreur. Un trigger BEFORE UPDATE bloque explicitement tout
--    changement de role, quel que soit l'appelant.
-- ---------------------------------------------------------------------------
create function public.profiles_prevent_role_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role <> old.role then
    raise exception 'Le rôle ne peut pas être modifié.';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change_trigger
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_role_change();

-- ---------------------------------------------------------------------------
-- 3. GRANT de colonne : remplace le GRANT UPDATE table-large existant
--    (migration profile_settings, Phase 5.1) par un GRANT limité aux
--    colonnes que update_my_profile modifie réellement. `role` (et `id`)
--    ne sont ainsi plus modifiables par un UPDATE direct authenticated, même
--    en contournant update_my_profile via l'API REST/PostgREST.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fonctions utilitaires SECURITY DEFINER, search_path fixé, réservées à
--    un usage interne (appelées uniquement depuis d'autres fonctions
--    SECURITY DEFINER) : aucun GRANT EXECUTE à authenticated/anon/public.
--    Un appel interne fonctionne malgré ce REVOKE car une fonction SECURITY
--    DEFINER s'exécute avec les privilèges de son propriétaire (postgres),
--    qui conserve toujours EXECUTE sur les fonctions qu'il possède.
-- ---------------------------------------------------------------------------
create function public.is_owner()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
end;
$$;

comment on function public.is_owner() is
  'Vrai si auth.uid() est le owner. Usage interne uniquement (aucun GRANT '
  'EXECUTE client), appelée depuis is_owner_aal2() et les futures fonctions '
  'd''administration.';

create function public.current_aal()
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  return coalesce(auth.jwt() ->> 'aal', 'aal1');
end;
$$;

comment on function public.current_aal() is
  'Niveau AAL (Authentication Assurance Level) de la session courante '
  '(''aal1'' ou ''aal2''), lu depuis le claim JWT `aal` fourni par Supabase '
  'Auth une fois un facteur MFA vérifié. ''aal1'' par défaut si absent. '
  'Usage interne uniquement.';

create function public.is_owner_aal2()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.is_owner() and public.current_aal() = 'aal2';
end;
$$;

comment on function public.is_owner_aal2() is
  'Vrai si auth.uid() est le owner ET que la session courante a franchi le '
  'MFA (aal2). Condition requise en premier bloc par toute fonction '
  'd''administration owner sensible (voir owner_get_platform_stats).';

revoke execute on function public.is_owner() from public, anon, authenticated;
revoke execute on function public.current_aal() from public, anon, authenticated;
revoke execute on function public.is_owner_aal2() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Premier exemple de fonction owner sensible, gated is_owner_aal2() :
--    statistiques globales non sensibles (comptages), pour l'écran Sécurité.
--    Sert de référence pour toute future fonction d'administration : même
--    garde (is_owner_aal2()) à reproduire en tout premier bloc. Aucun
--    tableau de bord administratif étendu n'est créé dans cette migration
--    (voir PLAN.md, Phase 5.S3, section F).
-- ---------------------------------------------------------------------------
create function public.owner_get_platform_stats()
returns table (
  total_users bigint,
  total_conversations bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner_aal2() then
    raise exception 'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.';
  end if;

  return query
    select
      (select count(*) from public.profiles),
      (select count(*) from public.conversations);
end;
$$;

comment on function public.owner_get_platform_stats() is
  'Statistiques globales non sensibles (nombre de comptes, de conversations), '
  'réservées au owner en aal2. Référence pour toute future fonction '
  'd''administration : reproduire la garde is_owner_aal2() en premier bloc.';

revoke execute on function public.owner_get_platform_stats() from public;
revoke execute on function public.owner_get_platform_stats() from anon;
grant execute on function public.owner_get_platform_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Attribution de l'unique owner : VOLONTAIREMENT PAS INCLUSE dans cette
-- migration. Aucune adresse email ni UUID propriétaire n'est codé ici ni
-- ailleurs dans l'application. L'attribution se fait par une instruction
-- manuelle, exécutée séparément après validation explicite, avec un rôle
-- Postgres direct (jamais authenticated, jamais accessible depuis
-- l'application) : c'est un geste ponctuel d'administration de base de
-- données, pas un chemin applicatif. Le trigger profiles_prevent_role_change
-- (section 2) doit être désactivé le temps de cette seule instruction, puis
-- réactivé immédiatement :
--
--   alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
--   update public.profiles set role = 'owner' where id = '<UUID Supabase>';
--   alter table public.profiles enable trigger profiles_prevent_role_change_trigger;
--
-- ALTER TABLE ... TRIGGER exige d'être propriétaire de la table ou
-- superuser : ni authenticated ni anon ne peuvent exécuter cette séquence,
-- avec ou sans cette migration.
-- ---------------------------------------------------------------------------
