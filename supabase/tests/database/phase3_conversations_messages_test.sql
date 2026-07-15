-- Tests de sécurité RLS/RPC pour la Phase 3 (conversations privées + messages).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test (A, B, C non membre de la conversation).
-- Les profils sont créés automatiquement par le trigger on_auth_user_created
-- (Phase 2) via raw_user_meta_data->>'username'.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('a0000000-0000-0000-0000-00000000000a', 'phase3-user-a@test.local', 'x', now(), '{"username":"phase3_user_a"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'phase3-user-b@test.local', 'x', now(), '{"username":"phase3_user_b"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'phase3-user-c@test.local', 'x', now(), '{"username":"phase3_user_c"}');

set local role authenticated;
set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 1. Conversation avec soi-même refusée.
select throws_ok(
  $$ select get_or_create_direct_conversation('a0000000-0000-0000-0000-00000000000a') $$,
  'Impossible de créer une conversation avec soi-même.',
  'Une conversation avec soi-même est refusée'
);

-- 2. A crée une conversation avec B.
select ok(
  (select public.get_or_create_direct_conversation('b0000000-0000-0000-0000-00000000000b')) is not null,
  'A peut créer une conversation avec B'
);

create temporary table t_conv as
  select public.get_or_create_direct_conversation('b0000000-0000-0000-0000-00000000000b') as id;

-- 3. Deux appels identiques réutilisent la même conversation (pas de doublon).
select is(
  (select public.get_or_create_direct_conversation('b0000000-0000-0000-0000-00000000000b')),
  (select id from t_conv),
  'Deux appels identiques réutilisent la même conversation'
);

-- 4. A voit la conversation.
select ok(
  exists (select 1 from public.conversations where id = (select id from t_conv)),
  'A voit sa conversation avec B'
);

-- 5. B voit la même conversation.
set local "request.jwt.claim.sub" = 'b0000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select ok(
  exists (select 1 from public.conversations where id = (select id from t_conv)),
  'B voit la conversation avec A'
);

-- 6. C (non membre) ne voit pas la conversation.
set local "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-00000000000c';
set local "request.jwt.claims" = '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is(
  (select count(*) from public.conversations where id = (select id from t_conv)),
  0::bigint,
  'C ne voit pas une conversation dont il n''est pas membre'
);

-- 7. A peut envoyer un message dans sa conversation.
--    Depuis la Phase 4A, l'INSERT direct sur messages est révoqué pour
--    authenticated : la création passe exclusivement par la RPC
--    create_text_message (voir migration 20260715140000).
set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ select public.create_text_message((select id from t_conv), 'Salut B !') $$,
  'A peut envoyer un message dans sa conversation'
);

-- 8. B peut envoyer un message dans sa conversation.
set local "request.jwt.claim.sub" = 'b0000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$ select public.create_text_message((select id from t_conv), 'Salut A !') $$,
  'B peut envoyer un message dans sa conversation'
);

-- 9. C ne peut pas envoyer de message dans une conversation dont il n'est pas membre.
set local "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-00000000000c';
set local "request.jwt.claims" = '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ select public.create_text_message((select id from t_conv), 'Je ne devrais pas pouvoir') $$,
  'Conversation introuvable.',
  'C ne peut pas envoyer de message dans une conversation dont il n''est pas membre'
);

-- 10. A ne peut pas modifier un message de B (RLS filtre silencieusement la ligne).
set local "request.jwt.claim.sub" = 'b0000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

create temporary table t_msg_b as
  select id, content from public.messages
  where conversation_id = (select id from t_conv)
    and sender_id = 'b0000000-0000-0000-0000-00000000000b'
  limit 1;

set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.messages set content = 'contenu piraté par A' where id = (select id from t_msg_b);

set local "request.jwt.claim.sub" = 'b0000000-0000-0000-0000-00000000000b';
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select content from public.messages where id = (select id from t_msg_b)),
  (select content from t_msg_b),
  'A ne peut pas modifier un message de B (contenu inchangé)'
);

-- 11. La recherche refuse moins de 2 caractères.
set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ select * from public.search_public_profiles('a') $$,
  'La recherche doit contenir au moins 2 caractères.',
  'La recherche refuse une requête de moins de 2 caractères'
);

-- 12. La recherche trouve B par son username.
select ok(
  exists (
    select 1 from public.search_public_profiles('phase3_user_b')
    where username = 'phase3_user_b'
  ),
  'La recherche trouve B par son username'
);

-- 13. La recherche exclut l'utilisateur courant de ses propres résultats.
select ok(
  not exists (
    select 1 from public.search_public_profiles('phase3_user_a')
    where id = 'a0000000-0000-0000-0000-00000000000a'
  ),
  'La recherche exclut l''utilisateur courant de ses propres résultats'
);

-- 14. Aucun email n'est retourné par la recherche (colonne absente de la
--     signature de la fonction : accéder à .email lève une erreur Postgres).
select throws_ok(
  $$ select (public.search_public_profiles('phase3_user_b')).email $$,
  '42703',
  null,
  'La recherche ne peut structurellement pas retourner de colonne email'
);

select finish();
rollback;
