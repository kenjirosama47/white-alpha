-- Tests de sécurité RLS/RPC pour la Phase 5.1 (profil utilisateur et
-- paramètres : update_my_profile, contrainte username_format resserrée,
-- bucket Storage avatars et ses policies).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures : 2 utilisateurs de test (A, B).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('51000000-0000-0000-0000-000000000051', 'phase51-user-a@test.local', 'x', now(), '{"username":"phase51_user_a"}'),
  ('52000000-0000-0000-0000-000000000052', 'phase51-user-b@test.local', 'x', now(), '{"username":"phase51_user_b"}');

set local role authenticated;

-- 1. update_my_profile refuse un appel non authentifié.
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.update_my_profile('newname', 'New Name') $$,
  'Authentification requise.',
  'update_my_profile refuse un appel sans authentification'
);

-- ---------------------------------------------------------------------------
-- Privilèges exacts (GRANT), indépendants des policies RLS.
-- ---------------------------------------------------------------------------

-- 2. anon n'a pas EXECUTE sur update_my_profile.
select ok(
  not has_function_privilege('anon', 'public.update_my_profile(text, text, text)', 'EXECUTE'),
  'anon n''a pas EXECUTE sur update_my_profile'
);

-- 3. public (PUBLIC) n'a pas EXECUTE sur update_my_profile.
select ok(
  not has_function_privilege('public', 'public.update_my_profile(text, text, text)', 'EXECUTE'),
  'public n''a pas EXECUTE sur update_my_profile'
);

-- 4. authenticated a EXECUTE sur update_my_profile.
select ok(
  has_function_privilege('authenticated', 'public.update_my_profile(text, text, text)', 'EXECUTE'),
  'authenticated a EXECUTE sur update_my_profile'
);

set local "request.jwt.claim.sub" = '51000000-0000-0000-0000-000000000051';
set local "request.jwt.claims" = '{"sub":"51000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Validation du nom d'utilisateur et du nom affiché.
-- ---------------------------------------------------------------------------

-- 5. Nom d'utilisateur trop court refusé.
select throws_ok(
  $$ select public.update_my_profile('ab', 'Nom Valide') $$,
  'Nom d''utilisateur invalide : 3 à 30 caractères, lettres, chiffres ou underscore, doit commencer par une lettre ou un chiffre.',
  'update_my_profile refuse un nom d''utilisateur trop court'
);

-- 6. Nom d'utilisateur commençant par un underscore refusé.
select throws_ok(
  $$ select public.update_my_profile('_abcdef', 'Nom Valide') $$,
  'Nom d''utilisateur invalide : 3 à 30 caractères, lettres, chiffres ou underscore, doit commencer par une lettre ou un chiffre.',
  'update_my_profile refuse un nom d''utilisateur commençant par un underscore'
);

-- 7. Nom d'utilisateur contenant un espace refusé.
select throws_ok(
  $$ select public.update_my_profile('nom valide', 'Nom Valide') $$,
  'Nom d''utilisateur invalide : 3 à 30 caractères, lettres, chiffres ou underscore, doit commencer par une lettre ou un chiffre.',
  'update_my_profile refuse un nom d''utilisateur contenant un espace'
);

-- 8. Nom affiché trop court refusé.
select throws_ok(
  $$ select public.update_my_profile('nomvalide', 'K') $$,
  'Le nom affiché doit contenir entre 2 et 50 caractères.',
  'update_my_profile refuse un nom affiché trop court'
);

-- ---------------------------------------------------------------------------
-- Mise à jour valide : normalisation, retour, non-régression sur autrui.
-- ---------------------------------------------------------------------------

-- 9. Mise à jour valide : le nom d'utilisateur est normalisé en minuscules et le nom affiché est retiré de ses espaces.
create temporary table t_update as
  select * from public.update_my_profile('NewUserName', '  Nouveau Nom  ');

select ok(
  (select username from t_update) = 'newusername'
  and (select display_name from t_update) = 'Nouveau Nom',
  'update_my_profile normalise le nom d''utilisateur en minuscules et retire les espaces du nom affiché'
);

-- 10. Le profil en base reflète bien la mise à jour.
select ok(
  exists (
    select 1 from public.profiles
    where id = '51000000-0000-0000-0000-000000000051'
      and username = 'newusername'
      and display_name = 'Nouveau Nom'
  ),
  'Le profil de A en base reflète la mise à jour'
);

