-- Tests de sécurité pour la Phase 5.S4 (audit défensif complet RLS/RPC/
-- Storage/autorisations). Complète les suites existantes (Phase 3, 4A, 4B,
-- 5.1, 5.4, 5.S3) sans les dupliquer : couvre uniquement les vulnérabilités
-- corrigées par cet audit (immutabilité de message_type, suppression
-- autonome de pièce jointe) et les lacunes de couverture identifiées
-- (UUID cible inexistant pour get_or_create_direct_conversation, audit
-- exhaustif des GRANT anon/authenticated sur toutes les tables/fonctions
-- exposées).
-- À exécuter en local uniquement : `supabase test db` (nécessite Docker).
-- Ne jamais exécuter contre le projet distant.

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures : 2 utilisateurs de test (A, B).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('71000000-0000-0000-0000-000000000071', 'phase5s4-user-a@test.local', 'x', now(), '{"username":"phase5s4_user_a"}'),
  ('72000000-0000-0000-0000-000000000072', 'phase5s4-user-b@test.local', 'x', now(), '{"username":"phase5s4_user_b"}');

set local role authenticated;
set local "request.jwt.claim.sub" = '71000000-0000-0000-0000-000000000071';
set local "request.jwt.claims" = '{"sub":"71000000-0000-0000-0000-000000000071","role":"authenticated"}';

create temporary table t_conv as
  select public.get_or_create_direct_conversation('72000000-0000-0000-0000-000000000072') as id;

-- ---------------------------------------------------------------------------
-- 1. message_type immuable après création (vulnérabilité corrigée).
-- ---------------------------------------------------------------------------
create temporary table t_msg as
  select * from public.create_text_message((select id from t_conv), 'Message de test Phase 5.S4');

-- 1. Une tentative de changer message_type d'un message texte existant est refusée.
select throws_ok(
  $$ update public.messages set message_type = 'image'
     where id = (select message_id from t_msg) $$,
  'Impossible de modifier le type d''un message.',
  'message_type ne peut pas être modifié après création (vulnérabilité corrigée, Phase 5.S4)'
);

-- 2. Le message reste bien de type 'text' après le refus.
select is(
  (select message_type from public.messages where id = (select message_id from t_msg)),
  'text',
  'Le message reste de type ''text'' après la tentative de changement refusée'
);

-- 3. content peut toujours être lu normalement (le trigger ne bloque que message_type).
select is(
  (select content from public.messages where id = (select message_id from t_msg)),
  'Message de test Phase 5.S4',
  'Le contenu du message est inchangé'
);

-- ---------------------------------------------------------------------------
-- 4-6. Suppression autonome d'une pièce jointe bloquée (vulnérabilité
--      corrigée) ; seule la suppression du message parent reste possible.
-- ---------------------------------------------------------------------------
create temporary table t_img as
  select * from public.create_image_message(
    (select id from t_conv),
    (select id from t_conv)::text || '/71000000-0000-0000-0000-000000000071/photo.jpg',
    'image/png', 12345, 100, 100, ''
  );

-- 4. La suppression isolée de la pièce jointe (message parent toujours existant) est refusée.
select throws_ok(
  $$ delete from public.message_attachments
     where message_id = (select message_id from t_img) $$,
  'Une pièce jointe ne peut être supprimée qu''en supprimant le message correspondant.',
  'La suppression autonome d''une pièce jointe est refusée tant que le message existe (vulnérabilité corrigée, Phase 5.S4)'
);

-- 5. La pièce jointe existe toujours après le refus.
select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_img)),
  1::bigint,
  'La pièce jointe existe toujours après la tentative de suppression isolée refusée'
);

-- 6. Supprimer le message parent (delete_own_message, chemin réellement utilisé par l'application) fonctionne toujours normalement.
select lives_ok(
  $$ select public.delete_own_message((select message_id from t_img)) $$,
  'delete_own_message (chemin applicatif réel) continue de fonctionner normalement après les correctifs Phase 5.S4'
);

-- 7. La pièce jointe a bien été supprimée en cascade par la suppression du message.
select is(
  (select count(*) from public.message_attachments where message_id = (select message_id from t_img)),
  0::bigint,
  'La pièce jointe est supprimée en cascade par delete_own_message'
);

-- ---------------------------------------------------------------------------
-- 8. Couverture manquante identifiée : get_or_create_direct_conversation
--    avec un UUID cible inexistant.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.get_or_create_direct_conversation('79999999-0000-0000-0000-000000000099') $$,
  'Utilisateur introuvable.',
  'get_or_create_direct_conversation refuse un UUID cible inexistant'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- ---------------------------------------------------------------------------
-- 9-14. Audit exhaustif des GRANT de table : anon ne doit avoir aucun
--       privilège sur aucune des tables exposées de l'application.
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public' and grantee = 'anon'
      and table_name in ('profiles', 'conversations', 'messages', 'message_attachments')
  ),
  'anon n''a aucun privilège de table sur profiles/conversations/messages/message_attachments'
);

