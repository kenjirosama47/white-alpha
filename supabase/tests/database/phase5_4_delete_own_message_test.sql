-- Tests de sécurité RLS/RPC pour la Phase 5.4 (suppression sécurisée des
-- messages texte/photo/vidéo et de leurs pièces jointes).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test (A, B, C non membre de la conversation
-- A/B). Les profils sont créés automatiquement par le trigger
-- on_auth_user_created (Phase 2).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('d5000000-0000-0000-0000-0000000000d5', 'phase54-user-a@test.local', 'x', now(), '{"username":"phase54_user_a"}'),
  ('e5000000-0000-0000-0000-0000000000e5', 'phase54-user-b@test.local', 'x', now(), '{"username":"phase54_user_b"}'),
  ('f5000000-0000-0000-0000-0000000000f5', 'phase54-user-c@test.local', 'x', now(), '{"username":"phase54_user_c"}');

set local role authenticated;

-- 1. delete_own_message refuse un appel non authentifié.
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.delete_own_message('00000000-0000-0000-0000-000000000000'::uuid) $$,
  'Authentification requise.',
  'delete_own_message refuse un appel sans authentification'
);

set local "request.jwt.claim.sub" = 'd5000000-0000-0000-0000-0000000000d5';
set local "request.jwt.claims" = '{"sub":"d5000000-0000-0000-0000-0000000000d5","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('e5000000-0000-0000-0000-0000000000e5') as id;

-- ---------------------------------------------------------------------------
-- Privilèges exacts (GRANT) sur la RPC.
-- ---------------------------------------------------------------------------

-- 2. anon n'a pas EXECUTE sur delete_own_message.
select ok(
  not has_function_privilege('anon', 'public.delete_own_message(uuid)', 'EXECUTE'),
  'anon n''a pas EXECUTE sur delete_own_message'
);

-- 3. public (PUBLIC) n'a pas EXECUTE sur delete_own_message.
select ok(
  not has_function_privilege('public', 'public.delete_own_message(uuid)', 'EXECUTE'),
  'public n''a pas EXECUTE sur delete_own_message'
);

-- 4. authenticated a EXECUTE sur delete_own_message.
select ok(
  has_function_privilege('authenticated', 'public.delete_own_message(uuid)', 'EXECUTE'),
  'authenticated a EXECUTE sur delete_own_message'
);

-- ---------------------------------------------------------------------------
-- Message texte : suppression par son auteur.
-- ---------------------------------------------------------------------------

create temporary table t_text as
  select * from public.create_text_message((select id from t_conv), 'Message à supprimer');

create temporary table t_del_text as
  select * from public.delete_own_message((select message_id from t_text));

-- 5. Le résultat renvoyé correspond au message texte supprimé, sans storage_path.
select ok(
  (select message_id from t_del_text) = (select message_id from t_text)
  and (select message_type from t_del_text) = 'text'
  and (select storage_path from t_del_text) is null,
  'A supprime son propre message texte : message_id/message_type corrects, storage_path NULL'
);

-- 6. Le message texte n'existe plus dans messages après suppression.
select is(
  (select count(*) from public.messages where id = (select message_id from t_text)),
  0::bigint,
  'Le message texte supprimé n''existe plus dans messages'
);

-- ---------------------------------------------------------------------------
-- Un participant qui n'est pas l'auteur ne peut jamais supprimer.
-- ---------------------------------------------------------------------------

create temporary table t_text2 as
  select * from public.create_text_message((select id from t_conv), 'Message de A, intouchable par B');

set local "request.jwt.claim.sub" = 'e5000000-0000-0000-0000-0000000000e5';
set local "request.jwt.claims" = '{"sub":"e5000000-0000-0000-0000-0000000000e5","role":"authenticated"}';

