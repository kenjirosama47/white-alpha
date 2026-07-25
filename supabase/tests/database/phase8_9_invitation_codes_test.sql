-- Tests de sécurité et de comportement pour la Phase 8.9 (codes
-- d'invitation, migration 20260723180000_invitation_codes.sql) : garde
-- owner+aal2 sur les 3 fonctions d'administration, format/entropie du code,
-- stockage hash uniquement, expiration/max_uses configurables, révocation,
-- non-énumération (RLS/GRANT), rate limiting, et consommation atomique par
-- handle_new_user (usage unique, effacement du code brut).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures : A = utilisateur normal, B = owner. Codes de test insérés
-- directement (le test de admin_create_invitation_code lui-même est fait
-- séparément, via l'appel réel de la fonction, plus bas).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('89000000-0000-0000-0000-000000000001', 'phase89-user-a@test.local', 'x', now(), '{"username":"phase89_user_a"}'),
  ('89000000-0000-0000-0000-000000000002', 'phase89-owner-b@test.local', 'x', now(), '{"username":"phase89_owner_b"}');

alter table public.profiles disable trigger profiles_prevent_role_change_trigger;
update public.profiles set role = 'owner' where id = '89000000-0000-0000-0000-000000000002';
alter table public.profiles enable trigger profiles_prevent_role_change_trigger;

-- ---------------------------------------------------------------------------
-- 1. Schéma : jamais de colonne stockant le code en clair.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'invitation_codes' and column_name = 'code'),
  0,
  'invitation_codes n''a aucune colonne "code" en clair (uniquement code_hash)'
);

-- 2. code_hash a un index unique (unicité garantie au niveau base).
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'invitation_codes' and indexname = 'invitation_codes_code_hash_idx'),
  'invitation_codes_code_hash_idx (unique) existe'
);

-- 3. max_uses est borné (1 à 1000).
select throws_ok(
  $$ insert into public.invitation_codes (code_hash, created_by, expires_at, max_uses)
     values ('deadbeef', '89000000-0000-0000-0000-000000000002', now() + interval '1 day', 0) $$,
  '23514',
  null,
  'La contrainte CHECK refuse max_uses = 0'
);

-- 4. expires_at doit être postérieur à created_at.
select throws_ok(
  $$ insert into public.invitation_codes (code_hash, created_by, created_at, expires_at, max_uses)
     values ('deadbeef2', '89000000-0000-0000-0000-000000000002', now(), now() - interval '1 day', 1) $$,
  '23514',
  null,
  'La contrainte CHECK refuse expires_at <= created_at'
);

-- ---------------------------------------------------------------------------
-- Non-énumération : ni anon ni authenticated n'ont le moindre accès direct
-- (SELECT/INSERT/UPDATE) aux deux tables, RLS activée sans policy.
-- ---------------------------------------------------------------------------

-- 5. anon n'a pas SELECT sur invitation_codes.
select ok(not has_table_privilege('anon', 'public.invitation_codes', 'SELECT'), 'anon n''a pas SELECT sur invitation_codes');
-- 6. authenticated n'a pas SELECT sur invitation_codes.
select ok(not has_table_privilege('authenticated', 'public.invitation_codes', 'SELECT'), 'authenticated n''a pas SELECT sur invitation_codes');
-- 7. anon n'a pas SELECT sur invitation_attempt_log.
select ok(not has_table_privilege('anon', 'public.invitation_attempt_log', 'SELECT'), 'anon n''a pas SELECT sur invitation_attempt_log');
-- 8. authenticated n'a pas SELECT sur invitation_attempt_log.
select ok(not has_table_privilege('authenticated', 'public.invitation_attempt_log', 'SELECT'), 'authenticated n''a pas SELECT sur invitation_attempt_log');

-- ---------------------------------------------------------------------------
-- admin_create_invitation_code : garde owner+aal2.
-- ---------------------------------------------------------------------------

-- 9. anon refusé (permission denied, GRANT absent).
set local role anon;
select throws_ok(
  $$ select * from public.admin_create_invitation_code() $$,
  '42501',
  null,
  'anon refusé : admin_create_invitation_code (permission denied)'
);
reset role;

