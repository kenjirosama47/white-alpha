-- Tests de sécurité RLS/RPC pour la Phase 4A (photos dans les conversations,
-- et durcissement de la création de messages texte).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test (A, B, C non membre de la conversation
-- A/B). Les profils sont créés automatiquement par le trigger
-- on_auth_user_created (Phase 2).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('a1000000-0000-0000-0000-00000000000a', 'phase4a-user-a@test.local', 'x', now(), '{"username":"phase4a_user_a"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'phase4a-user-b@test.local', 'x', now(), '{"username":"phase4a_user_b"}'),
  ('c1000000-0000-0000-0000-00000000000c', 'phase4a-user-c@test.local', 'x', now(), '{"username":"phase4a_user_c"}');

set local role authenticated;

-- 1. create_text_message refuse un appel non authentifié.
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select public.create_text_message('00000000-0000-0000-0000-000000000000'::uuid, 'x') $$,
  'Authentification requise.',
  'create_text_message refuse un appel sans authentification'
);

-- 2. create_image_message refuse un appel non authentifié.
select throws_ok(
  $$ select public.create_image_message(
       '00000000-0000-0000-0000-000000000000'::uuid, 'x/y/z.jpg', 'image/jpeg', 1000, null, null, ''
     ) $$,
  'Authentification requise.',
  'create_image_message refuse un appel sans authentification'
);

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('b1000000-0000-0000-0000-00000000000b') as id;

-- ---------------------------------------------------------------------------
-- Privilèges exacts (GRANT), indépendants des policies RLS.
-- ---------------------------------------------------------------------------

-- 3. anon et public (PUBLIC) n'ont EXECUTE sur aucune des deux RPC.
select ok(
  not has_function_privilege('anon', 'public.create_text_message(uuid, text)', 'EXECUTE')
  and not has_function_privilege(
    'anon', 'public.create_image_message(uuid, text, text, bigint, integer, integer, text)', 'EXECUTE'
  )
  and not has_function_privilege('public', 'public.create_text_message(uuid, text)', 'EXECUTE')
  and not has_function_privilege(
    'public', 'public.create_image_message(uuid, text, text, bigint, integer, integer, text)', 'EXECUTE'
  ),
  'anon et public (PUBLIC) n''ont EXECUTE sur aucune des deux RPC'
);

-- 4. authenticated a EXECUTE sur les deux RPC.
select ok(
  has_function_privilege('authenticated', 'public.create_text_message(uuid, text)', 'EXECUTE')
  and has_function_privilege(
    'authenticated', 'public.create_image_message(uuid, text, text, bigint, integer, integer, text)', 'EXECUTE'
  ),
  'authenticated a EXECUTE sur les deux RPC'
);

-- 5. anon n'a aucun privilège de table sur messages.
select ok(
  not has_table_privilege('anon', 'public.messages', 'SELECT')
  and not has_table_privilege('anon', 'public.messages', 'INSERT')
  and not has_table_privilege('anon', 'public.messages', 'UPDATE')
  and not has_table_privilege('anon', 'public.messages', 'DELETE'),
  'anon n''a aucun privilège de table sur messages'
);

-- 6. anon n'a aucun privilège de table sur message_attachments.
select ok(
  not has_table_privilege('anon', 'public.message_attachments', 'SELECT')
  and not has_table_privilege('anon', 'public.message_attachments', 'INSERT')
  and not has_table_privilege('anon', 'public.message_attachments', 'UPDATE')
  and not has_table_privilege('anon', 'public.message_attachments', 'DELETE'),
  'anon n''a aucun privilège de table sur message_attachments'
);

-- 7. authenticated : SELECT/UPDATE/DELETE conservés, INSERT révoqué sur messages.
select ok(
  has_table_privilege('authenticated', 'public.messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.messages', 'INSERT')
  and has_table_privilege('authenticated', 'public.messages', 'UPDATE')
  and has_table_privilege('authenticated', 'public.messages', 'DELETE'),
  'authenticated : SELECT/UPDATE/DELETE conservés, INSERT révoqué sur messages'
);

-- 8. authenticated : SELECT/DELETE uniquement sur message_attachments (pas d'INSERT ni d'UPDATE direct).
select ok(
  has_table_privilege('authenticated', 'public.message_attachments', 'SELECT')
  and has_table_privilege('authenticated', 'public.message_attachments', 'DELETE')
  and not has_table_privilege('authenticated', 'public.message_attachments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.message_attachments', 'UPDATE'),
  'authenticated : SELECT/DELETE uniquement sur message_attachments'
);

-- ---------------------------------------------------------------------------
-- INSERT direct bloqué (défense en profondeur au-delà du simple GRANT).
-- ---------------------------------------------------------------------------

-- 9. INSERT direct d'un message texte refusé à authenticated.
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, message_type, content)
     values ((select id from t_conv), 'a1000000-0000-0000-0000-00000000000a', 'text', 'Salut direct') $$,
  '42501',
  null,
  'INSERT direct d''un message texte refusé à authenticated'
);

-- 10. INSERT direct d'un message image "orphelin" (sans pièce jointe) refusé :
--     impossible de créer un message image via l'application autrement que
--     par create_image_message, qui crée systématiquement les deux lignes.
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, message_type, content)
     values ((select id from t_conv), 'a1000000-0000-0000-0000-00000000000a', 'image', '') $$,
  '42501',
  null,
  'INSERT direct d''un message image sans pièce jointe refusé à authenticated'
);

-- ---------------------------------------------------------------------------
-- create_text_message.
-- ---------------------------------------------------------------------------

