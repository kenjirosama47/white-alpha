-- Phase 4B : partage de vidéos déjà enregistrées dans les conversations
-- privées. Bibliothèque uniquement, aucune caméra, aucun micro, une seule
-- vidéo par message, 60 secondes / 50 Mo maximum, format MP4 uniquement.
--
-- Étend le modèle Phase 4A (message_type / media_type) avec la valeur
-- 'video', sans affaiblir aucune contrainte existante sur les photos.
--
-- Principe directeur inchangé : aucun INSERT direct sur messages ou
-- message_attachments (déjà révoqué en Phase 4A, non rétabli ici). La
-- création d'un message vidéo passe exclusivement par la nouvelle fonction
-- SECURITY DEFINER create_video_message.
--
-- Note sur l'atomicité (identique à la Phase 4A) : l'upload Storage (ici en
-- TUS reprenable, voir services/media.ts côté application) a lieu AVANT
-- l'appel à create_video_message et n'est PAS transactionnel avec l'écriture
-- en base. Seules les lignes messages/message_attachments sont atomiques
-- côté PostgreSQL, à l'intérieur de la fonction. Si l'appel échoue après un
-- upload réussi, le fichier Storage est supprimé en compensation côté
-- application (pas un rollback automatique).

-- ---------------------------------------------------------------------------
-- 1. Bucket chat-media (Phase 4A) : accepte désormais aussi video/mp4, avec
--    une limite de taille relevée au maximum vidéo (50 Mo). Les images
--    restent plafonnées à 10 Mo par la contrainte size_bytes de
--    message_attachments ci-dessous, inchangée : relever la limite du bucket
--    ne relâche donc aucune contrainte existante sur les photos.
-- ---------------------------------------------------------------------------
update storage.buckets
set
  file_size_limit = 52428800, -- 50 Mo
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'chat-media';

-- ---------------------------------------------------------------------------
-- 2. Modèle de type de message/pièce jointe : ajout de 'video'. La
--    contrainte de longueur de légende pour une vidéo suit exactement le
--    même schéma que pour une photo (légende facultative, ≤ 4000
--    caractères) : aucune règle nouvelle, juste une nouvelle branche.
-- ---------------------------------------------------------------------------
alter table public.messages drop constraint messages_type_check;
alter table public.messages add constraint messages_type_check
  check (message_type in ('text', 'image', 'video'));

alter table public.messages drop constraint messages_content_length;
alter table public.messages add constraint messages_content_length check (
  (message_type = 'text' and char_length(trim(content)) between 1 and 4000)
  or (message_type = 'image' and char_length(content) <= 4000)
  or (message_type = 'video' and char_length(content) <= 4000)
);

-- ---------------------------------------------------------------------------
-- 3. message_attachments : media_type accepte 'video', nouvelles colonnes
--    pour les métadonnées vidéo, contraintes mime_type/size_bytes rendues
--    conditionnelles au media_type (les bornes photo existantes ne changent
--    pas : 10 Mo, jpeg/png/webp).
-- ---------------------------------------------------------------------------
alter table public.message_attachments
  add column duration_ms integer;

alter table public.message_attachments
  add constraint message_attachments_duration_ms_check check (
    (media_type = 'video' and duration_ms is not null and duration_ms between 1 and 60000)
    or (media_type = 'image' and duration_ms is null)
  );

alter table public.message_attachments drop constraint message_attachments_media_type_check;
alter table public.message_attachments add constraint message_attachments_media_type_check
  check (media_type in ('image', 'video'));

alter table public.message_attachments drop constraint message_attachments_mime_type_check;
alter table public.message_attachments add constraint message_attachments_mime_type_check check (
  (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
  or (media_type = 'video' and mime_type = 'video/mp4')
);

alter table public.message_attachments drop constraint message_attachments_size_bytes_check;
alter table public.message_attachments add constraint message_attachments_size_bytes_check check (
  (media_type = 'image' and size_bytes > 0 and size_bytes <= 10485760)
  or (media_type = 'video' and size_bytes > 0 and size_bytes <= 52428800)
);

comment on table public.message_attachments is
  'Pièce jointe (photo ou vidéo) attachée à un message. media_type ''image'' '
  '(Phase 4A) ou ''video'' (Phase 4B). Insertion réservée aux fonctions '
  'create_image_message / create_video_message (pas de policy INSERT).';

comment on column public.message_attachments.duration_ms is
  'Durée en millisecondes, obligatoire pour une pièce jointe vidéo '
  '(1 à 60000), toujours NULL pour une photo.';

-- Aucun changement de policy RLS ni de GRANT nécessaire ici : les policies
-- SELECT/DELETE de la Phase 4A sur message_attachments ne distinguent pas le
-- media_type (accès par appartenance à la conversation / par uploader_id),
-- donc s'appliquent déjà correctement aux vidéos. Toujours aucun GRANT
-- INSERT/UPDATE pour authenticated.

-- ---------------------------------------------------------------------------
-- 4. Création d'un message vidéo + sa pièce jointe. Le fichier doit déjà
--    avoir été uploadé vers Storage sous p_storage_path avant cet appel
--    (voir note d'atomicité en tête de fichier).
-- ---------------------------------------------------------------------------
create function public.create_video_message(
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

  if p_mime_type is null or p_mime_type <> 'video/mp4' then
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
  'transactionnelles côté Postgres : l''upload Storage (TUS reprenable) a '
  'lieu avant cet appel et n''en fait pas partie. sender_id/uploader_id '
  'viennent exclusivement de auth.uid(), jamais des paramètres. Réservée à '
  'authenticated.';

revoke execute on function public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text) from public;
revoke execute on function public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text) from anon;
grant execute on function public.create_video_message(uuid, text, text, bigint, integer, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Policies storage.objects (Phase 4A) : aucun changement nécessaire.
--    "Un participant peut uploader dans sa conversation" / "... lire les
--    fichiers ..." / "Un uploader peut supprimer son propre fichier" ne
--    filtrent que sur bucket_id, la structure du chemin
--    (conversation_id/uploader_id/...) et l'appartenance à la conversation —
--    jamais sur l'extension ou le type MIME du fichier. Elles autorisent
--    donc déjà les .mp4 sans modification. Seuls les formats/tailles
--    acceptés par le bucket (section 1) et par create_video_message
--    changent. Toujours aucune policy anon, aucune policy UPDATE, aucun
--    usage de service_role côté application.