-- 11. Le profil de B n'est jamais affecté par la mise à jour de A (vérifié
--     hors RLS : A ne peut de toute façon pas lire le profil de B, ce qui
--     démontre déjà que update_my_profile ne peut agir que sur auth.uid()).
reset role;
select ok(
  exists (
    select 1 from public.profiles
    where id = '52000000-0000-0000-0000-000000000052'
      and username = 'phase51_user_b'
  ),
  'Le profil de B reste inchangé après la mise à jour de A (update_my_profile n''agit que sur auth.uid())'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '51000000-0000-0000-0000-000000000051';
set local "request.jwt.claims" = '{"sub":"51000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- 12. Nom d'utilisateur déjà pris (celui de B) refusé avec un message français explicite.
select throws_ok(
  $$ select public.update_my_profile('phase51_user_b', 'Nom Quelconque') $$,
  'Ce nom d''utilisateur est déjà utilisé.',
  'update_my_profile refuse un nom d''utilisateur déjà utilisé par un autre compte'
);

-- 13. Le profil de A n'a pas changé après le refus opposé au test précédent.
select is(
  (select username from public.profiles where id = '51000000-0000-0000-0000-000000000051'),
  'newusername',
  'Le profil de A reste inchangé après le refus pour nom d''utilisateur déjà pris'
);

-- ---------------------------------------------------------------------------
-- avatar_path : validation du propriétaire, mise à jour, valeur par défaut.
-- ---------------------------------------------------------------------------

-- 14. Chemin d'avatar appartenant à un autre utilisateur (B) refusé.
select throws_ok(
  $$ select public.update_my_profile('newusername', 'Nouveau Nom', '52000000-0000-0000-0000-000000000052/steal.jpg') $$,
  'Chemin d''avatar invalide.',
  'update_my_profile refuse un chemin d''avatar appartenant à un autre utilisateur'
);

-- 15. Chemin d'avatar valide (appartenant à l'appelant) accepté et reflété dans avatar_url.
create temporary table t_avatar_update as
  select * from public.update_my_profile(
    'newusername', 'Nouveau Nom', '51000000-0000-0000-0000-000000000051/photo.jpg'
  );

select is(
  (select avatar_url from t_avatar_update),
  '51000000-0000-0000-0000-000000000051/photo.jpg',
  'update_my_profile accepte et applique un chemin d''avatar appartenant à l''appelant'
);

-- 16. p_avatar_path omis (valeur par défaut null) laisse l'avatar actuel inchangé.
create temporary table t_no_avatar_change as
  select * from public.update_my_profile('newusername', 'Encore Un Autre Nom');

select is(
  (select avatar_url from t_no_avatar_change),
  '51000000-0000-0000-0000-000000000051/photo.jpg',
  'update_my_profile sans p_avatar_path laisse l''avatar_url actuel inchangé'
);

-- 17. update_my_profile ne renvoie jamais de colonne email (seules id/username/display_name/avatar_url).
select is(
  (
    select array_agg(key order by key)
    from public.update_my_profile('newusername', 'Encore Un Autre Nom') t,
         jsonb_object_keys(to_jsonb(t)) as key
  ),
  array['avatar_url', 'display_name', 'id', 'username'],
  'update_my_profile ne renvoie jamais d''email : uniquement id/username/display_name/avatar_url'
);

-- ---------------------------------------------------------------------------
-- Robustesse structurelle.
-- ---------------------------------------------------------------------------

-- 18. update_my_profile a un search_path explicite (protection contre le
--     détournement de recherche de schéma sur une fonction SECURITY DEFINER).
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'update_my_profile'
      and pronamespace = 'public'::regnamespace
      and proconfig @> array['search_path=public, pg_temp']
  ),
  'update_my_profile a un search_path explicite (public, pg_temp)'
);

-- 19. La contrainte username_format est bien resserrée (3 à 30 caractères, doit commencer par une lettre ou un chiffre).
select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'username_format'
  ),
  'CHECK ((username ~ ''^[a-z0-9][a-z0-9_]{2,29}$''::text))',
  'La contrainte username_format est resserrée à 3-30 caractères, doit commencer par une lettre ou un chiffre'
);

-- ---------------------------------------------------------------------------
-- handle_new_user : même règle resserrée appliquée à la création de compte.
-- ---------------------------------------------------------------------------

