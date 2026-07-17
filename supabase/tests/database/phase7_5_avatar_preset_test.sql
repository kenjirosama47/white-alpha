-- Tests de sécurité RLS/RPC pour la Phase 7.5 (avatar_preset : colonne,
-- contrainte CHECK, RPC update_my_avatar_preset, propagation dans
-- search_public_profiles et list_my_conversations).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs. A = user normal, B = second user normal (cible
-- de recherche/conversation), C = owner (mêmes règles que A/B attendues).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('71000000-0000-0000-0000-000000000071', 'phase75-user-a@test.local', 'x', now(), '{"username":"phase75_user_a"}'),
  ('72000000-0000-0000-0000-000000000072', 'phase75-user-b@test.local', 'x', now(), '{"username":"phase75_user_b"}'),
  ('73000000-0000-0000-0000-000000000073', 'phase75-user-c@test.local', 'x', now(), '{"username":"phase75_user_c"}');

alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
update public.profiles set role = 'owner' where id = '73000000-0000-0000-0000-000000000073';
alter table public.profiles enable trigger profiles_prevent_role_change_trigger;

-- ---------------------------------------------------------------------------
-- Colonne et contrainte.
-- ---------------------------------------------------------------------------

-- 1. Valeur par défaut : tout nouveau profil a avatar_preset = 'wolf_white_calm'.
select is(
  (select avatar_preset from public.profiles where id = '71000000-0000-0000-0000-000000000071'),
  'wolf_white_calm',
  'Un nouveau profil a avatar_preset = ''wolf_white_calm'' par défaut'
);

-- 2. La colonne est NOT NULL.
select ok(
  not (
    select attnotnull from pg_attribute
    where attrelid = 'public.profiles'::regclass and attname = 'avatar_preset'
  ) = false,
  'avatar_preset est NOT NULL'
);

-- 3. La contrainte CHECK rejette une valeur hors liste, même hors RPC (rôle postgres, contourne le GRANT).
select throws_ok(
  $$ update public.profiles set avatar_preset = 'wolf_invalid' where id = '71000000-0000-0000-0000-000000000071' $$,
  '23514',
  null,
  'La contrainte avatar_preset_valid rejette toute valeur hors liste officielle'
);

-- ---------------------------------------------------------------------------
-- Privilèges EXECUTE sur update_my_avatar_preset (indépendants de la logique interne).
-- ---------------------------------------------------------------------------

-- 4. anon n'a pas EXECUTE sur update_my_avatar_preset.
select ok(
  not has_function_privilege('anon', 'public.update_my_avatar_preset(text)', 'EXECUTE'),
  'anon n''a pas EXECUTE sur update_my_avatar_preset'
);

-- 5. public (PUBLIC) n'a pas EXECUTE sur update_my_avatar_preset.
select ok(
  not has_function_privilege('public', 'public.update_my_avatar_preset(text)', 'EXECUTE'),
  'public n''a pas EXECUTE sur update_my_avatar_preset'
);

-- 6. authenticated a EXECUTE sur update_my_avatar_preset.
select ok(
  has_function_privilege('authenticated', 'public.update_my_avatar_preset(text)', 'EXECUTE'),
  'authenticated a EXECUTE sur update_my_avatar_preset'
);

-- 7. update_my_avatar_preset refuse un appel non authentifié.
set local role authenticated;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.update_my_avatar_preset('wolf_grey') $$,
  'Authentification requise.',
  'update_my_avatar_preset refuse un appel sans authentification'
);

-- ---------------------------------------------------------------------------
-- Aucun GRANT UPDATE direct sur la colonne : seule la RPC peut écrire.
-- ---------------------------------------------------------------------------
set local "request.jwt.claim.sub" = '71000000-0000-0000-0000-000000000071';
set local "request.jwt.claims" = '{"sub":"71000000-0000-0000-0000-000000000071","role":"authenticated"}';

-- 8. A ne peut pas modifier avatar_preset par un UPDATE direct (aucun GRANT de colonne).
select throws_ok(
  $$ update public.profiles set avatar_preset = 'wolf_grey' where id = '71000000-0000-0000-0000-000000000071' $$,
  '42501',
  null,
  'A ne peut pas modifier avatar_preset par un UPDATE direct (aucun GRANT UPDATE sur cette colonne)'
);

