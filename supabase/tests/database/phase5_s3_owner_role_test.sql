-- Tests de sécurité RLS/RPC pour la Phase 5.S3 (rôle owner unique, garde
-- aal2 pour les fonctions owner sensibles). Le MFA TOTP lui-même (enrôlement,
-- challenge, vérification) repose entièrement sur le schéma interne
-- auth.mfa_* de Supabase Auth, déjà testé par Supabase : rien à tester ici
-- côté schéma applicatif au-delà du claim `aal` consommé par current_aal().
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test. A = user normal, B = futur owner,
-- C = second utilisateur candidat owner (doit être refusé).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('61000000-0000-0000-0000-000000000061', 'phase5s3-user-a@test.local', 'x', now(), '{"username":"phase5s3_user_a"}'),
  ('62000000-0000-0000-0000-000000000062', 'phase5s3-user-b@test.local', 'x', now(), '{"username":"phase5s3_user_b"}'),
  ('63000000-0000-0000-0000-000000000063', 'phase5s3-user-c@test.local', 'x', now(), '{"username":"phase5s3_user_c"}');

-- ---------------------------------------------------------------------------
-- Colonne et contrainte de rôle.
-- ---------------------------------------------------------------------------

-- 1. Tout nouveau profil a role = 'user' par défaut (handle_new_user ne fixe jamais explicitement de rôle).
select is(
  (select role from public.profiles where id = '61000000-0000-0000-0000-000000000061'),
  'user',
  'Un nouveau profil a le rôle ''user'' par défaut'
);

-- 2. La contrainte de rôle n'accepte que ''user'' ou ''owner'' (trigger
--    désactivé le temps du test pour isoler cette protection précise : le
--    trigger, testé séparément au test 6, intercepterait sinon en premier).
alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '61000000-0000-0000-0000-000000000061' $$,
  '23514',
  null,
  'La colonne role rejette toute valeur hors ''user''/''owner'' (contrainte CHECK)'
);
alter table public.profiles enable trigger profiles_prevent_role_change_trigger;

-- 3. L'index unique partiel profiles_single_owner_idx existe.
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profiles' and indexname = 'profiles_single_owner_idx'
  ),
  'profiles_single_owner_idx existe'
);

-- ---------------------------------------------------------------------------
-- Attribution de B comme owner (procédure d'administration documentée dans
-- la migration : désactivation ponctuelle du trigger anti-changement).
-- ---------------------------------------------------------------------------
alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
update public.profiles set role = 'owner' where id = '62000000-0000-0000-0000-000000000062';
alter table public.profiles enable trigger profiles_prevent_role_change_trigger;

-- 4. B est désormais owner.
select is(
  (select role from public.profiles where id = '62000000-0000-0000-0000-000000000062'),
  'owner',
  'B est correctement devenu owner'
);

-- 5. Tenter de créer un second owner (C) échoue (violation de l'index unique
--    partiel ; trigger désactivé pour isoler cette protection précise, comme
--    au test 2).
alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
select throws_ok(
  $$ update public.profiles set role = 'owner' where id = '63000000-0000-0000-0000-000000000063' $$,
  '23505',
  null,
  'La création d''un deuxième owner est refusée (index unique partiel)'
);
alter table public.profiles enable trigger profiles_prevent_role_change_trigger;

-- ---------------------------------------------------------------------------
-- Trigger profiles_prevent_role_change : bloque tout changement de rôle,
-- même exécuté directement (hors client), tant qu'il n'est pas désactivé
-- explicitement.
-- ---------------------------------------------------------------------------

-- 6. Un changement direct de rôle est refusé si le trigger est actif, même hors RLS/GRANT (rôle postgres).
select throws_ok(
  $$ update public.profiles set role = 'user' where id = '62000000-0000-0000-0000-000000000062' $$,
  'Le rôle ne peut pas être modifié.',
  'Le trigger profiles_prevent_role_change bloque un changement direct de rôle, même hors client'
);

