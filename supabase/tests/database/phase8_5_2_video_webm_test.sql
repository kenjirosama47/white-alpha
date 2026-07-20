-- Tests pgTAP pour la Phase 8.5.2 (migration 20260720100000 : autoriser
-- video/webm en plus de video/mp4). Complète phase4b_video_messages_test.sql
-- sans le dupliquer : ne couvre que le delta introduit par cette migration
-- (webm accepté, mp4/images non affaiblis, RLS/RPC/GRANT inchangés).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures : 2 utilisateurs de test (A, B non membre pour les tests RLS).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('81000000-0000-0000-0000-000000000081', 'phase852-user-a@test.local', 'x', now(), '{"username":"phase852_user_a"}'),
  ('82000000-0000-0000-0000-000000000082', 'phase852-user-b@test.local', 'x', now(), '{"username":"phase852_user_b"}');

-- ---------------------------------------------------------------------------
-- Configuration du bucket chat-media : video/webm ajouté, rien retiré.
-- ---------------------------------------------------------------------------

-- 1. Le bucket chat-media autorise désormais video/webm.
select ok(
  (
    select 'video/webm' = any (allowed_mime_types)
    from storage.buckets where id = 'chat-media'
  ),
  'Le bucket chat-media autorise video/webm après la migration Phase 8.5.2'
);

-- 2. Le bucket chat-media autorise toujours video/mp4 (non-régression Phase 4B).
select ok(
  (
    select 'video/mp4' = any (allowed_mime_types)
    from storage.buckets where id = 'chat-media'
  ),
  'Le bucket chat-media autorise toujours video/mp4'
);

-- 3. Le bucket chat-media autorise toujours les 3 types image (Phase 4A, non affaibli).
select ok(
  (
    select allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
    from storage.buckets where id = 'chat-media'
  ),
  'Le bucket chat-media autorise toujours image/jpeg, image/png et image/webp'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('82000000-0000-0000-0000-000000000082') as id;

-- 4. A peut créer un message vidéo WebM valide (message + pièce jointe renvoyés).
create temporary table t_webm as
  select * from public.create_video_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/video.webm',
    'video/webm', 20971520, 30000, 1280, 720, ''
  );

select ok(
  (select message_id from t_webm) is not null and (select attachment_id from t_webm) is not null,
  'A peut créer un message vidéo WebM valide (message + pièce jointe renvoyés)'
);

-- 5. Le message créé est de type video, et la pièce jointe a media_type
--    video / mime_type video/webm (WebM accepté de bout en bout, pas
--    seulement par la contrainte).
select ok(
  (select message_type from public.messages where id = (select message_id from t_webm)) = 'video'
  and exists (
    select 1 from public.message_attachments a
    where a.id = (select attachment_id from t_webm)
      and a.media_type = 'video'
      and a.mime_type = 'video/webm'
  ),
  'Le message WebM est de type video et sa pièce jointe a media_type=video, mime_type=video/webm'
);

-- 5b. sender_id/uploader_id proviennent exclusivement de auth.uid() (A),
--     jamais d'un paramètre client — aucun moyen pour l'appelant de choisir
--     l'auteur du message WebM.
select ok(
  (select sender_id from public.messages where id = (select message_id from t_webm)) = '81000000-0000-0000-0000-000000000081'
  and exists (
    select 1 from public.message_attachments a
    where a.id = (select attachment_id from t_webm)
      and a.uploader_id = '81000000-0000-0000-0000-000000000081'
  ),
  'sender_id/uploader_id du message WebM correspondent exactement à auth.uid() de A, jamais à une valeur choisie par l''appelant'
);

-- 6. A peut toujours créer un message vidéo MP4 valide (non-régression Phase 4B).
create temporary table t_mp4 as
  select * from public.create_video_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/video.mp4',
    'video/mp4', 10485760, 20000, 640, 480, ''
  );

