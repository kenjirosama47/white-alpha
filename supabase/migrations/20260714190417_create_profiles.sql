-- Phase 2 : profils utilisateurs liés à Supabase Auth.
-- Portée volontairement restreinte : chaque utilisateur ne peut lire/modifier
-- que son propre profil. L'accès au profil d'un autre utilisateur (nécessaire
-- pour la recherche d'utilisateurs) sera ouvert dans une phase ultérieure.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

comment on table public.profiles is
  'Profil public minimal associé à un compte auth.users (1 ligne par utilisateur).';

-- Maintient updated_at à jour à chaque modification du profil.
create function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Crée automatiquement un profil à la création d'un compte auth.users.
-- SECURITY DEFINER est nécessaire ici : au moment de l'inscription, le
-- nouvel utilisateur n'est pas encore authentifié et ne peut pas insérer
-- lui-même dans public.profiles sous RLS. search_path est fixé explicitement
-- pour éviter tout détournement via un search_path modifié par l'appelant.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));

  if chosen_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Nom d''utilisateur invalide (attendu : 3 à 24 caractères, lettres minuscules, chiffres ou underscore).';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, chosen_username, chosen_username);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Row Level Security : lecture et modification limitées à son propre profil.
alter table public.profiles enable row level security;

create policy "Un utilisateur peut lire son propre profil"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Un utilisateur peut modifier son propre profil"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