-- ---------------------------------------------------------------------------
-- GRANT de colonne : authenticated ne peut pas modifier role, même via update_my_profile
-- (qui ne l'a jamais pris en paramètre) ni via un UPDATE direct.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-0000-0000-000000000061';
set local "request.jwt.claims" = '{"sub":"61000000-0000-0000-0000-000000000061","role":"authenticated"}';

-- 7. A ne peut pas modifier son propre rôle par un UPDATE direct (GRANT de colonne insuffisant).
select throws_ok(
  $$ update public.profiles set role = 'owner' where id = '61000000-0000-0000-0000-000000000061' $$,
  '42501',
  null,
  'A ne peut pas modifier son propre rôle par un UPDATE direct (GRANT de colonne absent)'
);

-- 8. A peut toujours modifier username/display_name (GRANT de colonne non affecté pour les colonnes autorisées).
select lives_ok(
  $$ update public.profiles set display_name = 'Nom Inchangé Rôle' where id = '61000000-0000-0000-0000-000000000061' $$,
  'A peut toujours modifier display_name (GRANT de colonne limité à role, pas aux autres colonnes)'
);

-- 9. update_my_profile n'a toujours que 3 paramètres (username, display_name, avatar_path) : aucun paramètre role ajouté.
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'update_my_profile'
      and pronamespace = 'public'::regnamespace
      and pg_get_function_arguments(oid) = 'p_username text, p_display_name text, p_avatar_path text DEFAULT NULL::text'
  ),
  'update_my_profile n''a pas gagné de paramètre role (signature inchangée depuis la Phase 5.1)'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- Privilèges EXECUTE (indépendants des vérifications internes is_owner_aal2()).
-- ---------------------------------------------------------------------------

-- 10. anon n'a pas EXECUTE sur owner_get_platform_stats.
select ok(
  not has_function_privilege('anon', 'public.owner_get_platform_stats()', 'EXECUTE'),
  'anon n''a pas EXECUTE sur owner_get_platform_stats'
);

-- 11. public (PUBLIC) n'a pas EXECUTE sur owner_get_platform_stats.
select ok(
  not has_function_privilege('public', 'public.owner_get_platform_stats()', 'EXECUTE'),
  'public n''a pas EXECUTE sur owner_get_platform_stats'
);

-- 12. authenticated a EXECUTE sur owner_get_platform_stats (le filtrage réel se fait à l'intérieur, via is_owner_aal2()).
select ok(
  has_function_privilege('authenticated', 'public.owner_get_platform_stats()', 'EXECUTE'),
  'authenticated a EXECUTE sur owner_get_platform_stats'
);

-- 13. anon/authenticated/public n'ont EXECUTE sur aucune des fonctions internes is_owner/current_aal/is_owner_aal2.
select ok(
  not has_function_privilege('anon', 'public.is_owner()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_owner()', 'EXECUTE')
  and not has_function_privilege('public', 'public.is_owner()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_owner_aal2()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_owner_aal2()', 'EXECUTE')
  and not has_function_privilege('public', 'public.is_owner_aal2()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.current_aal()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.current_aal()', 'EXECUTE')
  and not has_function_privilege('public', 'public.current_aal()', 'EXECUTE'),
  'is_owner/current_aal/is_owner_aal2 sont strictement internes (aucun GRANT EXECUTE client)'
);

-- ---------------------------------------------------------------------------
-- Comportement de owner_get_platform_stats selon rôle et niveau AAL.
-- ---------------------------------------------------------------------------

-- 14. anon ne peut pas appeler owner_get_platform_stats (refusé au niveau privilège SQL, avant même is_owner_aal2()).
set local role anon;
select throws_ok(
  $$ select * from public.owner_get_platform_stats() $$,
  '42501',
  null,
  'anon refusé : owner_get_platform_stats (permission denied, GRANT absent)'
);
reset role;

-- 15. A (rôle 'user', aal2) est refusé par owner_get_platform_stats.
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-0000-0000-000000000061';
set local "request.jwt.claims" = '{"sub":"61000000-0000-0000-0000-000000000061","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$ select * from public.owner_get_platform_stats() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'user refusé : owner_get_platform_stats (rôle ''user'', même en aal2)'
);

