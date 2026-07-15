-- Tests de sécurité RLS/RPC pour list_my_conversations (Phase 3).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures : 3 utilisateurs de test (A, B, C non membre de la conversation
-- A/B). Les profils sont créés automatiquement par le trigger
-- on_auth_user_created (Phase 2).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('d0000000-0000-0000-0000-00000000000d', 'phase3-list-a@test.local', 'x', now(), '{"username":"phase3_list_a"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'phase3-list-b@test.local', 'x', now(), '{"username":"phase3_list_b"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'phase3-list-c@test.local', 'x', now(), '{"username":"phase3_list_c"}');

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-0000-0000-00000000000d';
set local "request.jwt.claims" = '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}';

-- 1. Appel non authentifié refusé.
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

select throws_ok(
  $$ select * from public.list_my_conversations() $$,
  'Authentification requise.',
  'list_my_conversations refuse un appel sans authentification'
);

set local "request.jwt.claim.sub" = 'd0000000-0000-0000-0000-00000000000d';
set local "request.jwt.claims" = '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}';

-- 2. A n'a encore aucune conversation.
select is(
  (select count(*) from public.list_my_conversations()),
  0::bigint,
  'A ne voit aucune conversation avant d''en créer une'
);

select public.get_or_create_direct_conversation('e0000000-0000-0000-0000-00000000000e');

insert into public.messages (conversation_id, sender_id, content)
values (
  (select c.id from public.conversations c
   where (c.user_a = 'd0000000-0000-0000-0000-00000000000d' or c.user_b = 'd0000000-0000-0000-0000-00000000000d')),
  'd0000000-0000-0000-0000-00000000000d',
  'Salut B, ça va ?'
);

-- 3. A voit exactement 1 conversation, avec B comme autre participant.
select is(
  (select other_username from public.list_my_conversations() limit 1),
  'phase3_list_b',
  'A voit B comme autre participant de la conversation'
);

-- 4. Le dernier message et sa date sont correctement renvoyés.
select is(
  (select last_message_content from public.list_my_conversations() limit 1),
  'Salut B, ça va ?',
  'Le dernier message renvoyé correspond au message envoyé'
);

select ok(
  (select last_message_created_at from public.list_my_conversations() limit 1) is not null,
  'La date du dernier message est renseignée'
);

-- 5. B voit la même conversation avec A comme autre participant.
set local "request.jwt.claim.sub" = 'e0000000-0000-0000-0000-00000000000e';
set local "request.jwt.claims" = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated"}';

select is(
  (select other_username from public.list_my_conversations() limit 1),
  'phase3_list_a',
  'B voit A comme autre participant de la conversation'
);

-- 6. C (non membre) ne voit aucune conversation.
set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-00000000000f';
set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-00000000000f","role":"authenticated"}';

select is(
  (select count(*) from public.list_my_conversations()),
  0::bigint,
  'C (non membre) ne voit aucune conversation'
);

-- 7. Aucun email n'est retourné (colonne absente de la signature : y accéder
--    lève une erreur Postgres, comme pour search_public_profiles).
set local "request.jwt.claim.sub" = 'd0000000-0000-0000-0000-00000000000d';
set local "request.jwt.claims" = '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select throws_ok(
  $$ select (public.list_my_conversations()).email $$,
  '42703',
  null,
  'list_my_conversations ne peut structurellement pas retourner de colonne email'
);

select finish();
rollback;