-- 10. A (rôle user, aal2) refusé.
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$ select * from public.admin_create_invitation_code() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'A (user, aal2) refusé : admin_create_invitation_code'
);

-- 11. B (owner, aal1) refusé.
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select * from public.admin_create_invitation_code() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'B (owner, aal1) refusé : admin_create_invitation_code'
);

-- 12. B (owner, aal2) : bornes invalides refusées (expires_in_days).
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$ select * from public.admin_create_invitation_code(p_expires_in_days => 0) $$,
  'Durée de validité invalide (1 à 365 jours).',
  'B (owner, aal2) : expires_in_days = 0 refusé'
);

-- 13. B (owner, aal2) : bornes invalides refusées (max_uses).
select throws_ok(
  $$ select * from public.admin_create_invitation_code(p_max_uses => 1001) $$,
  'Nombre d''utilisations invalide (1 à 1000).',
  'B (owner, aal2) : max_uses = 1001 refusé'
);

-- 14. B (owner, aal2) autorisé : la génération réussit et renvoie un code.
select lives_ok(
  $$ select * from public.admin_create_invitation_code(7, 1, 'code de test 14') $$,
  'B (owner, aal2) autorisé : admin_create_invitation_code'
);

-- 15. Le code généré respecte le format WA-XXXX (préfixe + tirets).
select ok(
  (select code from public.admin_create_invitation_code(7, 1, 'format') limit 1) ~ '^WA(-[0-9A-HJKMNP-TV-Z]{2,4}){7}$',
  'Le code généré respecte le format WA-XXXX-XXXX-... (Crockford Base32)'
);

-- 16. Deux générations successives produisent des codes différents (aléatoire).
select isnt(
  (select code from public.admin_create_invitation_code(7, 1, 'a') limit 1),
  (select code from public.admin_create_invitation_code(7, 1, 'b') limit 1),
  'Deux codes générés successivement sont différents'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- admin_list_invitation_codes : garde owner+aal2, statut dérivé, jamais code_hash.
-- ---------------------------------------------------------------------------

-- 17. anon refusé.
set local role anon;
select throws_ok(
  $$ select * from public.admin_list_invitation_codes() $$,
  '42501',
  null,
  'anon refusé : admin_list_invitation_codes'
);
reset role;

-- 18. A (user) refusé même en aal2.
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$ select * from public.admin_list_invitation_codes() $$,
  'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.',
  'A (user, aal2) refusé : admin_list_invitation_codes'
);
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- 19. admin_list_invitation_codes ne renvoie jamais de colonne code_hash (signature de la fonction).
select ok(
  not exists (
    select 1 from pg_proc
    where proname = 'admin_list_invitation_codes' and pronamespace = 'public'::regnamespace
      and pg_get_function_result(oid) ilike '%code_hash%'
  ),
  'admin_list_invitation_codes ne renvoie jamais code_hash (ni le code brut) dans sa signature'
);