-- ---------------------------------------------------------------------------
-- Validation de la valeur et chaque identifiant officiel accepté.
-- ---------------------------------------------------------------------------

-- 9. Une valeur inconnue est refusée avec un message français explicite.
select throws_ok(
  $$ select public.update_my_avatar_preset('wolf_purple') $$,
  'Avatar invalide.',
  'update_my_avatar_preset refuse un identifiant hors liste officielle'
);

-- 10. Une valeur nulle est refusée.
select throws_ok(
  $$ select public.update_my_avatar_preset(null) $$,
  'Avatar invalide.',
  'update_my_avatar_preset refuse une valeur nulle'
);

-- 11. Chacun des 9 identifiants officiels est accepté et reflété en base.
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_grey')),
  'wolf_grey',
  'update_my_avatar_preset accepte wolf_grey'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_black')),
  'wolf_black',
  'update_my_avatar_preset accepte wolf_black'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_brown')),
  'wolf_brown',
  'update_my_avatar_preset accepte wolf_brown'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_snow')),
  'wolf_snow',
  'update_my_avatar_preset accepte wolf_snow'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_green_eye')),
  'wolf_green_eye',
  'update_my_avatar_preset accepte wolf_green_eye'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_young')),
  'wolf_young',
  'update_my_avatar_preset accepte wolf_young'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_guardian')),
  'wolf_guardian',
  'update_my_avatar_preset accepte wolf_guardian'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_alpha')),
  'wolf_alpha',
  'update_my_avatar_preset accepte wolf_alpha'
);
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_white_calm')),
  'wolf_white_calm',
  'update_my_avatar_preset accepte wolf_white_calm'
);

-- 12. Le profil en base reflète bien la dernière mise à jour de A.
select is(
  (select avatar_preset from public.profiles where id = '71000000-0000-0000-0000-000000000071'),
  'wolf_white_calm',
  'Le profil de A en base reflète la dernière mise à jour'
);

-- 13. update_my_avatar_preset ne modifie jamais role (vérifié après plusieurs appels ci-dessus).
select is(
  (select role from public.profiles where id = '71000000-0000-0000-0000-000000000071'),
  'user',
  'update_my_avatar_preset ne modifie jamais role'
);

-- 14. update_my_avatar_preset ne renvoie que id/avatar_preset (jamais email, role, username...).
select is(
  (
    select array_agg(key order by key)
    from public.update_my_avatar_preset('wolf_grey') t,
         jsonb_object_keys(to_jsonb(t)) as key
  ),
  array['avatar_preset', 'id'],
  'update_my_avatar_preset ne renvoie que id et avatar_preset'
);

-- 15. Le profil de B n'est jamais affecté par les mises à jour de A (agit exclusivement sur auth.uid()).
reset role;
select is(
  (select avatar_preset from public.profiles where id = '72000000-0000-0000-0000-000000000072'),
  'wolf_white_calm',
  'Le profil de B reste à la valeur par défaut après les mises à jour de A'
);

-- ---------------------------------------------------------------------------
-- Le owner est soumis exactement aux mêmes règles.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '73000000-0000-0000-0000-000000000073';
set local "request.jwt.claims" = '{"sub":"73000000-0000-0000-0000-000000000073","role":"authenticated"}';

-- 16. Le owner (C) peut aussi mettre à jour son avatar_preset, sans que role ne change.
select is(
  (select avatar_preset from public.update_my_avatar_preset('wolf_guardian')),
  'wolf_guardian',
  'Le owner peut mettre à jour son propre avatar_preset comme n''importe quel utilisateur'
);
select is(
  (select role from public.profiles where id = '73000000-0000-0000-0000-000000000073'),
  'owner',
  'La mise à jour de avatar_preset par le owner ne modifie jamais son rôle'
);