-- 11. Texte vide refusé.
select throws_ok(
  $$ select public.create_text_message((select id from t_conv), '   ') $$,
  'Le message ne peut pas être vide.',
  'create_text_message refuse un texte vide'
);

-- 12. C (non membre) ne peut pas créer de message texte dans la conversation A/B.
set local "request.jwt.claim.sub" = 'c1000000-0000-0000-0000-00000000000c';
set local "request.jwt.claims" = '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ select public.create_text_message((select id from t_conv), 'Salut') $$,
  'Conversation introuvable.',
  'C (non membre) ne peut pas créer un message texte dans la conversation de A et B'
);

-- 13. A crée un message texte valide.
set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temporary table t_text as
  select * from public.create_text_message((select id from t_conv), 'Salut B !');

select ok(
  (select message_id from t_text) is not null and (select content from t_text) = 'Salut B !',
  'A crée un message texte valide via create_text_message'
);

-- 14. Le message créé est bien de type text.
select is(
  (select message_type from t_text),
  'text',
  'Le message créé par create_text_message est de type text'
);

-- ---------------------------------------------------------------------------
-- create_image_message.
-- ---------------------------------------------------------------------------

-- 15. C (non membre) ne peut pas créer un message photo dans la conversation A/B.
set local "request.jwt.claim.sub" = 'c1000000-0000-0000-0000-00000000000c';
set local "request.jwt.claims" = '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/c1000000-0000-0000-0000-00000000000c/photo.jpg',
       'image/jpeg', 1000, null, null, ''
     ) $$,
  'Conversation introuvable.',
  'C (non membre) ne peut pas créer un message photo dans la conversation de A et B'
);

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 16. Type MIME interdit refusé.
select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/a1000000-0000-0000-0000-00000000000a/photo.gif',
       'image/gif', 1000, null, null, ''
     ) $$,
  'Type de fichier non autorisé.',
  'Un type MIME hors liste blanche est refusé'
);

-- 17. Fichier trop volumineux (> 10 Mo) refusé.
select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/a1000000-0000-0000-0000-00000000000a/photo.jpg',
       'image/jpeg', 10485761, null, null, ''
     ) $$,
  'Fichier trop volumineux.',
  'Un fichier de plus de 10 Mo est refusé'
);

-- 18. Chemin de fichier ne correspondant pas à conversation_id/uploader_id/...
--     refusé (ici : uploader_id usurpé, celui de B au lieu de A).
select throws_ok(
  $$ select public.create_image_message(
       (select id from t_conv), (select id from t_conv)::text || '/b1000000-0000-0000-0000-00000000000b/photo.jpg',
       'image/jpeg', 1000, null, null, ''
     ) $$,
  'Chemin de fichier invalide.',
  'Un chemin de fichier avec un uploader_id usurpé est refusé'
);

-- 19. A crée un message photo valide, sans légende.
create temporary table t_img as
  select * from public.create_image_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/a1000000-0000-0000-0000-00000000000a/photo.jpg',
    'image/jpeg', 123456, 800, 600, ''
  );

select ok(
  (select message_id from t_img) is not null and (select attachment_id from t_img) is not null,
  'A peut créer un message photo valide (message + pièce jointe renvoyés)'
);

-- 20. Le message créé par create_image_message est de type image.
select is(
  (select message_type from public.messages where id = (select message_id from t_img)),
  'image',
  'Le message créé par create_image_message est de type image'
);

-- 21. La pièce jointe créée est bien rattachée au message et au bon uploader.
select ok(
  exists (
    select 1 from public.message_attachments a
    where a.id = (select attachment_id from t_img)
      and a.message_id = (select message_id from t_img)
      and a.uploader_id = 'a1000000-0000-0000-0000-00000000000a'
  ),
  'La pièce jointe est rattachée au bon message et au bon uploader'
);

-- 22. B (participant) voit la pièce jointe de A.
set local "request.jwt.claim.sub" = 'b1000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select ok(
  exists (select 1 from public.message_attachments where id = (select attachment_id from t_img)),
  'B (participant) voit la pièce jointe de A (lecture réservée aux participants)'
);

-- 23. C (non membre) ne voit pas la pièce jointe de A.
set local "request.jwt.claim.sub" = 'c1000000-0000-0000-0000-00000000000c';
set local "request.jwt.claims" = '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_img)),
  0::bigint,
  'C (non membre) ne voit pas la pièce jointe de A'
);

-- 24. B ne peut pas supprimer la pièce jointe de A (suppression réservée à l'uploader).
set local "request.jwt.claim.sub" = 'b1000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}';

delete from public.message_attachments where id = (select attachment_id from t_img);

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_img)),
  1::bigint,
  'B ne peut pas supprimer la pièce jointe de A : elle existe toujours'
);

-- 25. A (uploader) peut supprimer sa propre pièce jointe.
set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}';

delete from public.message_attachments where id = (select attachment_id from t_img);

select is(
  (select count(*) from public.message_attachments where id = (select attachment_id from t_img)),
  0::bigint,
  'A (uploader) peut supprimer sa propre pièce jointe'
);

-- 26. Supprimer le message supprime sa pièce jointe en cascade.
create temporary table t_img2 as
  select * from public.create_image_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/a1000000-0000-0000-0000-00000000000a/photo2.jpg',
    'image/png', 654321, 400, 400, 'Légende'
  );

delete from public.messages where id = (select message_id from t_img2);

select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_img2)),
  0::bigint,
  'Supprimer le message supprime sa pièce jointe en cascade'
);

select finish();
rollback;
