-- Phase 5.S4 : audit défensif RLS/RPC/Storage — corrige deux capacités DB
-- non utilisées par l'application mais exploitables via REST direct
-- (bypass de l'app, jamais un problème d'accès inter-utilisateurs : chaque
-- capacité ne s'exerce que sur les propres données de l'appelant), source
-- d'incohérence message_type / pièce jointe.
--
-- 1. messages.message_type devient immuable après création, au même titre
--    que sender_id/conversation_id (déjà protégés par
--    messages_prevent_reassign depuis la Phase 3). Audit du code client
--    (services/messages.ts) : aucun appel .update() sur messages n'existe
--    dans l'application — ce GRANT UPDATE + policy "Un expéditeur peut
--    modifier son propre message" restait une capacité inutilisée
--    permettant de transformer un message 'image'/'video' en 'text' (ou
--    l'inverse) sans toucher à sa pièce jointe, affichant une incohérence
--    aux deux participants.
--
-- 2. Une pièce jointe ne peut plus être supprimée isolément : seule la
--    suppression du message parent (delete_own_message, qui cascade déjà
--    correctement vers message_attachments) est autorisée. Cette capacité
--    isolée (GRANT DELETE + policy "Un expéditeur peut supprimer sa propre
--    pièce jointe", Phase 4A) n'est elle non plus jamais utilisée par
--    l'application (confirmé par le même audit) et permettait de supprimer
--    uniquement la pièce jointe d'un message 'image'/'video' existant, en
--    laissant ce message sans média associé.
--
-- Aucune fonctionnalité visible de l'application n'est affectée : dans les
-- deux cas, le seul chemin réellement utilisé par le client
-- (delete_own_message, qui supprime le message et laisse la contrainte
-- ON DELETE CASCADE gérer la pièce jointe) continue de fonctionner
-- normalement, vérifié explicitement ci-dessous.

create function public.messages_prevent_type_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.message_type <> old.message_type then
    raise exception 'Impossible de modifier le type d''un message.';
  end if;
  return new;
end;
$$;

create trigger messages_prevent_type_change_trigger
  before update on public.messages
  for each row
  execute function public.messages_prevent_type_change();

comment on function public.messages_prevent_type_change() is
  'Bloque tout changement de message_type après création (Phase 5.S4) : '
  'même principe de défense en profondeur que messages_prevent_reassign '
  '(sender_id/conversation_id), pour message_type.';

-- BEFORE DELETE : à ce point, si le message parent a déjà été supprimé dans
-- la même transaction (cas de la cascade FK déclenchée par la suppression
-- de la ligne messages dans delete_own_message), la ligne n'est plus
-- visible ici — la suppression en cascade continue normalement. Si le
-- message parent existe toujours, la suppression est refusée.
create function public.message_attachments_prevent_standalone_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.messages where id = old.message_id) then
    raise exception 'Une pièce jointe ne peut être supprimée qu''en supprimant le message correspondant.';
  end if;
  return old;
end;
$$;

create trigger message_attachments_prevent_standalone_delete_trigger
  before delete on public.message_attachments
  for each row
  execute function public.message_attachments_prevent_standalone_delete();

comment on function public.message_attachments_prevent_standalone_delete() is
  'Bloque la suppression autonome d''une pièce jointe tant que son message '
  'parent existe encore (Phase 5.S4) : seule la suppression en cascade '
  'depuis delete_own_message (DELETE FROM messages) reste possible, jamais '
  'un DELETE direct sur message_attachments qui laisserait le message sans '
  'média associé.';
