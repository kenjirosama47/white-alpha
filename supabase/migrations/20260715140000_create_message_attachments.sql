-- Phase 4A : envoi de photos dans les conversations privées. Aucune vidéo,
-- aucune caméra, aucun micro. Bucket Storage privé + table de pièces jointes
-- + RPC dédiées pour la création de messages (texte et image).
--
-- Principe directeur (identique à la Phase 3) : aucun accès élargi via RLS
-- directe pour l'écriture. Toute création de message passe désormais
-- exclusivement par une fonction SECURITY DEFINER (create_text_message ou
-- create_image_message), avec ses propres vérifications explicites et un
-- search_path fixé pour éviter tout détournement. L'INSERT direct sur
-- public.messages est révoqué pour authenticated (voir section 2) : un
-- client ne peut donc plus créer un message texte vide, un message image
-- sans pièce jointe, ni falsifier sender_id.
--
-- Note sur l'atomicité (upload photo) : l'upload du fichier vers le bucket
-- Storage `chat-media` a lieu AVANT l'appel à create_image_message et n'est
-- PAS transactionnel avec l'écriture en base — Storage et PostgreSQL sont
-- deux systèmes distincts, aucune transaction distribuée ne les lie. Seules
-- les deux lignes `messages` + `message_attachments` sont insérées de façon
-- atomique, côté PostgreSQL uniquement, dans create_image_message. Si cette
-- fonction échoue après un upload réussi, le fichier déjà présent dans
-- Storage doit être supprimé par l'appelant (compensation applicative côté
-- client, voir `useMediaUpload.send` dans l'application mobile), pas par un
-- rollback automatique.

-- ---------------------------------------------------------------------------
-- 1. Bucket Storage privé. Jamais public : les fichiers ne sont accessibles
--    que via URL signée temporaire, elle-même soumise aux policies
--    storage.objects définies plus bas.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  10485760, -- 10 Mo, cohérent avec la contrainte size_bytes ci-dessous
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Modèle explicite de type de message. Un message texte (Phase 3) exige
--    toujours un contenu non vide ; un message photo (Phase 4A) peut n'avoir
--    aucune légende. La contrainte de longueur devient conditionnelle au
--    type plutôt que simplement relâchée pour tous les messages.
--
--    L'INSERT direct sur messages est ensuite révoqué pour authenticated :
--    sans cette contrainte applicative dans une RPC, un client pourrait
--    encore insérer directement un message texte vide, un message image
--    sans pièce jointe associée, ou falsifier sender_id. Toute création
--    passe désormais exclusivement par create_text_message / create_image_message.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column message_type text not null default 'text';

alter table public.messages
  add constraint messages_type_check check (message_type in ('text', 'image'));

alter table public.messages drop constraint messages_content_length;
alter table public.messages add constraint messages_content_length check (
  (message_type = 'text' and char_length(trim(content)) between 1 and 4000)
  or (message_type = 'image' and char_length(content) <= 4000)
);