-- 20. B (owner, aal2) voit le code créé au test 14 avec le statut "active".
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select ok(
  exists (select 1 from public.admin_list_invitation_codes() where note = 'code de test 14' and status = 'active'),
  'B (owner, aal2) voit le code de test 14 avec le statut "active"'
);
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- admin_revoke_invitation_code : garde owner+aal2, idempotent-safe.
-- ---------------------------------------------------------------------------
insert into public.invitation_codes (id, code_hash, created_by, expires_at, max_uses, note)
values ('89000000-0000-0000-0000-0000000000f1', encode(digest('WA-REVOKE-FIXTURE', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() + interval '7 days', 1, 'à révoquer');

-- 21. anon refusé.
set local role anon;
select throws_ok(
  $$ select public.admin_revoke_invitation_code('89000000-0000-0000-0000-0000000000f1') $$,
  '42501',
  null,
  'anon refusé : admin_revoke_invitation_code'
);
reset role;

-- 22. B (owner, aal2) révoque avec succès.
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select lives_ok(
  $$ select public.admin_revoke_invitation_code('89000000-0000-0000-0000-0000000000f1') $$,
  'B (owner, aal2) révoque le code avec succès'
);

-- 23. Une seconde révocation du même code échoue (idempotent-safe, pas silencieux).
select throws_ok(
  $$ select public.admin_revoke_invitation_code('89000000-0000-0000-0000-0000000000f1') $$,
  'Code introuvable ou déjà révoqué.',
  'Une seconde révocation du même code échoue explicitement'
);
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- 24. Le statut du code révoqué est bien "revoked" dans la liste.
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select is(
  (select status from public.admin_list_invitation_codes() where note = 'à révoquer'),
  'revoked',
  'Le code révoqué a le statut "revoked"'
);
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- Rate limiting : is_invitation_rate_limited / record_invitation_attempt.
-- ---------------------------------------------------------------------------

-- 25. anon a EXECUTE sur is_invitation_rate_limited (appelé avant authentification).
select ok(has_function_privilege('anon', 'public.is_invitation_rate_limited(text, text)', 'EXECUTE'), 'anon a EXECUTE sur is_invitation_rate_limited');
-- 26. anon a EXECUTE sur record_invitation_attempt.
select ok(has_function_privilege('anon', 'public.record_invitation_attempt(text, text, boolean)', 'EXECUTE'), 'anon a EXECUTE sur record_invitation_attempt');

-- 27. Pas encore de tentative pour ce hash d'IP : jamais limité.
select is(
  public.is_invitation_rate_limited('phase89-ip-hash-a', 'phase89-code-prefix-a'),
  false,
  'Aucune tentative préalable : jamais limité'
);

-- 28. Après 5 échecs pour la même IP dans la fenêtre, l'IP est limitée.
select record_invitation_attempt('phase89-ip-hash-b', 'phase89-code-prefix-x1', false) from generate_series(1, 5);
select is(
  public.is_invitation_rate_limited('phase89-ip-hash-b', 'phase89-code-prefix-unrelated'),
  true,
  'Après 5 tentatives pour la même IP, is_invitation_rate_limited renvoie true (même pour un autre code visé)'
);

-- 29. Une IP différente, non concernée, n'est pas limitée par les tentatives du test 28.
select is(
  public.is_invitation_rate_limited('phase89-ip-hash-c', 'phase89-code-prefix-unrelated'),
  false,
  'Une IP distincte non concernée n''est pas limitée'
);

-- 30. Après 5 échecs pour le même préfixe de code (IPs différentes), le préfixe est limité.
select record_invitation_attempt('phase89-ip-hash-d' || g::text, 'phase89-code-prefix-y1', false) from generate_series(1, 5) g;
select is(
  public.is_invitation_rate_limited('phase89-ip-hash-jamais-vue', 'phase89-code-prefix-y1'),
  true,
  'Après 5 tentatives visant le même préfixe de code (IPs différentes), ce préfixe est limité'
);

-- 31. Les entrées de plus de 24h sont purgées (jamais comptées).
insert into public.invitation_attempt_log (ip_hash, code_hash_prefix, attempted_at, success)
values ('phase89-ip-hash-old', 'phase89-code-prefix-old', now() - interval '25 hours', false);
select public.is_invitation_rate_limited('phase89-ip-hash-purge-trigger', null); -- déclenche la purge
select is(
  (select count(*)::int from public.invitation_attempt_log where ip_hash = 'phase89-ip-hash-old'),
  0,
  'Les tentatives de plus de 24h sont purgées automatiquement'
);

-- ---------------------------------------------------------------------------
-- is_invitation_code_usable : pré-vérification en lecture seule, source de
-- vérité pour web/app/inscription/actions.ts (voir sa note de fonction) —
-- un seul booléen, jamais une raison détaillée.
-- ---------------------------------------------------------------------------

-- 32. anon a EXECUTE (appelé avant authentification, comme is_invitation_rate_limited).
select ok(has_function_privilege('anon', 'public.is_invitation_code_usable(text)', 'EXECUTE'), 'anon a EXECUTE sur is_invitation_code_usable');
-- 33. authenticated a EXECUTE.
select ok(has_function_privilege('authenticated', 'public.is_invitation_code_usable(text)', 'EXECUTE'), 'authenticated a EXECUTE sur is_invitation_code_usable');

-- Le code "expired" a besoin de created_at ET expires_at tous deux dans le
-- passé (la contrainte CHECK invitation_codes_expires_after_created exige
-- expires_at > created_at à TOUTE écriture, y compris un UPDATE ultérieur —
-- pas seulement à l'insertion) : mêmes valeurs explicites que la fixture
-- WA-EXPIRED-FIXTURE plus bas dans ce fichier.
insert into public.invitation_codes (code_hash, created_by, expires_at, max_uses, use_count, note)
values
  (encode(digest('WA-USABLE-ACTIVE', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() + interval '7 days', 1, 0, 'usable: active'),
  (encode(digest('WA-USABLE-MAXED', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() + interval '7 days', 1, 1, 'usable: maxed');

insert into public.invitation_codes (code_hash, created_by, created_at, expires_at, max_uses, use_count, note)
values (encode(digest('WA-USABLE-EXPIRED', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() - interval '2 days', now() - interval '1 hour', 1, 0, 'usable: expired');

insert into public.invitation_codes (id, code_hash, created_by, expires_at, max_uses, note)
values ('89000000-0000-0000-0000-0000000000f2', encode(digest('WA-USABLE-REVOKED', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() + interval '7 days', 1, 'usable: revoked');
update public.invitation_codes set revoked_at = now() where id = '89000000-0000-0000-0000-0000000000f2';

-- 34. Code actif, non expiré, non révoqué, use_count < max_uses : utilisable.
select is(public.is_invitation_code_usable(encode(digest('WA-USABLE-ACTIVE', 'sha256'), 'hex')), true, 'Code actif : utilisable');
-- 35. Code expiré : jamais utilisable.
select is(public.is_invitation_code_usable(encode(digest('WA-USABLE-EXPIRED', 'sha256'), 'hex')), false, 'Code expiré : jamais utilisable');
-- 36. Code révoqué : jamais utilisable.
select is(public.is_invitation_code_usable(encode(digest('WA-USABLE-REVOKED', 'sha256'), 'hex')), false, 'Code révoqué : jamais utilisable');
-- 37. Code dont use_count = max_uses : jamais utilisable.
select is(public.is_invitation_code_usable(encode(digest('WA-USABLE-MAXED', 'sha256'), 'hex')), false, 'Code déjà entièrement utilisé (use_count = max_uses) : jamais utilisable');
-- 38. Code inconnu (jamais généré) : jamais utilisable — même valeur de retour que les 3 cas ci-dessus, aucune distinction possible depuis l'appelant.
select is(public.is_invitation_code_usable(encode(digest('WA-CODE-JAMAIS-GENERE', 'sha256'), 'hex')), false, 'Code inconnu : jamais utilisable (même résultat qu''expiré/révoqué/épuisé)');

-- ---------------------------------------------------------------------------
-- handle_new_user : bootstrap postgres + garde-fou du garde-fou.
--
-- LIMITE CONNUE de cette suite (découverte pendant cette session, voir
-- rapport) : `supabase test db` se connecte en rôle `postgres`, qui N'EST
-- PAS un vrai superutilisateur dans la stack Supabase locale (`rolsuper` =
-- false — seul `supabase_admin` l'est). Impossible donc d'utiliser `SET
-- SESSION AUTHORIZATION supabase_auth_admin` (exige un vrai superutilisateur)
-- pour simuler ici, dans CE fichier, une insertion faite par GoTrue
-- (`session_user = supabase_auth_admin`) et vérifier que le garde-fou
-- s'applique bien dans ce cas — cette direction précise n'est PAS testée
-- automatiquement ci-dessous. Ce qui EST vérifié : (a) le contournement
-- fonctionne correctement et intégralement pour `session_user = postgres`
-- (tests 41-44), (b) un garde structurel interdit toute régression vers
-- `current_user` (test 39, qui aurait silencieusement annulé le garde-fou
-- pour TOUT appelant, GoTrue compris — bug réellement rencontré et corrigé
-- pendant cette session). Un test manuel unique (vraie inscription via
-- l'app, GoTrue réel) reste recommandé avant mise en production.
-- ---------------------------------------------------------------------------

-- 39. Garde structurel : le contournement utilise session_user, jamais
--     current_user seul (qui devient TOUJOURS le propriétaire de la
--     fonction, ici postgres, à l'intérieur d'un bloc SECURITY DEFINER —
--     vérifié empiriquement pendant cette session : un contournement basé
--     sur current_user annule silencieusement le garde-fou pour N'IMPORTE
--     QUEL appelant, y compris GoTrue/supabase_auth_admin en production).
select ok(
  (select prosrc from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace) ~ 'session_user\s*<>\s*''postgres''',
  'handle_new_user utilise session_user (jamais current_user seul) pour le contournement postgres'
);

-- 40. Hypothèse sur laquelle repose toute cette section : dans CE harnais
--     de test, session_user vaut bien 'postgres' (sinon les tests 41-44
--     échoueraient pour une tout autre raison que celle testée).
select is(session_user::text, 'postgres', 'session_user vaut ''postgres'' dans le harnais supabase test db');

-- 41. Bootstrap : inscription sans code d'invitation réussit en session_user = postgres.
select lives_ok(
  $$ insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ('89000000-0000-0000-0000-000000000010', 'phase89-no-code@test.local', 'x', now(), '{"username":"phase89_no_code"}') $$,
  'Bootstrap (session_user postgres) : inscription sans code d''invitation réussit'
);

-- 42. Bootstrap : un code syntaxiquement fourni mais inconnu n'empêche pas non plus l'inscription (contournement total, pas une validation partielle).
select lives_ok(
  $$ insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ('89000000-0000-0000-0000-000000000011', 'phase89-bad-code@test.local', 'x', now(), '{"username":"phase89_bad_code","invitation_code":"WA-CODE-INCONNU"}') $$,
  'Bootstrap (session_user postgres) : un code inconnu n''empêche pas l''inscription'
);

-- 43. Bootstrap : un code VALIDE fourni n'est pas consommé (use_count inchangé) — preuve que le bloc entier est ignoré, pas seulement la validation.
insert into public.invitation_codes (code_hash, created_by, expires_at, max_uses)
values (encode(digest('WA-BYPASS-FIXTURE', 'sha256'), 'hex'), '89000000-0000-0000-0000-000000000002', now() + interval '7 days', 1);
select lives_ok(
  $$ insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ('89000000-0000-0000-0000-000000000012', 'phase89-bypass@test.local', 'x', now(), '{"username":"phase89_bypass","invitation_code":"WA-BYPASS-FIXTURE"}') $$,
  'Bootstrap (session_user postgres) : inscription avec un code par ailleurs valide réussit aussi'
);
select is(
  (select use_count from public.invitation_codes where code_hash = encode(digest('WA-BYPASS-FIXTURE', 'sha256'), 'hex')),
  0,
  'Le code fourni n''est PAS consommé (use_count reste 0) — le bloc entier est ignoré en bootstrap, pas juste la validation'
);

-- 44. Cohérent avec le test 43 : le code brut fourni n'est pas non plus effacé de raw_user_meta_data (le nettoyage fait partie du même bloc ignoré).
select is(
  (select raw_user_meta_data ? 'invitation_code' from auth.users where id = '89000000-0000-0000-0000-000000000012'),
  true,
  'En bootstrap, le code fourni n''est pas effacé de raw_user_meta_data (cohérent avec un contournement total du bloc)'
);

-- ---------------------------------------------------------------------------
-- 45. Non-régression : la messagerie existante fonctionne toujours après
--     l'extension de handle_new_user (aucune régression sur les comptes
--     créés avant cette migration).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '89000000-0000-0000-0000-000000000001';
set local "request.jwt.claims" = '{"sub":"89000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.get_or_create_direct_conversation('89000000-0000-0000-0000-000000000002') $$,
  'A peut toujours créer une conversation (non-régression messagerie, Phase 8.9)'
);
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select finish();
rollback;
