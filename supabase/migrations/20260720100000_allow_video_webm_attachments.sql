-- Phase 8.5.2 : autoriser video/webm en plus de video/mp4 pour les pièces
-- jointes vidéo, en préparation de l'upload Web (Phase 8.5.1 valide déjà
-- video/webm côté application — cette migration aligne la contrainte de
-- table et la configuration du bucket sur cette même liste blanche).
--
-- Périmètre strictement minimal : seules la contrainte
-- `message_attachments_mime_type_check` et la configuration du bucket
-- `chat-media` sont modifiées. Aucune autre table, aucune RPC, aucune policy
-- RLS/Storage n'est touchée — toutes les vérifications de taille (10 Mo
-- image / 50 Mo vidéo), de durée, de chemin, d'authentification et
-- d'appartenance à la conversation restent exactement celles des Phases
-- 4A/4B, inchangées.
--
-- Idempotence : `DROP CONSTRAINT IF EXISTS` avant `ADD CONSTRAINT` permet une
-- réexécution sans erreur si cette migration a déjà été appliquée
-- partiellement (aucune syntaxe portable n'existe pour un `ADD CONSTRAINT
-- IF NOT EXISTS` sur les versions de Postgres supportées ici). Le `UPDATE
-- storage.buckets` est naturellement idempotent (réappliquer la même valeur
-- de tableau n'a aucun effet supplémentaire).

alter table public.message_attachments
  drop constraint if exists message_attachments_mime_type_check;

alter table public.message_attachments
  add constraint message_attachments_mime_type_check check (
    (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
    or (media_type = 'video' and mime_type in ('video/mp4', 'video/webm'))
  );

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'chat-media';

comment on constraint message_attachments_mime_type_check on public.message_attachments is
  'Phase 4A (image/jpeg,png,webp) + Phase 4B (video/mp4) + Phase 8.5.2 '
  '(video/webm) — toute pièce jointe doit correspondre à l''une de ces '
  'combinaisons media_type/mime_type exactes.';

-- -----------------------------------------------------------------------------
-- create_video_message (Phase 4B, migration 20260715150000) porte SA PROPRE
-- vérification de type MIME, codée en dur et totalement indépendante de la
-- contrainte de table et de la configuration du bucket ci-dessus : sans ce
-- second correctif, un appel avec p_mime_type = 'video/webm' échoue toujours
-- avec « Type de fichier non autorisé. » avant même d'atteindre l'INSERT,
-- quelle que soit la contrainte/bucket déjà élargie (confirmé par le test
-- pgTAP de cette même migration). CREATE OR REPLACE FUNCTION avec la même
-- signature exacte (aucun GRANT/REVOKE à refaire) : SEULE la ligne de
-- vérification du type MIME change, le corps est identique par ailleurs à
-- la version Phase 4B (auth, appartenance à la conversation, taille, durée,
-- préfixe de chemin, longueur de légende, insertions message + pièce
-- jointe).
-- -----------------------------------------------------------------------------
create or replace function public.create_video_message(
  p_conversation_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_ms integer,
  p_width integer default null,
  p_height integer default null,
  p_content text default ''
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  attachment_id uuid,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  duration_ms integer,
  width integer,
  height integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_message_id uuid;
  new_attachment_id uuid;
  expected_prefix text;
  normalized_content text;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if p_conversation_id is null then
    raise exception 'Conversation manquante.';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.user_a = current_user_id or c.user_b = current_user_id)
  ) then
    raise exception 'Conversation introuvable.';
  end if;

  -- Seule ligne modifiée par rapport à la Phase 4B : video/webm accepté en
  -- plus de video/mp4 (voir la note ci-dessus).
  if p_mime_type is null or p_mime_type not in ('video/mp4', 'video/webm') then
    raise exception 'Type de fichier non autorisé.';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then
    raise exception 'Fichier trop volumineux.';
  end if;

  if p_duration_ms is null or p_duration_ms <= 0 or p_duration_ms > 60000 then
    raise exception 'La vidéo ne doit pas dépasser 60 secondes.';
  end if;

  if p_storage_path is null or p_storage_path = '' then
    raise exception 'Chemin de fichier manquant.';
  end if;

  -- Même défense en profondeur que pour les photos : le chemin doit
  -- commencer par conversation_id/uploader_id/, en plus des policies
  -- Storage qui imposent déjà cette même structure à l'upload.
  expected_prefix := p_conversation_id::text || '/' || current_user_id::text || '/';
  if left(p_storage_path, length(expected_prefix)) <> expected_prefix then
    raise exception 'Chemin de fichier invalide.';
  end if;

  normalized_content := coalesce(trim(p_content), '');
  if length(normalized_content) > 4000 then
    raise exception 'Le message ne peut pas dépasser 4000 caractères.';
  end if;

  insert into public.messages (conversation_id, sender_id, message_type, content)
  values (p_conversation_id, current_user_id, 'video', normalized_content)
  returning id into new_message_id;

  insert into public.message_attachments (
    message_id, conversation_id, uploader_id, media_type,
    storage_path, mime_type, size_bytes, duration_ms, width, height
  )
  values (
    new_message_id, p_conversation_id, current_user_id, 'video',
    p_storage_path, p_mime_type, p_size_bytes, p_duration_ms, p_width, p_height
  )
  returning id into new_attachment_id;

  return query
    select m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
           a.id, a.storage_path, a.mime_type, a.size_bytes, a.duration_ms, a.width, a.height
    from public.messages m
    join public.message_attachments a on a.id = new_attachment_id
    where m.id = new_message_id;
end;
$$;

comment on function public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text) is
  'Crée un message vidéo et sa pièce jointe. Seules ces deux lignes sont '
  'transactionnelles côté Postgres : l''upload Storage a lieu avant cet '
  'appel et n''en fait pas partie. sender_id/uploader_id viennent '
  'exclusivement de auth.uid(), jamais des paramètres. Réservée à '
  'authenticated. Types acceptés : video/mp4 (Phase 4B) et video/webm '
  '(Phase 8.5.2).';

-- -----------------------------------------------------------------------------
-- Rollback documenté (à exécuter manuellement, jamais automatiquement, et
-- seulement après avoir confirmé qu'aucune pièce jointe video/webm n'a été
-- créée entre-temps — un rollback avec des lignes video/webm existantes
-- ferait échouer la contrainte restaurée) :
--
--   alter table public.message_attachments
--     drop constraint if exists message_attachments_mime_type_check;
--   alter table public.message_attachments
--     add constraint message_attachments_mime_type_check check (
--       (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
--       or (media_type = 'video' and mime_type = 'video/mp4')
--     );
--   update storage.buckets
--   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
--   where id = 'chat-media';
-- -----------------------------------------------------------------------------
