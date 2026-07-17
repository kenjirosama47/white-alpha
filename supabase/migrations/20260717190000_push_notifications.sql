-- Phase 6 : notifications push privées, sécurisées et multi-appareils.
--
-- Principe directeur (identique aux phases précédentes) : aucune écriture
-- client directe sur une table sensible. Toute mutation passe par une
-- fonction SECURITY DEFINER avec ses propres vérifications explicites et un
-- search_path fixé. RLS reste la garantie de dernier recours, jamais le
-- seul mécanisme de protection.

-- ---------------------------------------------------------------------------
-- 1. Appareils push (un token par appareil, plusieurs appareils par
--    utilisateur). Le token n'est jamais journalisé en clair côté client
--    (voir src/lib/push-notifications.ts) ni côté Edge Function.
-- ---------------------------------------------------------------------------
create table public.user_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_devices_token_unique unique (expo_push_token)
);

comment on table public.user_push_devices is
  'Un appareil = un token Expo Push. Un même utilisateur peut avoir plusieurs '
  'appareils actifs. Toute écriture passe exclusivement par register_push_device '
  'et deactivate_push_device (voir plus bas) : aucune policy RLS INSERT/UPDATE, '
  'car la réattribution d''un token réutilisé par un autre compte sur le même '
  'appareil (ex. déconnexion puis connexion d''un autre utilisateur) ne peut '
  'pas s''exprimer proprement avec une simple policy "user_id = auth.uid()".';

create index user_push_devices_user_id_idx on public.user_push_devices (user_id);
create index user_push_devices_user_enabled_idx
  on public.user_push_devices (user_id) where enabled;

alter table public.user_push_devices enable row level security;

create policy "Un utilisateur peut voir ses propres appareils"
  on public.user_push_devices
  for select
  to authenticated
  using (user_id = auth.uid());

-- RLS ne filtre que les lignes : le privilège SQL de base doit être accordé
-- explicitement. Seul SELECT est accordé : aucun INSERT/UPDATE/DELETE direct
-- pour authenticated, tout passe par les fonctions SECURITY DEFINER.
grant select on public.user_push_devices to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Préférences de notification, une ligne par utilisateur. Aucune policy,
--    aucun grant : lecture et écriture exclusivement via
--    get_my_notification_preferences / update_my_notification_preferences,
--    qui garantissent qu'une ligne existe toujours (upsert paresseux) sans
--    dépendre d'un trigger d'inscription séparé (fonctionne aussi pour les
--    comptes existants créés avant cette migration).
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notifications_enabled boolean not null default true,
  lock_screen_preview boolean not null default false,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Préférences de notification par utilisateur. lock_screen_preview désactivé '
  'par défaut : le contenu affiché est de toute façon déjà générique par '
  'conception (voir notify-new-message), cette préférence contrôle la '
  'visibilité du canal Android côté client. Aucun accès table direct : '
  'RPC uniquement.';

alter table public.notification_preferences enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Journal de déduplication (message_id + appareil). Table interne à
--    l'Edge Function uniquement (accès exclusif via service_role, qui
--    contourne RLS) : aucune policy, aucun grant, aucun accès client même en
--    lecture.
-- ---------------------------------------------------------------------------
create table public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  device_id uuid not null references public.user_push_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint push_notification_log_dedup unique (message_id, device_id)
);

comment on table public.push_notification_log is
  'Empêche l''envoi de plusieurs notifications pour le même message vers le '
  'même appareil (retry de l''Edge Function, doublon de trigger, etc.) : '
  'insertion avant envoi, ON CONFLICT DO NOTHING sert de verrou de '
  'déduplication.';

alter table public.push_notification_log enable row level security;