-- 10. authenticated n'a pas de privilège INSERT sur conversations (création exclusivement via RPC).
select ok(
  not has_table_privilege('authenticated', 'public.conversations', 'INSERT'),
  'authenticated n''a pas INSERT sur conversations (création exclusivement via get_or_create_direct_conversation)'
);

-- 11. authenticated n'a pas de privilège INSERT sur messages (création exclusivement via RPC).
select ok(
  not has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'authenticated n''a pas INSERT sur messages (création exclusivement via create_text_message/create_image_message/create_video_message)'
);

-- 12. authenticated n'a pas de privilège INSERT ni UPDATE sur message_attachments (création exclusivement via RPC).
select ok(
  not has_table_privilege('authenticated', 'public.message_attachments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.message_attachments', 'UPDATE'),
  'authenticated n''a ni INSERT ni UPDATE sur message_attachments'
);

-- 13. authenticated n'a pas de privilège UPDATE/DELETE sur conversations (aucune modification possible après création).
select ok(
  not has_table_privilege('authenticated', 'public.conversations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.conversations', 'DELETE'),
  'authenticated n''a ni UPDATE ni DELETE sur conversations'
);

-- 14. RLS est activée (pas seulement des policies définies sans RLS active) sur les 4 tables exposées.
select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('profiles', 'conversations', 'messages', 'message_attachments')
  ),
  'RLS est activée (relrowsecurity=true) sur profiles/conversations/messages/message_attachments'
);

-- ---------------------------------------------------------------------------
-- 15-18. Audit exhaustif EXECUTE : anon ne doit avoir EXECUTE sur aucune
--        fonction RPC applicative (fonctions trigger internes exclues, non
--        invocables directement — voir vérification empirique séparée).
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'search_public_profiles', 'get_or_create_direct_conversation', 'list_my_conversations',
        'create_text_message', 'create_image_message', 'create_video_message', 'delete_own_message',
        'update_my_profile', 'owner_get_platform_stats', 'is_owner', 'current_aal', 'is_owner_aal2'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon n''a EXECUTE sur aucune fonction RPC applicative (12 fonctions vérifiées)'
);

-- 16. Une fonction trigger interne (ex. profiles_prevent_role_change) ne peut pas être appelée directement, même avec EXECUTE technique.
select throws_ok(
  $$ select public.profiles_prevent_role_change() $$,
  '0A000',
  null,
  'Une fonction trigger ne peut pas être invoquée directement hors contexte de trigger (Postgres, garantie moteur)'
);

-- 17. is_owner/current_aal/is_owner_aal2 restent strictement internes (aucun GRANT EXECUTE, y compris authenticated).
select ok(
  not has_function_privilege('authenticated', 'public.is_owner()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.current_aal()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_owner_aal2()', 'EXECUTE'),
  'is_owner/current_aal/is_owner_aal2 restent sans GRANT EXECUTE authenticated (non-régression Phase 5.S3)'
);

-- ---------------------------------------------------------------------------
-- 18-20. Non-régression : la messagerie normale continue de fonctionner
--        après tous les correctifs de cette phase.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '71000000-0000-0000-0000-000000000071';
set local "request.jwt.claims" = '{"sub":"71000000-0000-0000-0000-000000000071","role":"authenticated"}';

-- 18. A peut toujours envoyer un message texte normalement.
select lives_ok(
  $$ select public.create_text_message((select id from t_conv), 'Non-régression Phase 5.S4') $$,
  'create_text_message fonctionne toujours normalement après les correctifs Phase 5.S4'
);

-- 19. A peut toujours envoyer un message photo normalement.
select lives_ok(
  $$ select public.create_image_message(
       (select id from t_conv),
       (select id from t_conv)::text || '/71000000-0000-0000-0000-000000000071/photo2.jpg',
       'image/jpeg', 54321, 200, 200, 'Légende'
     ) $$,
  'create_image_message fonctionne toujours normalement après les correctifs Phase 5.S4'
);

reset role;
reset "request.jwt.claim.sub";
reset "request.jwt.claims";

-- 20. B peut toujours lister ses conversations normalement.
set local role authenticated;
set local "request.jwt.claim.sub" = '72000000-0000-0000-0000-000000000072';
set local "request.jwt.claims" = '{"sub":"72000000-0000-0000-0000-000000000072","role":"authenticated"}';

select lives_ok(
  $$ select public.list_my_conversations() $$,
  'list_my_conversations fonctionne toujours normalement après les correctifs Phase 5.S4'
);

reset role;

select finish();
rollback;