-- La policy Phase 3 devient inutile (plus aucun GRANT INSERT ne l'active),
-- mais on la supprime explicitement plutôt que de la laisser comme code mort
-- trompeur : la création de message ne passe plus jamais par un INSERT
-- direct côté client.
drop policy "Un participant peut envoyer un message dans ses conversations" on public.messages;
revoke insert on public.messages from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Table des pièces jointes, une ligne par photo envoyée dans un message.
-- ---------------------------------------------------------------------------
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  media_type text not null default 'image' check (media_type = 'image'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

comment on table public.message_attachments is
  'Pièce jointe (photo, Phase 4A) attachée à un message de type ''image''. '
  'media_type limité à ''image'' pour la Phase 4A ; la Phase 4B ajoutera '
  '''video''. Insertion réservée à la fonction create_image_message (pas de '
  'policy INSERT).';

create index message_attachments_message_id_idx on public.message_attachments (message_id);
create index message_attachments_conversation_id_idx on public.message_attachments (conversation_id);
create index message_attachments_uploader_id_idx on public.message_attachments (uploader_id);

alter table public.message_attachments enable row level security;

create policy "Un participant peut voir les pièces jointes"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = message_attachments.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Un expéditeur peut supprimer sa propre pièce jointe"
  on public.message_attachments
  for delete
  to authenticated
  using (uploader_id = auth.uid());

-- anon : aucun privilège de table. authenticated : uniquement SELECT/DELETE,
-- correspondant aux deux seules policies ci-dessus. Aucun GRANT INSERT ni
-- UPDATE pour authenticated : la création passe exclusivement par la
-- fonction SECURITY DEFINER create_image_message (qui, en tant que
-- SECURITY DEFINER, insère avec les privilèges du propriétaire de la
-- fonction, indépendamment des GRANT accordés à authenticated).
revoke all on public.message_attachments from anon;
revoke all on public.message_attachments from authenticated;
grant select, delete on public.message_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Création d'un message texte. Remplace l'INSERT direct désormais révoqué
--    (section 2) : sender_id vient exclusivement de auth.uid(), le contenu
--    est validé côté serveur (non vide, ≤ 4000 caractères) avant insertion.
-- ---------------------------------------------------------------------------
create function public.create_text_message(
  p_conversation_id uuid,
  p_content text
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  message_type text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_message_id uuid;
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

  normalized_content := trim(coalesce(p_content, ''));
  if length(normalized_content) < 1 then
    raise exception 'Le message ne peut pas être vide.';
  end if;
  if length(normalized_content) > 4000 then
    raise exception 'Le message ne peut pas dépasser 4000 caractères.';
  end if;

  insert into public.messages (conversation_id, sender_id, message_type, content)
  values (p_conversation_id, current_user_id, 'text', normalized_content)
  returning id into new_message_id;

  return query
    select m.id, m.conversation_id, m.sender_id, m.message_type, m.content, m.created_at
    from public.messages m
    where m.id = new_message_id;
end;
$$;

comment on function public.create_text_message(uuid, text) is
  'Crée un message texte. sender_id vient exclusivement de auth.uid(), '
  'jamais des paramètres. Remplace l''INSERT direct sur messages, révoqué '
  'pour authenticated. Réservée à authenticated.';

revoke execute on function public.create_text_message(uuid, text) from public;
revoke execute on function public.create_text_message(uuid, text) from anon;
grant execute on function public.create_text_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Création d'un message photo + sa pièce jointe. Le fichier doit déjà
--    avoir été uploadé vers Storage sous `p_storage_path` avant cet appel
--    (voir note sur l'atomicité en tête de fichier : l'upload Storage n'est
--    pas transactionnel avec cette fonction, seules les deux lignes
--    `messages`/`message_attachments` ci-dessous le sont).
-- ---------------------------------------------------------------------------
create function public.create_image_message(
  p_conversation_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
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

  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Type de fichier non autorisé.';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'Fichier trop volumineux.';
  end if;

  if p_storage_path is null or p_storage_path = '' then
    raise exception 'Chemin de fichier manquant.';
  end if;

  -- Le chemin doit être exactement conversation_id/uploader_id/... : empêche
  -- qu'une pièce jointe soit rattachée à un fichier uploadé par quelqu'un
  -- d'autre ou dans une autre conversation (défense en profondeur, en plus
  -- des policies Storage qui imposent déjà ce même chemin à l'upload).
  expected_prefix := p_conversation_id::text || '/' || current_user_id::text || '/';
  if left(p_storage_path, length(expected_prefix)) <> expected_prefix then
    raise exception 'Chemin de fichier invalide.';
  end if;

  normalized_content := coalesce(trim(p_content), '');
  if length(normalized_content) > 4000 then
    raise exception 'Le message ne peut pas dépasser 4000 caractères.';
  end if;

  -- message + pièce jointe : transaction Postgres atomique (les deux INSERT
  -- ci-dessous appartiennent à la même transaction que le reste de cette
  -- fonction). Ne couvre PAS l'upload Storage, déjà effectué par l'appelant
  -- avant cet appel (voir note d'atomicité en tête de fichier).
  insert into public.messages (conversation_id, sender_id, message_type, content)
  values (p_conversation_id, current_user_id, 'image', normalized_content)
  returning id into new_message_id;

  insert into public.message_attachments (
    message_id, conversation_id, uploader_id, media_type,
    storage_path, mime_type, size_bytes, width, height
  )
  values (
    new_message_id, p_conversation_id, current_user_id, 'image',
    p_storage_path, p_mime_type, p_size_bytes, p_width, p_height
  )
  returning id into new_attachment_id;

  return query
    select m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
           a.id, a.storage_path, a.mime_type, a.size_bytes, a.width, a.height
    from public.messages m
    join public.message_attachments a on a.id = new_attachment_id
    where m.id = new_message_id;
end;
$$;

comment on function public.create_image_message(uuid, text, text, bigint, integer, integer, text) is
  'Crée un message photo et sa pièce jointe. Seules ces deux lignes sont '
  'transactionnelles côté Postgres : l''upload Storage a lieu avant cet '
  'appel et n''en fait pas partie (voir note d''atomicité en tête de '
  'fichier). sender_id/uploader_id viennent exclusivement de auth.uid(), '
  'jamais des paramètres. Réservée à authenticated.';

revoke execute on function public.create_image_message(uuid, text, text, bigint, integer, integer, text) from public;
revoke execute on function public.create_image_message(uuid, text, text, bigint, integer, integer, text) from anon;
grant execute on function public.create_image_message(uuid, text, text, bigint, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Policies Storage sur storage.objects, propres au bucket chat-media.
--    Chemin obligatoire : conversation_id/uploader_id/uuid.extension.
--    storage.foldername(name) retourne les segments de dossier (tout sauf le
--    nom de fichier final), donc ['conversation_id', 'uploader_id'] pour un
--    chemin conforme.
-- ---------------------------------------------------------------------------
create policy "Un participant peut uploader dans sa conversation"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Un participant peut lire les fichiers de sa conversation"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and array_length(storage.foldername(name), 1) = 2
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Un uploader peut supprimer son propre fichier"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Aucune policy pour anon : zéro accès (ni lecture, ni écriture, ni
-- suppression, ni listing) sur le bucket chat-media. Aucune policy UPDATE :
-- les fichiers ne sont jamais réécrits, seulement créés puis supprimés.
