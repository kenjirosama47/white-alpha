-- Tests de sécurité pour la Phase 6 (notifications push privées, sécurisées
-- et multi-appareils). Couvre exclusivement les objets introduits par la
-- migration 20260717190000_push_notifications.sql : user_push_devices,
-- notification_preferences, push_notification_log, et les fonctions
-- SECURITY DEFINER associées. Ne duplique pas les suites existantes.
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures : 2 utilisateurs de test (A, B) + une conversation + un message.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('81000000-0000-0000-0000-000000000081', 'phase6-user-a@test.local', 'x', now(), '{"username":"phase6_user_a"}'),
  ('82000000-0000-0000-0000-000000000082', 'phase6-user-b@test.local', 'x', now(), '{"username":"phase6_user_b"}');

set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('82000000-0000-0000-0000-000000000082') as id;

create temporary table t_msg as
  select * from public.create_text_message((select id from t_conv), 'Message de test Phase 6');

-- ---------------------------------------------------------------------------
-- 1-2. Un utilisateur anonyme ne peut appeler aucune fonction push.
-- ---------------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";
set local role anon;

select throws_ok(
  $$ select public.register_push_device('ExponentPushToken[anon-attempt]', 'android') $$,
  'permission denied for function register_push_device',
  'anon ne peut pas appeler register_push_device'
);

select throws_ok(
  $$ select public.get_my_notification_preferences() $$,
  'permission denied for function get_my_notification_preferences',
  'anon ne peut pas appeler get_my_notification_preferences'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3-4. Enregistrement d'un appareil pour A, puis un second appareil (multi-
--      appareils).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select lives_ok(
  $$ select public.register_push_device('ExponentPushToken[user-a-device-1]', 'android', 'Pixel de test', '1.0.0') $$,
  'A peut enregistrer un premier appareil'
);

select lives_ok(
  $$ select public.register_push_device('ExponentPushToken[user-a-device-2]', 'ios', 'iPhone de test', '1.0.0') $$,
  'A peut enregistrer un second appareil (multi-appareils)'
);

select is(
  (select count(*) from public.user_push_devices where user_id = '81000000-0000-0000-0000-000000000081'),
  2::bigint,
  'A possède bien 2 appareils actifs après les deux enregistrements'
);

-- ---------------------------------------------------------------------------
-- 5. Token unique : un même token ne peut pas exister deux fois (contrainte).
--    register_push_device réattribue plutôt qu'il ne duplique.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.register_push_device('ExponentPushToken[user-a-device-1]', 'android', 'Pixel de test', '1.0.1') $$,
  'Réenregistrer le même token ne lève pas d''erreur (upsert, pas de doublon)'
);

select is(
  (select count(*) from public.user_push_devices where expo_push_token = 'ExponentPushToken[user-a-device-1]'),
  1::bigint,
  'Le token reste unique en base après un réenregistrement (contrainte unique respectée)'
);

-- ---------------------------------------------------------------------------
-- 6. Réattribution : B enregistre le MÊME token physique (même appareil,
--    compte différent après déconnexion/reconnexion) : la ligne bascule vers
--    B, ne crée pas de doublon, A n'est plus propriétaire de ce token.
-- ---------------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";
set local role authenticated;
set local "request.jwt.claim.sub" = '82000000-0000-0000-0000-000000000082';
set local "request.jwt.claims" = '{"sub":"82000000-0000-0000-0000-000000000082","role":"authenticated"}';

select lives_ok(
  $$ select public.register_push_device('ExponentPushToken[user-a-device-1]', 'android') $$,
  'B peut réattribuer un token précédemment enregistré par A (même appareil physique)'
);

select is(
  (select user_id from public.user_push_devices where expo_push_token = 'ExponentPushToken[user-a-device-1]'),
  '82000000-0000-0000-0000-000000000082'::uuid,
  'Le token réattribué appartient maintenant à B'
);

-- Rétablit le token sous A pour la suite des tests (recrée un état propre).
select public.deactivate_push_device('ExponentPushToken[user-a-device-1]');

