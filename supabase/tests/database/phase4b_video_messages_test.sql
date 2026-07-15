-- Tests de sécurité RLS/RPC pour la Phase 4B (vidéos dans les conversations).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test (A, B, C non membre de la conversation
-- A/B). Les profils sont créés automatiquement par le trigger
-- on_auth_user_created (Phase 2).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('aa000000-0000-0000-0000-0000000000aa', 'phase4b-user-a@test.local', 'x', now(), '{"username":"phase4b_user_a"}'),
  ('bb000000-0000-0000-0000-0000000000bb', 'phase4b-user-b@test.local', 'x', now(), '{"username":"phase4b_user_b"}'),
  ('cc000000-0000-0000-0000-0000000000cc', 'phase4b-user-c@test.local', 'x', now(), '{"username":"phase4b_user_c"}');

set local role authenticated;

-- 1. create_video_message refuse un appel non authentifié.
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.create_video_message(
       '00000000-0000-0000-0000-000000000000'::uuid, 'x/y/z.mp4', 'video/mp4', 1000, 5000, null, null, ''
     ) $$,
  'Authentification requise.',
  'create_video_message refuse un appel sans authentification'
);

set local "request.jwt.claim.sub" = 'aa000000-0000-0000-0000-0000000000aa';
set local "request.jwt.claims" = '{"sub":"aa000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('bb000000-0000-0000-0000-0000000000bb') as id;

-- ---------------------------------------------------------------------------
-- Privilèges exacts (GRANT) sur la RPC.
-- ---------------------------------------------------------------------------

-- 2. anon et public (PUBLIC) n'ont EXECUTE sur create_video_message.
select ok(
  not has_function_privilege(
    'anon', 'public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'public', 'public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text)', 'EXECUTE'
  ),
  'anon et public (PUBLIC) n''ont EXECUTE sur create_video_message'
);

-- 3. authenticated a EXECUTE sur create_video_message.
select ok(
  has_function_privilege(
    'authenticated', 'public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text)', 'EXECUTE'
  ),
  'authenticated a EXECUTE sur create_video_message'
);

-- 4. C (non membre) ne peut pas créer de message vidéo dans la conversation A/B.
set local "request.jwt.claim.sub" = 'cc000000-0000-0000-0000-0000000000cc';
set local "request.jwt.claims" = '{"sub":"cc000000-0000-0000-0000-0000000000cc","role":"authenticated"}';

select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/cc000000-0000-0000-0000-0000000000cc/video.mp4',
       'video/mp4', 1000000, 5000, null, null, ''
     ) $$,
  'Conversation introuvable.',
  'C (non membre) ne peut pas créer un message vidéo dans la conversation de A et B'
);

set local "request.jwt.claim.sub" = 'aa000000-0000-0000-0000-0000000000aa';
set local "request.jwt.claims" = '{"sub":"aa000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

-- 5. Type MIME interdit refusé.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video.mov',
       'video/quicktime', 1000000, 5000, null, null, ''
     ) $$,
  'Type de fichier non autorisé.',
  'Un type MIME hors liste blanche (video/quicktime) est refusé'
);

-- 6. Fichier trop volumineux (> 50 Mo) refusé.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video.mp4',
       'video/mp4', 52428801, 5000, null, null, ''
     ) $$,
  'Fichier trop volumineux.',
  'Une vidéo de plus de 50 Mo est refusée'
);

-- 7. Vidéo trop longue (> 60 000 ms) refusée.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video.mp4',
       'video/mp4', 1000000, 60001, null, null, ''
     ) $$,
  'La vidéo ne doit pas dépasser 60 secondes.',
  'Une vidéo de plus de 60 secondes est refusée'
);

-- 8. Durée nulle/invalide refusée.
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video.mp4',
       'video/mp4', 1000000, 0, null, null, ''
     ) $$,
  'La vidéo ne doit pas dépasser 60 secondes.',
  'Une durée nulle/invalide est refusée'
);

-- 9. Chemin de fichier ne correspondant pas à conversation_id/uploader_id/...
--    refusé (ici : uploader_id usurpé, celui de B au lieu de A).
select throws_ok(
  $$ select public.create_video_message(
       (select id from t_conv), (select id from t_conv)::text || '/bb000000-0000-0000-0000-0000000000bb/video.mp4',
       'video/mp4', 1000000, 5000, null, null, ''
     ) $$,
  'Chemin de fichier invalide.',
  'Un chemin de fichier avec un uploader_id usurpé est refusé'
);

-- 10. A crée un message vidéo valide, sans légende.
create temporary table t_vid as
  select * from public.create_video_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video.mp4',
    'video/mp4', 20971520, 45000, 1280, 720, ''
  );