-- ---------------------------------------------------------------------------
-- 4. register_push_device — enregistre ou réattribue un token à
--    l'utilisateur courant. Idempotent : rejouable sans créer de doublon
--    (contrainte unique sur le token), sûr même si le même token appartenait
--    précédemment à un autre compte sur le même appareil physique.
-- ---------------------------------------------------------------------------
create function public.register_push_device(
  p_expo_push_token text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns table (id uuid, enabled boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_token text;
  normalized_platform text;
  result_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  normalized_token := trim(coalesce(p_expo_push_token, ''));
  if length(normalized_token) < 10 then
    raise exception 'Token push invalide.';
  end if;

  normalized_platform := lower(trim(coalesce(p_platform, '')));
  if normalized_platform not in ('android', 'ios') then
    raise exception 'Plateforme invalide.';
  end if;

  insert into public.user_push_devices (
    user_id, expo_push_token, platform, device_name, app_version,
    enabled, last_seen_at, updated_at
  )
  values (
    current_user_id, normalized_token, normalized_platform,
    nullif(trim(coalesce(p_device_name, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    true, now(), now()
  )
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        enabled = true,
        last_seen_at = now(),
        updated_at = now()
  returning public.user_push_devices.id into result_id;

  return query
    select d.id, d.enabled from public.user_push_devices d where d.id = result_id;
end;
$$;

comment on function public.register_push_device(text, text, text, text) is
  'Enregistre le token push de l''appareil courant pour auth.uid(), en le '
  'réattribuant si nécessaire (même token, compte différent). Jamais '
  'appelable pour un autre utilisateur : user_id est toujours auth.uid(), '
  'jamais un paramètre.';

revoke execute on function public.register_push_device(text, text, text, text) from public;
revoke execute on function public.register_push_device(text, text, text, text) from anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. deactivate_push_device — désactive uniquement le token de l'appareil
--    courant pour auth.uid() (utilisé à la déconnexion). Idempotent : aucune
--    erreur si le token n'existe plus ou appartient déjà à un autre compte
--    (WHERE ne matche simplement rien).
-- ---------------------------------------------------------------------------
create function public.deactivate_push_device(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  update public.user_push_devices
  set enabled = false, updated_at = now()
  where expo_push_token = trim(coalesce(p_expo_push_token, ''))
    and user_id = current_user_id;
end;
$$;

comment on function public.deactivate_push_device(text) is
  'Désactive (sans supprimer) le token indiqué, uniquement s''il appartient '
  'à auth.uid(). Ne touche jamais les autres appareils du même utilisateur.';

revoke execute on function public.deactivate_push_device(text) from public;
revoke execute on function public.deactivate_push_device(text) from anon;
grant execute on function public.deactivate_push_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Préférences : lecture (upsert paresseux) et écriture, toujours limitées
--    à auth.uid().
-- ---------------------------------------------------------------------------
create function public.get_my_notification_preferences()
returns table (
  notifications_enabled boolean,
  lock_screen_preview boolean,
  sound_enabled boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  insert into public.notification_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  return query
    select p.notifications_enabled, p.lock_screen_preview, p.sound_enabled
    from public.notification_preferences p
    where p.user_id = current_user_id;
end;
$$;

comment on function public.get_my_notification_preferences() is
  'Retourne les préférences de notification de auth.uid(), en créant une '
  'ligne par défaut si elle n''existe pas encore (compte créé avant cette '
  'migration, ou premier appel).';

revoke execute on function public.get_my_notification_preferences() from public;
revoke execute on function public.get_my_notification_preferences() from anon;
grant execute on function public.get_my_notification_preferences() to authenticated;

create function public.update_my_notification_preferences(
  p_notifications_enabled boolean,
  p_lock_screen_preview boolean,
  p_sound_enabled boolean
)
returns table (
  notifications_enabled boolean,
  lock_screen_preview boolean,
  sound_enabled boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  insert into public.notification_preferences (
    user_id, notifications_enabled, lock_screen_preview, sound_enabled, updated_at
  )
  values (
    current_user_id,
    coalesce(p_notifications_enabled, true),
    coalesce(p_lock_screen_preview, false),
    coalesce(p_sound_enabled, true),
    now()
  )
  on conflict (user_id) do update
    set notifications_enabled = coalesce(p_notifications_enabled, public.notification_preferences.notifications_enabled),
        lock_screen_preview = coalesce(p_lock_screen_preview, public.notification_preferences.lock_screen_preview),
        sound_enabled = coalesce(p_sound_enabled, public.notification_preferences.sound_enabled),
        updated_at = now();

  return query
    select p.notifications_enabled, p.lock_screen_preview, p.sound_enabled
    from public.notification_preferences p
    where p.user_id = current_user_id;
end;
$$;

comment on function public.update_my_notification_preferences(boolean, boolean, boolean) is
  'Met à jour les préférences de notification de auth.uid() uniquement.';

revoke execute on function public.update_my_notification_preferences(boolean, boolean, boolean) from public;
revoke execute on function public.update_my_notification_preferences(boolean, boolean, boolean) from anon;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Nettoyage des appareils désactivés depuis longtemps (tokens invalides
--    ou appareils abandonnés). Aucun grant à authenticated/anon : réservée à
--    une exécution privilégiée future (ex. pg_cron ou tâche planifiée),
--    jamais appelable par le client.
-- ---------------------------------------------------------------------------
create function public.cleanup_stale_push_devices()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.user_push_devices
  where enabled = false
    and updated_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_stale_push_devices() is
  'Supprime les appareils désactivés depuis plus de 30 jours. Réservée à une '
  'exécution privilégiée (aucun EXECUTE accordé à authenticated/anon).';

revoke execute on function public.cleanup_stale_push_devices() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Déclenchement de l'envoi à la création d'un message. pg_net n'est
--    activé que s'il est disponible dans l'environnement courant : ce
--    déclencheur ne doit jamais faire échouer un INSERT sur messages, que
--    pg_net soit absent (ex. environnement local sans cette extension), ou
--    que les secrets Vault de l'Edge Function ne soient pas encore
--    configurés (Edge Function pas encore déployée à ce stade de la phase).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
end;
$$;

create function public.notify_new_message_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  function_url text;
  shared_secret text;
begin
  if to_regproc('net.http_post') is null then
    return new;
  end if;

  begin
    select decrypted_secret into function_url
      from vault.decrypted_secrets where name = 'notify_new_message_url';
    select decrypted_secret into shared_secret
      from vault.decrypted_secrets where name = 'notify_new_message_shared_secret';
  exception when others then
    return new;
  end;

  if function_url is null or shared_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    body := jsonb_build_object(
      'message_id', new.id,
      'conversation_id', new.conversation_id,
      'sender_id', new.sender_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', shared_secret
    )
  );

  return new;
end;
$$;

comment on function public.notify_new_message_trigger() is
  'Déclenche un appel HTTP asynchrone (pg_net) vers l''Edge Function '
  'notify-new-message à chaque nouveau message. No-op silencieux si pg_net '
  'ou les secrets Vault requis (notify_new_message_url, '
  'notify_new_message_shared_secret) ne sont pas configurés : la messagerie '
  'continue de fonctionner normalement dans tous les cas.';

create trigger notify_new_message_after_insert
  after insert on public.messages
  for each row
  execute function public.notify_new_message_trigger();

-- ---------------------------------------------------------------------------
-- 9. Ouverture sécurisée d'une conversation depuis une notification : ne
--    renvoie une ligne que si auth.uid() est toujours participant de la
--    conversation demandée. Zéro ligne (conversation inexistante, accès
--    perdu) signifie explicitement "reviens à l'écran Conversations" côté
--    client — jamais une erreur qui laisserait deviner l'existence d'une
--    conversation à laquelle l'appelant n'a pas/plus accès.
-- ---------------------------------------------------------------------------
create function public.get_conversation_for_notification(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  return query
    select
      c.id,
      p.id,
      p.username,
      p.display_name,
      p.avatar_url
    from public.conversations c
    join public.profiles p
      on p.id = case when c.user_a = current_user_id then c.user_b else c.user_a end
    where c.id = p_conversation_id
      and (c.user_a = current_user_id or c.user_b = current_user_id);
end;
$$;

comment on function public.get_conversation_for_notification(uuid) is
  'Revalide l''appartenance de auth.uid() à une conversation avant de la '
  'rouvrir depuis une notification. Zéro ligne = accès refusé ou '
  'conversation inexistante, jamais une erreur distinctive.';

revoke execute on function public.get_conversation_for_notification(uuid) from public;
revoke execute on function public.get_conversation_for_notification(uuid) from anon;
grant execute on function public.get_conversation_for_notification(uuid) to authenticated;