-- reset role (rôle de connexion, contourne RLS) nécessaire ici : le contexte
-- courant est encore celui de B, dont la policy SELECT ne laisse voir aucune
-- ligne appartenant à A — un simple filtre WHERE user_id = A ne suffit pas à
-- lui seul à contourner RLS.
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select is(
  (select count(*) from public.user_push_devices where user_id = '81000000-0000-0000-0000-000000000081'),
  1::bigint,
  'A ne possède plus que son second appareil après la réattribution'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';
select public.register_push_device('ExponentPushToken[user-a-device-1]', 'android');

-- ---------------------------------------------------------------------------
-- 7-8. Un utilisateur ne peut jamais lire les appareils d'un autre (RLS).
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.user_push_devices where user_id = '82000000-0000-0000-0000-000000000082'),
  0::bigint,
  'A ne voit aucun appareil appartenant à B (RLS SELECT scope au propriétaire)'
);

select is(
  (select count(*) from public.user_push_devices),
  2::bigint,
  'A ne voit que ses propres 2 appareils au total, jamais ceux de B (RLS active)'
);

-- ---------------------------------------------------------------------------
-- 9-10. Désactivation à la déconnexion : uniquement l'appareil courant,
--       jamais les autres appareils du même utilisateur.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.deactivate_push_device('ExponentPushToken[user-a-device-1]') $$,
  'A peut désactiver le token de son appareil courant à la déconnexion'
);

select results_eq(
  $$ select enabled from public.user_push_devices
     where expo_push_token in ('ExponentPushToken[user-a-device-1]', 'ExponentPushToken[user-a-device-2]')
     order by expo_push_token $$,
  $$ values (false), (true) $$,
  'Seul le device-1 est désactivé, device-2 reste actif (déconnexion multi-appareils)'
);

-- 11. Désactiver un token déjà désactivé, ou inexistant, ou d'un autre
--     compte : idempotent, jamais d'erreur.
select lives_ok(
  $$ select public.deactivate_push_device('ExponentPushToken[user-a-device-1]') $$,
  'Désactiver un token déjà désactivé est idempotent, aucune erreur'
);

select lives_ok(
  $$ select public.deactivate_push_device('ExponentPushToken[inexistant]') $$,
  'Désactiver un token inexistant est idempotent, aucune erreur'
);

-- ---------------------------------------------------------------------------
-- 12-13. Préférences de notification : upsert paresseux, écriture limitée à
--        auth.uid().
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select notifications_enabled, lock_screen_preview, sound_enabled
     from public.get_my_notification_preferences() $$,
  $$ values (true, false, true) $$,
  'Valeurs par défaut : notifications activées, aperçu écran verrouillé désactivé, son activé'
);

select lives_ok(
  $$ select public.update_my_notification_preferences(false, true, false) $$,
  'A peut mettre à jour ses propres préférences'
);

select results_eq(
  $$ select notifications_enabled, lock_screen_preview, sound_enabled
     from public.get_my_notification_preferences() $$,
  $$ values (false, true, false) $$,
  'Les préférences mises à jour sont bien persistées'
);

-- ---------------------------------------------------------------------------
-- 14. Un utilisateur ne peut jamais lire/modifier les préférences d'un autre
--     (aucune policy, aucun grant table direct : uniquement via RPC, toujours
--     bornée à auth.uid()).
-- ---------------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";
set local role authenticated;
set local "request.jwt.claim.sub" = '82000000-0000-0000-0000-000000000082';
set local "request.jwt.claims" = '{"sub":"82000000-0000-0000-0000-000000000082","role":"authenticated"}';

select results_eq(
  $$ select notifications_enabled from public.get_my_notification_preferences() $$,
  $$ values (true) $$,
  'B a ses propres préférences par défaut, jamais celles de A'
);

-- ---------------------------------------------------------------------------
-- 15-16. Déduplication par (message_id, appareil) : le journal empêche deux
--        entrées identiques.
-- ---------------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select lives_ok(
  $$ insert into public.push_notification_log (message_id, device_id)
     select (select message_id from t_msg), id from public.user_push_devices
     where expo_push_token = 'ExponentPushToken[user-a-device-2]' $$,
  'Première insertion dans le journal de déduplication réussit'
);

select throws_ok(
  $$ insert into public.push_notification_log (message_id, device_id)
     select (select message_id from t_msg), id from public.user_push_devices
     where expo_push_token = 'ExponentPushToken[user-a-device-2]' $$,
  'duplicate key value violates unique constraint "push_notification_log_dedup"',
  'Une seconde insertion pour le même (message_id, appareil) est rejetée (déduplication)'
);

