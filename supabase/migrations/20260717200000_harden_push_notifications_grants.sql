-- Phase 6 (durcissement) : les tables introduites par
-- 20260717190000_push_notifications.sql n'ont jamais explicitement révoqué
-- les privilèges larges accordés par défaut par Supabase Cloud à anon et
-- authenticated sur toute nouvelle table du schéma public — contrairement à
-- toutes les migrations précédentes de ce projet (voir
-- harden_conversations_messages_grants, Phase 3 ; profile_settings,
-- Phase 5.1), qui suivent systématiquement ce principe : "RLS reste la
-- garantie de dernier recours, jamais le seul mécanisme de protection."
--
-- Vérifié avant ce correctif (projet distant) : RLS bloquait déjà
-- effectivement tout accès anon (lectures vides, écritures refusées avec
-- "row-level security policy"), donc aucune fuite réelle n'a eu lieu. Ce
-- correctif aligne simplement les GRANT explicites sur le principe de
-- moindre privilège déjà appliqué partout ailleurs dans ce projet, en
-- défense en profondeur — pas en réaction à une exploitation constatée.
revoke all on public.user_push_devices from anon;
revoke all on public.user_push_devices from authenticated;
grant select on public.user_push_devices to authenticated;

revoke all on public.notification_preferences from anon;
revoke all on public.notification_preferences from authenticated;
-- Aucun grant de table pour authenticated : accès exclusivement via
-- get_my_notification_preferences / update_my_notification_preferences
-- (SECURITY DEFINER), conformément à la conception d'origine.

revoke all on public.push_notification_log from anon;
revoke all on public.push_notification_log from authenticated;
-- Aucun grant de table pour quiconque : table interne à l'Edge Function
-- (service_role uniquement, qui contourne RLS), conformément à la
-- conception d'origine.