select ok(
  (select message_id from t_mp4) is not null and (select attachment_id from t_mp4) is not null,
  'A peut toujours créer un message vidéo MP4 valide après la migration Phase 8.5.2'
);

-- 7. Un type MIME toujours hors liste blanche (video/quicktime) reste refusé.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/video.mov',
       'video/quicktime', 1000000, 5000, null, null, ''
     ) $$,
  'Type de fichier non autorisé.',
  'video/quicktime reste refusé (type MIME toujours hors liste blanche après la migration)'
);

-- 8. Un autre type toujours hors liste blanche (video/avi) reste refusé.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/video.avi',
       'video/avi', 1000000, 5000, null, null, ''
     ) $$,
  'Type de fichier non autorisé.',
  'video/avi reste refusé (type MIME toujours hors liste blanche après la migration)'
);

-- 9. RLS inchangée : B (non membre) ne peut pas créer de message vidéo WebM
--    dans la conversation de A (même comportement que pour MP4, Phase 4B).
set local "request.jwt.claim.sub" = '82000000-0000-0000-0000-000000000082';
set local "request.jwt.claims" = '{"sub":"82000000-0000-0000-0000-000000000082","role":"authenticated"}';

select throws_ok(
  $$ select public.create_video_message(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '00000000-0000-0000-0000-000000000000/82000000-0000-0000-0000-000000000082/video.webm',
       'video/webm', 1000000, 5000, null, null, ''
     ) $$,
  'Conversation introuvable.',
  'B ne peut pas créer un message vidéo WebM dans une conversation à laquelle il n''appartient pas'
);

set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

-- 9b. image/jpeg refusé par create_video_message (RPC strictement vidéo,
--     la modification de la condition MIME ne l'a pas transformée en RPC
--     acceptant aussi les images).
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/photo.jpg',
       'image/jpeg', 1000000, 5000, null, null, ''
     ) $$,
  'Type de fichier non autorisé.',
  'image/jpeg est refusé par create_video_message (RPC strictement vidéo, même après l''élargissement MIME)'
);

-- 9c. Exécution anonyme réellement refusée (pas seulement l'absence de
--     privilège EXECUTE vérifiée en test 10 ci-dessous) : un rôle anon qui
--     tenterait quand même l'appel (ex. accès direct à l'API REST) est
--     bloqué par Postgres avant même d'entrer dans le corps de la fonction.
set local role anon;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.create_video_message(
       '00000000-0000-0000-0000-000000000000'::uuid, 'x/y/z.webm', 'video/webm', 1000, 5000, null, null, ''
     ) $$,
  '42501',
  null,
  'Un rôle anon ne peut pas exécuter create_video_message (permission refusée par Postgres)'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000081';
set local "request.jwt.claims" = '{"sub":"81000000-0000-0000-0000-000000000081","role":"authenticated"}';

-- 10. GRANT inchangé : anon n'a toujours pas EXECUTE sur create_video_message.
select ok(
  not has_function_privilege(
    'anon', 'public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text)', 'EXECUTE'
  ),
  'anon n''a toujours pas EXECUTE sur create_video_message après la migration Phase 8.5.2'
);

-- 11. GRANT inchangé : authenticated a toujours EXECUTE sur create_video_message.
select ok(
  has_function_privilege(
    'authenticated', 'public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text)', 'EXECUTE'
  ),
  'authenticated a toujours EXECUTE sur create_video_message après la migration Phase 8.5.2'
);

-- 12. Régression : la limite image (10 Mo) n'est pas affaiblie par cette
--     migration (elle ne touche que la branche video de la contrainte).
select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/81000000-0000-0000-0000-000000000081/photo.jpg',
       'image/jpeg', 10485761, null, null, ''
     ) $$,
  'Fichier trop volumineux.',
  'La limite de 10 Mo pour les photos n''est pas affaiblie par la migration Phase 8.5.2'
);

select finish();
rollback;
