-- Phase 5.4 : suppression sécurisée des messages (texte, photo, vidéo) et de
-- leurs médias associés dans chat-media, sans fichier orphelin.
--
-- Principe directeur inchangé : la suppression d'un message ne dépend pas
-- uniquement des policies RLS existantes (DELETE sur messages/
-- message_attachments, déjà en place depuis la Phase 4A) mais passe par une
-- fonction SECURITY DEFINER dédiée, pour :
--   1. renvoyer en un seul aller-retour les informations nécessaires à
--      l'application pour nettoyer le fichier Storage correspondant
--      (message_type, storage_path) ;
--   2. être idempotente : un second appel sur un message déjà supprimé ne
--      lève pas d'erreur (nécessaire pour la reprise après un échec de
--      suppression côté base survenant après un fichier Storage déjà
--      supprimé, voir services/messages.ts).
--
-- Ordre de suppression côté application (photo/vidéo) : le fichier Storage
-- est supprimé AVANT cette RPC, jamais après — si la RPC échouait avant la
-- suppression du fichier, le message resterait affiché avec un média
-- désormais absent. Cette RPC ne supprime donc jamais elle-même de fichier
-- Storage : elle se contente de renvoyer le chemin pour que l'appelant
-- confirme/complète le nettoyage, et de supprimer la ligne `messages`
-- (`message_attachments` suit par ON DELETE CASCADE, déjà en place).

create function public.delete_own_message(p_message_id uuid)
returns table (
  message_id uuid,
  message_type text,
  storage_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  v_sender_id uuid;
  v_message_type text;
  v_storage_path text;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if p_message_id is null then
    raise exception 'Message manquant.';
  end if;

  select m.sender_id, m.message_type
    into v_sender_id, v_message_type
  from public.messages m
  where m.id = p_message_id;

  -- Idempotence : le message n'existe plus (déjà supprimé lors d'une
  -- tentative précédente, ou jamais existant). Ni erreur ni doublon : on
  -- renvoie simplement un résultat vide, succès silencieux.
  if v_sender_id is null then
    return;
  end if;

  if v_sender_id <> current_user_id then
    raise exception 'Tu ne peux supprimer que tes propres messages.';
  end if;

  -- Chemin du média éventuel, capturé avant suppression : au plus une pièce
  -- jointe par message (Phase 4A/4B). NULL pour un message texte.
  select a.storage_path into v_storage_path
  from public.message_attachments a
  where a.message_id = p_message_id;

  -- Supprime uniquement la ligne `messages` : `message_attachments` suit par
  -- ON DELETE CASCADE (contrainte déjà en place depuis la Phase 4A). Le
  -- fichier Storage, lui, n'est jamais touché ici (voir note en tête de
  -- fichier) : c'est à l'appelant de l'avoir déjà supprimé avant ce point
  -- pour un message photo/vidéo.
  delete from public.messages where id = p_message_id;

  return query select p_message_id, v_message_type, v_storage_path;
end;
$$;

comment on function public.delete_own_message(uuid) is
  'Supprime un message appartenant à auth.uid() et renvoie (message_id, '
  'message_type, storage_path) pour que l''appelant nettoie le fichier '
  'Storage associé. Idempotente : un message déjà supprimé renvoie un '
  'résultat vide plutôt qu''une erreur. Ne supprime jamais elle-même de '
  'fichier Storage. Réservée à authenticated.';

revoke execute on function public.delete_own_message(uuid) from public;
revoke execute on function public.delete_own_message(uuid) from anon;
grant execute on function public.delete_own_message(uuid) to authenticated;

-- Aucun changement de policy RLS ni de GRANT sur messages/message_attachments/
-- storage.objects : les policies DELETE de la Phase 4A (sender_id = auth.uid()
-- sur messages, uploader_id = auth.uid() sur message_attachments et sur
-- storage.objects) restent la source de vérité pour l'autorisation réelle.
-- Cette RPC ajoute une vérification explicite et un point d'entrée unique et
-- idempotent, elle ne remplace ni n'affaiblit ces policies.

-- ---------------------------------------------------------------------------
-- REPLICA IDENTITY FULL sur messages : nécessaire pour que les événements
-- Realtime DELETE (utilisés par l'application pour faire disparaître un
-- message supprimé chez l'autre participant) contiennent conversation_id
-- dans la ligne OLD. Par défaut (REPLICA IDENTITY DEFAULT), seule la clé
-- primaire (id) est incluse dans le WAL pour un DELETE : le filtre Realtime
-- `conversation_id=eq.<id>` ne pourrait jamais correspondre et aucun
-- événement DELETE ne serait jamais livré. N'affecte que le volume du WAL
-- pour messages (table déjà de taille modérée), pas les policies RLS.
-- ---------------------------------------------------------------------------
alter table public.messages replica identity full;