-- 7. B (participant, pas l'auteur) ne peut pas supprimer le message de A.
select throws_ok(
  $$ select public.delete_own_message((select message_id from t_text2)) $$,
  'Tu ne peux supprimer que tes propres messages.',
  'B (participant mais pas auteur) ne peut pas supprimer le message de A'
);

-- 8. Le message de A existe toujours après le refus opposé à B.
select is(
  (select count(*) from public.messages where id = (select message_id from t_text2)),
  1::bigint,
  'Le message de A existe toujours après le refus opposé à B'
);

-- 9. C (non membre) ne peut pas non plus supprimer le message de A.
set local "request.jwt.claim.sub" = 'f5000000-0000-0000-0000-0000000000f5';
set local "request.jwt.claims" = '{"sub":"f5000000-0000-0000-0000-0000000000f5","role":"authenticated"}';

select throws_ok(
  $$ select public.delete_own_message((select message_id from t_text2)) $$,
  'Tu ne peux supprimer que tes propres messages.',
  'C (non membre) ne peut pas supprimer le message de A'
);

set local "request.jwt.claim.sub" = 'd5000000-0000-0000-0000-0000000000d5';
set local "request.jwt.claims" = '{"sub":"d5000000-0000-0000-0000-0000000000d5","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Idempotence.
-- ---------------------------------------------------------------------------

-- 10. Un second appel sur le message texte déjà supprimé (test 5) ne renvoie
--     aucune ligne et ne lève pas d'erreur (idempotent, pas un doublon).
select is(
  (select count(*) from public.delete_own_message((select message_id from t_text))),
  0::bigint,
  'Un second appel sur un message déjà supprimé est idempotent (aucune ligne, pas d''erreur)'
);

-- 11. Un appel sur un message_id qui n'a jamais existé est également
--     idempotent (aucune ligne, pas d'erreur, pas de fuite d'information).
select is(
  (select count(*) from public.delete_own_message('99999999-9999-9999-9999-999999999999'::uuid)),
  0::bigint,
  'Un appel sur un message_id inexistant est idempotent (aucune ligne, pas d''erreur)'
);

-- ---------------------------------------------------------------------------
-- Message photo : suppression + storage_path renvoyé + cascade sur l'attachement.
-- ---------------------------------------------------------------------------

create temporary table t_img as
  select * from public.create_image_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/d5000000-0000-0000-0000-0000000000d5/photo.jpg',
    'image/jpeg', 500000, 800, 600, ''
  );

create temporary table t_del_img as
  select * from public.delete_own_message((select message_id from t_img));

-- 12. Le storage_path renvoyé correspond exactement à celui de la pièce jointe photo.
select ok(
  (select message_type from t_del_img) = 'image'
  and (select storage_path from t_del_img) = (select id from t_conv)::text || '/d5000000-0000-0000-0000-0000000000d5/photo.jpg',
  'A supprime son message photo : message_type=image, storage_path exact renvoyé'
);

-- 13. La pièce jointe photo est supprimée en cascade avec le message.
select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_img)),
  0::bigint,
  'La pièce jointe photo est supprimée en cascade après delete_own_message'
);

-- ---------------------------------------------------------------------------
-- Message vidéo : suppression + storage_path renvoyé + cascade sur l'attachement.
-- ---------------------------------------------------------------------------

create temporary table t_vid as
  select * from public.create_video_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/d5000000-0000-0000-0000-0000000000d5/clip.mp4',
    'video/mp4', 20971520, 45000, 1280, 720, ''
  );

create temporary table t_del_vid as
  select * from public.delete_own_message((select message_id from t_vid));

-- 14. Le storage_path renvoyé correspond exactement à celui de la pièce jointe vidéo.
select ok(
  (select message_type from t_del_vid) = 'video'
  and (select storage_path from t_del_vid) = (select id from t_conv)::text || '/d5000000-0000-0000-0000-0000000000d5/clip.mp4',
  'A supprime son message vidéo : message_type=video, storage_path exact renvoyé'
);

-- 15. La pièce jointe vidéo est supprimée en cascade avec le message.
select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_vid)),
  0::bigint,
  'La pièce jointe vidéo est supprimée en cascade après delete_own_message'
);

-- ---------------------------------------------------------------------------
-- Robustesse structurelle.
-- ---------------------------------------------------------------------------

-- 16. delete_own_message a un search_path explicite (protection contre le
--     détournement de recherche de schéma sur une fonction SECURITY DEFINER).
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'delete_own_message'
      and pronamespace = 'public'::regnamespace
      and proconfig @> array['search_path=public, pg_temp']
  ),
  'delete_own_message a un search_path explicite (public, pg_temp)'
);

-- 17. REPLICA IDENTITY FULL est activée sur messages (requis pour que les
--     événements Realtime DELETE contiennent conversation_id dans OLD).
select is(
  (select relreplident from pg_class where oid = 'public.messages'::regclass),
  'f',
  'REPLICA IDENTITY FULL est activée sur public.messages'
);

select finish();
rollback;