-- 16. B (owner, aal1) est refusé par owner_get_platform_stats.
set local "request.jwt.claim.sub" = '62000000-0000-0000-0000-000000000062';
set local "request.jwt.claims" = '{"sub":"62000000-0000-0000-0000-000000000062","role":"authenticated"}';

select throws_ok(
  $$ select * from public.owner_get_platform_stats() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'owner en aal1 refusé : owner_get_platform_stats (aal manquant = aal1 par défaut)'
);

-- 17. B (owner, aal1 explicite) est refusé par owner_get_platform_stats.
set local "request.jwt.claims" = '{"sub":"62000000-0000-0000-0000-000000000062","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$ select * from public.owner_get_platform_stats() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'owner en aal1 explicite refusé : owner_get_platform_stats'
);

-- 18. B (owner, aal2) est autorisé par owner_get_platform_stats.
set local "request.jwt.claims" = '{"sub":"62000000-0000-0000-0000-000000000062","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$ select * from public.owner_get_platform_stats() $$,
  'owner en aal2 autorisé : owner_get_platform_stats ne lève aucune exception'
);

-- 19. Le résultat de owner_get_platform_stats compte bien les 3 profils de fixture (au moins).
select ok(
  (select total_users from public.owner_get_platform_stats()) >= 3,
  'owner_get_platform_stats renvoie un comptage cohérent des comptes existants'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- Robustesse structurelle des nouvelles fonctions SECURITY DEFINER.
-- ---------------------------------------------------------------------------

-- 20. is_owner, current_aal, is_owner_aal2, owner_get_platform_stats ont toutes un search_path explicite.
select ok(
  (
    select bool_and(proconfig @> array['search_path=public, pg_temp'])
    from pg_proc
    where proname in ('is_owner', 'current_aal', 'is_owner_aal2', 'owner_get_platform_stats')
      and pronamespace = 'public'::regnamespace
  ),
  'is_owner/current_aal/is_owner_aal2/owner_get_platform_stats ont un search_path explicite (public, pg_temp)'
);

-- ---------------------------------------------------------------------------
-- Non-régression : la messagerie existante n'est pas affectée par cette
-- migration (aucune policy/fonction Phase 3/4/5.1/5.4 modifiée).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-0000-0000-000000000061';
set local "request.jwt.claims" = '{"sub":"61000000-0000-0000-0000-000000000061","role":"authenticated"}';

-- 21. A (rôle 'user') peut toujours créer une conversation avec C (rôle 'user') : la messagerie fonctionne pour un compte non-owner.
select lives_ok(
  $$ select public.get_or_create_direct_conversation('63000000-0000-0000-0000-000000000063') $$,
  'A peut toujours créer une conversation (get_or_create_direct_conversation non affectée par la Phase 5.S3)'
);

-- 22. A peut toujours envoyer un message texte dans cette conversation.
select lives_ok(
  $$ select public.create_text_message(
       public.get_or_create_direct_conversation('63000000-0000-0000-0000-000000000063'),
       'Message de non-régression Phase 5.S3'
     ) $$,
  'A peut toujours envoyer un message texte (create_text_message non affectée par la Phase 5.S3)'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- 23. B (owner) peut lui aussi toujours utiliser la messagerie normalement : le rôle owner ne rend pas l'application mono-utilisateur.
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-0000-0000-000000000062';
set local "request.jwt.claims" = '{"sub":"62000000-0000-0000-0000-000000000062","role":"authenticated"}';

select lives_ok(
  $$ select public.list_my_conversations() $$,
  'B (owner) peut toujours utiliser la messagerie normalement (list_my_conversations)'
);

reset role;

select finish();
rollback;