select ok(
  (select message_id from t_vid) is not null and (select attachment_id from t_vid) is not null,
  'A peut créer un message vidéo valide (message + pièce jointe renvoyés)'
);

-- 11. Le message créé par create_video_message est de type video.
select is(
  (select message_type from public.messages where id = (select message_id from t_vid)),
  'video',
  'Le message créé par create_video_message est de type video'
);

-- 12. La pièce jointe : media_type video, mime_type video/mp4, duration_ms correcte.
select ok(
  exists (
    select 1 from public.message_attachments a
    where a.id = (select attachment_id from t_vid)
      and a.message_id = (select message_id from t_vid)
      and a.uploader_id = 'aa000000-0000-0000-0000-0000000000aa'
      and a.media_type = 'video'
      and a.mime_type = 'video/mp4'
      and a.duration_ms = 45000
  ),
  'La pièce jointe vidéo a le bon media_type/mime_type/duration_ms et est rattachée au bon message/uploader'
);

-- 13. INSERT direct d'un message vidéo refusé (INSERT toujours révoqué, Phase 4A).
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, message_type, content)
     values ((select id from t_conv), 'aa000000-0000-0000-0000-0000000000aa', 'video', '') $$,
  '42501',
  null,
  'INSERT direct d''un message vidéo refusé à authenticated'
);

-- 14. INSERT direct d'une pièce jointe vidéo refusé.
select throws_ok(
  $$ insert into public.message_attachments (
       message_id, conversation_id, uploader_id, media_type, storage_path, mime_type, size_bytes, duration_ms
     ) values (
       (select message_id from t_vid), (select id from t_conv), 'aa000000-0000-0000-0000-0000000000aa', 'video',
       (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/autre.mp4', 'video/mp4', 1000000, 5000
     ) $$,
  '42501',
  null,
  'INSERT direct d''une pièce jointe vidéo refusé à authenticated'
);

-- 15. B (participant) voit la pièce jointe vidéo de A.
set local "request.jwt.claim.sub" = 'bb000000-0000-0000-0000-0000000000bb';
set local "request.jwt.claims" = '{"sub":"bb000000-0000-0000-0000-0000000000bb","role":"authenticated"}';

select ok(
  exists (select 1 from public.message_attachments where id = (select attachment_id from t_vid)),
  'B (participant) voit la pièce jointe vidéo de A'
);

-- 16. C (non membre) ne voit pas la pièce jointe vidéo de A.
set local "request.jwt.claim.sub" = 'cc000000-0000-0000-0000-0000000000cc';
set local "request.jwt.claims" = '{"sub":"cc000000-0000-0000-0000-0000000000cc","role":"authenticated"}';

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_vid)),
  0::bigint,
  'C (non membre) ne voit pas la pièce jointe vidéo de A'
);

-- 17. B ne peut pas supprimer la pièce jointe vidéo de A.
set local "request.jwt.claim.sub" = 'bb000000-0000-0000-0000-0000000000bb';
set local "request.jwt.claims" = '{"sub":"bb000000-0000-0000-0000-0000000000bb","role":"authenticated"}';

delete from public.message_attachments where id = (select attachment_id from t_vid);

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_vid)),
  1::bigint,
  'B ne peut pas supprimer la pièce jointe vidéo de A : elle existe toujours'
);

-- 18. A (uploader) peut supprimer sa propre pièce jointe vidéo.
set local "request.jwt.claim.sub" = 'aa000000-0000-0000-0000-0000000000aa';
set local "request.jwt.claims" = '{"sub":"aa000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

delete from public.message_attachments where id = (select attachment_id from t_vid);

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_vid)),
  0::bigint,
  'A (uploader) peut supprimer sa propre pièce jointe vidéo'
);

-- 19. Supprimer le message vidéo supprime sa pièce jointe en cascade.
create temporary table t_vid2 as
  select * from public.create_video_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/video2.mp4',
    'video/mp4', 1048576, 3000, 640, 480, 'Légende vidéo'
  );

delete from public.messages where id = (select message_id from t_vid2);

select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_vid2)),
  0::bigint,
  'Supprimer le message vidéo supprime sa pièce jointe en cascade'
);

-- 20. Régression : la limite image (10 Mo) n'est pas affaiblie par le
--     relèvement de la limite du bucket à 50 Mo pour les vidéos.
select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/aa000000-0000-0000-0000-0000000000aa/photo.jpg',
       'image/jpeg', 10485761, null, null, ''
     ) $$,
  'Fichier trop volumineux.',
  'La limite de 10 Mo pour les photos n''est pas affaiblie par la Phase 4B'
);

select finish();
rollback;