-- 20. Un nouvel utilisateur avec un nom d'utilisateur commençant par un underscore est refusé à l'inscription.
reset role;
select throws_ok(
  $$ insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ('53000000-0000-0000-0000-000000000053', 'phase51-invalid@test.local', 'x', now(), '{"username":"_invalidname"}') $$,
  'Nom d''utilisateur invalide (attendu : 3 à 30 caractères, commence par une lettre ou un chiffre, lettres minuscules, chiffres ou underscore).',
  'handle_new_user refuse un nom d''utilisateur commençant par un underscore à l''inscription'
);

-- ---------------------------------------------------------------------------
-- Bucket avatars : configuration.
-- ---------------------------------------------------------------------------

-- 21. Le bucket avatars existe, public, limité à 5 Mo et aux types image/jpeg,png,webp.
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'avatars'
      and public = true
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ),
  'Le bucket avatars est public, limité à 5 Mo, restreint à jpeg/png/webp'
);

-- ---------------------------------------------------------------------------
-- Policies Storage sur storage.objects, bucket avatars.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '51000000-0000-0000-0000-000000000051';
set local "request.jwt.claims" = '{"sub":"51000000-0000-0000-0000-000000000051","role":"authenticated"}';
set local storage.allow_delete_query = 'true';

-- 22. A peut uploader dans son propre dossier (chemin user_id/uuid.ext).
insert into storage.objects (bucket_id, name)
values ('avatars', '51000000-0000-0000-0000-000000000051/avatar.jpg');

select ok(
  true,
  'A peut uploader un avatar dans son propre dossier (aucune exception levée)'
);

-- 23. A ne peut pas uploader dans le dossier de B (usurpation de propriétaire).
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '52000000-0000-0000-0000-000000000052/steal.jpg') $$,
  '42501',
  null,
  'A ne peut pas uploader un avatar dans le dossier de B'
);

-- 24. A ne peut pas uploader avec un chemin à deux segments (sous-dossier interdit).
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '51000000-0000-0000-0000-000000000051/sous-dossier/avatar.jpg') $$,
  '42501',
  null,
  'A ne peut pas uploader un avatar avec un chemin à deux segments'
);

-- 25. A voit son propre avatar via l'API authentifiée (nécessaire pour pouvoir le supprimer ensuite).
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars' and name = '51000000-0000-0000-0000-000000000051/avatar.jpg'),
  1::bigint,
  'A voit son propre avatar via l''API authentifiée'
);

-- 26. B ne voit PAS l'avatar de A (aucun listing global ni inter-utilisateurs).
set local "request.jwt.claim.sub" = '52000000-0000-0000-0000-000000000052';
set local "request.jwt.claims" = '{"sub":"52000000-0000-0000-0000-000000000052","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'B ne voit aucun avatar (ni le sien, absent, ni celui de A) : aucun listing inter-utilisateurs'
);

-- 27. B ne peut pas supprimer l'avatar de A (0 ligne affectée, pas d'exception).
create temporary table t_del_b_attempt as
  with deleted as (
    delete from storage.objects
    where bucket_id = 'avatars' and name = '51000000-0000-0000-0000-000000000051/avatar.jpg'
    returning 1
  )
  select * from deleted;

select is(
  (select count(*) from t_del_b_attempt),
  0::bigint,
  'B ne peut pas supprimer l''avatar de A (0 ligne affectée)'
);

-- 28. L'avatar de A existe toujours après la tentative de suppression de B.
set local "request.jwt.claim.sub" = '51000000-0000-0000-0000-000000000051';
set local "request.jwt.claims" = '{"sub":"51000000-0000-0000-0000-000000000051","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'avatars' and name = '51000000-0000-0000-0000-000000000051/avatar.jpg'),
  1::bigint,
  'L''avatar de A existe toujours après la tentative de suppression de B'
);

-- 29. A peut supprimer son propre avatar.
create temporary table t_del_a as
  with deleted as (
    delete from storage.objects
    where bucket_id = 'avatars' and name = '51000000-0000-0000-0000-000000000051/avatar.jpg'
    returning 1
  )
  select * from deleted;

select is(
  (select count(*) from t_del_a),
  1::bigint,
  'A peut supprimer son propre avatar'
);

-- 30. L'avatar de A n'existe plus après sa propre suppression.
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars' and name = '51000000-0000-0000-0000-000000000051/avatar.jpg'),
  0::bigint,
  'L''avatar de A n''existe plus après sa propre suppression'
);

select finish();
rollback;