-- ---------------------------------------------------------------------------
-- 17-19. Ouverture sécurisée depuis une notification : appartenance
--        revalidée, jamais d'accès à une conversation dont on n'est pas/plus
--        participant.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select is(
  (select other_user_id from public.get_conversation_for_notification((select id from t_conv))),
  '82000000-0000-0000-0000-000000000082'::uuid,
  'A, participant, peut rouvrir sa conversation depuis une notification'
);

-- ---------------------------------------------------------------------------
-- Correctif Anomalie 1 (build 16, migration 20260718090000) :
-- get_conversation_for_notification doit refléter l'avatar_preset réel de
-- l'autre participant, jamais un repli client codé en dur.
-- ---------------------------------------------------------------------------
select is(
  (select other_avatar_preset from public.get_conversation_for_notification((select id from t_conv))),
  'wolf_white_calm',
  'get_conversation_for_notification renvoie l''avatar_preset par défaut de B avant toute modification'
);

-- `authenticated` n'a jamais de GRANT UPDATE direct sur profiles.avatar_preset
-- (seule update_my_avatar_preset, SECURITY DEFINER, peut l'écrire — voir
-- migration 20260717210000) : reset role le temps de cette mise à jour de
-- fixture, exactement comme les insert into auth.users plus haut dans ce
-- fichier, jamais une élévation de privilège du test lui-même.
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";
update public.profiles set avatar_preset = 'wolf_alpha' where id = '82000000-0000-0000-0000-000000000082';

set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select is(
  (select other_avatar_preset from public.get_conversation_for_notification((select id from t_conv))),
  'wolf_alpha',
  'get_conversation_for_notification reflète l''avatar_preset réellement choisi par B, jamais un repli codé en dur (Anomalie 1, build 16)'
);

select is(
  (select count(*) from public.get_conversation_for_notification('00000000-0000-0000-0000-000000000000')),
  0::bigint,
  'Une conversation inexistante renvoie zéro ligne (jamais une erreur distinctive)'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values ('83000000-0000-0000-0000-000000000083', 'phase6-user-c@test.local', 'x', now(), '{"username":"phase6_user_c"}');

set local role authenticated;
set local "request.jwt.claim.sub" = '83000000-0000-0000-0000-000000000083';
set local "request.jwt.claims" = '{"sub":"83000000-0000-0000-0000-000000000083","role":"authenticated"}';

select is(
  (select count(*) from public.get_conversation_for_notification((select id from t_conv))),
  0::bigint,
  'Un non-participant (C) ne peut pas rouvrir la conversation de A et B depuis une notification'
);

-- ---------------------------------------------------------------------------
-- 20-21. Session expirée / non authentifiée : toute RPC push exige auth.uid().
-- ---------------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";
set local role authenticated;
-- Pas de request.jwt.claims : simule un JWT expiré/absent (auth.uid() = null).

select throws_ok(
  $$ select public.register_push_device('ExponentPushToken[session-expiree]', 'android') $$,
  'Authentification requise.',
  'register_push_device refuse un appel sans session valide (auth.uid() null)'
);

select throws_ok(
  $$ select public.get_conversation_for_notification((select id from t_conv)) $$,
  'Authentification requise.',
  'get_conversation_for_notification refuse un appel sans session valide'
);

reset role;

-- ---------------------------------------------------------------------------
-- 22. La messagerie continue de fonctionner normalement : le trigger de
--     notification (pg_net absent ou secrets non configurés en local) ne
--     bloque jamais l'insertion d'un message.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select lives_ok(
  $$ select public.create_text_message((select id from t_conv), 'La messagerie fonctionne toujours (Phase 6)') $$,
  'Un nouveau message peut toujours être créé normalement malgré le trigger de notification'
);

reset role;

-- ---------------------------------------------------------------------------
-- 23. Plateforme invalide refusée par register_push_device.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select throws_ok(
  $$ select public.register_push_device('ExponentPushToken[plateforme-invalide]', 'windows') $$,
  'Plateforme invalide.',
  'register_push_device refuse une plateforme autre que android/ios'
);

reset role;

-- ---------------------------------------------------------------------------
-- 24. cleanup_stale_push_devices n'est appelable par aucun rôle client.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

select throws_ok(
  $$ select public.cleanup_stale_push_devices() $$,
  'permission denied for function cleanup_stale_push_devices',
  'cleanup_stale_push_devices n''est appelable par aucun rôle client (réservée à une exécution privilégiée)'
);

reset role;

select finish();
rollback;
