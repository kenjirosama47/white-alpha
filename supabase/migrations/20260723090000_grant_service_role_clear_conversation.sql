-- Correctif intégration (icône pinceau, Edge Function clear-conversation) :
-- audit local a révélé que service_role n'a jamais reçu de privilège
-- explicite sur conversations/messages/message_attachments dans ce projet
-- (seuls anon/authenticated ont des GRANT explicites par table, voir
-- migrations précédentes). BYPASSRLS ne dispense pas des privilèges SQL de
-- base : sans ce GRANT, toute requête service_role sur ces tables échoue
-- avec "permission denied", y compris en production (même historique de
-- migrations que ce dépôt).
--
-- Principe du moindre privilège : uniquement ce que clear-conversation
-- utilise réellement.
--   - conversations : SELECT seul (vérifier l'appartenance user_a/user_b).
--   - message_attachments : SELECT seul (lire les storage_path avant
--     suppression Storage) ; la suppression des lignes suit par ON DELETE
--     CASCADE depuis messages, jamais un DELETE direct ici.
--   - messages : SELECT + DELETE (compter puis effacer les messages de la
--     conversation).
-- Aucun INSERT/UPDATE accordé : service_role ne crée ni ne modifie jamais de
-- message. Aucune policy RLS modifiée (BYPASSRLS déjà en place pour ce
-- rôle) : ce correctif ne touche que les privilèges de table.

grant select on public.conversations to service_role;
grant select on public.message_attachments to service_role;
grant select, delete on public.messages to service_role;