-- 17. Le owner (C) ne peut pas non plus faire d'UPDATE direct sur avatar_preset.
select throws_ok(
  $$ update public.profiles set avatar_preset = 'wolf_alpha' where id = '73000000-0000-0000-0000-000000000073' $$,
  '42501',
  null,
  'Le owner ne peut pas non plus modifier avatar_preset par un UPDATE direct'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- Propagation dans search_public_profiles et list_my_conversations.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '72000000-0000-0000-0000-000000000072';
set local "request.jwt.claims" = '{"sub":"72000000-0000-0000-0000-000000000072","role":"authenticated"}';

-- 18. search_public_profiles renvoie avatar_preset de A (trouvé par B).
select is(
  (select avatar_preset from public.search_public_profiles('phase75_user_a')),
  'wolf_grey',
  'search_public_profiles renvoie avatar_preset du profil trouvé'
);

-- 19. search_public_profiles ne renvoie aucun champ sensible (email, role, avatar_path brut hors avatar_url).
select is(
  (
    select array_agg(key order by key)
    from public.search_public_profiles('phase75_user_a') t,
         jsonb_object_keys(to_jsonb(t)) as key
  ),
  array['avatar_preset', 'avatar_url', 'display_name', 'id', 'username'],
  'search_public_profiles ne renvoie que id/username/display_name/avatar_url/avatar_preset'
);

-- 20. B crée une conversation avec A puis retrouve avatar_preset de A via list_my_conversations.
select public.get_or_create_direct_conversation('71000000-0000-0000-0000-000000000071');

select is(
  (
    select other_avatar_preset from public.list_my_conversations()
    where other_user_id = '71000000-0000-0000-0000-000000000071'
  ),
  'wolf_grey',
  'list_my_conversations renvoie avatar_preset de l''autre participant'
);

-- 21. list_my_conversations ne renvoie aucun champ sensible.
select is(
  (
    select array_agg(key order by key)
    from public.list_my_conversations() t,
         jsonb_object_keys(to_jsonb(t)) as key
    where t.other_user_id = '71000000-0000-0000-0000-000000000071'
  ),
  array[
    'conversation_id', 'last_message_content', 'last_message_created_at',
    'other_avatar_preset', 'other_avatar_url', 'other_display_name',
    'other_user_id', 'other_username'
  ],
  'list_my_conversations ne renvoie aucun champ sensible (pas d''email, pas de role)'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- Robustesse structurelle.
-- ---------------------------------------------------------------------------

-- 22. update_my_avatar_preset a un search_path explicite (protection contre le détournement de search_path).
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'update_my_avatar_preset'
      and pronamespace = 'public'::regnamespace
      and proconfig @> array['search_path=public, pg_temp']
  ),
  'update_my_avatar_preset a un search_path explicite (public, pg_temp)'
);

-- 23. La contrainte avatar_preset_valid couvre exactement les 9 identifiants officiels.
select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'avatar_preset_valid'
  ),
  'CHECK ((avatar_preset = ANY (ARRAY[''wolf_white_calm''::text, ''wolf_grey''::text, ''wolf_black''::text, ''wolf_brown''::text, ''wolf_snow''::text, ''wolf_green_eye''::text, ''wolf_young''::text, ''wolf_guardian''::text, ''wolf_alpha''::text])))',
  'La contrainte avatar_preset_valid couvre exactement les 9 identifiants officiels'
);

-- ---------------------------------------------------------------------------
-- Non-régression : update_my_profile n'a pas gagné de paramètre avatar_preset.
-- ---------------------------------------------------------------------------

-- 24. update_my_profile garde exactement sa signature Phase 5.1 (aucun paramètre avatar_preset ajouté).
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'update_my_profile'
      and pronamespace = 'public'::regnamespace
      and pg_get_function_arguments(oid) = 'p_username text, p_display_name text, p_avatar_path text DEFAULT NULL::text'
  ),
  'update_my_profile n''a pas gagné de paramètre avatar_preset (signature inchangée)'
);

-- 25. La messagerie existante n'est pas affectée (A peut toujours envoyer un message texte).
set local role authenticated;
set local "request.jwt.claim.sub" = '71000000-0000-0000-0000-000000000071';
set local "request.jwt.claims" = '{"sub":"71000000-0000-0000-0000-000000000071","role":"authenticated"}';

select lives_ok(
  $$ select public.create_text_message(
       public.get_or_create_direct_conversation('72000000-0000-0000-0000-000000000072'),
       'Message de non-régression Phase 7.5'
     ) $$,
  'A peut toujours envoyer un message texte (create_text_message non affectée par la Phase 7.5)'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- 26. Le bucket avatars (photo personnelle) n'est pas affecté par cette migration.
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'avatars' and public = true and file_size_limit = 5242880
  ),
  'Le bucket avatars (photo personnelle, Phase 5.1) n''est pas affecté par la Phase 7.5'
);

select finish();
rollback;
