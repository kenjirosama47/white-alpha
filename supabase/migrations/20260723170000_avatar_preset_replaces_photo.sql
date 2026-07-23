-- Correctif A6/A8 (build 21) : choisir un avatar loup prédéfini n'effaçait
-- jamais la photo personnelle existante (avatar_url) — la RPC ne touchait
-- que avatar_preset (voir migration 20260717210000). Or `AvatarImage`
-- (src/components/avatar-image.tsx) donne toujours la priorité à avatar_url
-- sur avatar_preset : un utilisateur ayant déjà une photo voyait donc la RPC
-- réussir (avatar_preset bien enregistré) sans que l'affichage ne change
-- jamais nulle part dans l'app, ce qui a été signalé comme « ça valide mais
-- ça change pas la photo ». Choisir un loup est désormais traité comme un
-- remplacement explicite de l'avatar existant, quelle que soit sa nature
-- (photo ou autre préréglage) : avatar_url est mis à null dans le même
-- UPDATE. `previous_avatar_path` est renvoyé pour permettre au client de
-- supprimer l'ancien fichier Storage devenu orphelin, en réutilisant
-- exactement le même nettoyage best-effort que update_my_profile
-- (`removeAvatarFile`, voir services/avatars.ts et use-profile-editor.ts).
--
-- CREATE OR REPLACE ne permet pas d'ajouter une colonne de sortie à une
-- fonction RETURNS TABLE existante : DROP puis CREATE, REVOKE/GRANT
-- identiques à l'original (même principe que les migrations 20260717210000
-- et 20260718090000).
--
-- Réversibilité (manuelle, jamais exécutée automatiquement) :
--   restaurer la définition précédente de update_my_avatar_preset (voir
--   migration 20260717210000) — aucune colonne ni contrainte ajoutée ici,
--   uniquement le corps de la fonction.

drop function public.update_my_avatar_preset(text);

create function public.update_my_avatar_preset(p_avatar_preset text)
returns table (
  id uuid,
  avatar_preset text,
  avatar_url text,
  previous_avatar_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  v_previous_avatar_path text;
begin
  if current_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if p_avatar_preset is null or p_avatar_preset not in (
    'wolf_white_calm', 'wolf_grey', 'wolf_black', 'wolf_brown', 'wolf_snow',
    'wolf_green_eye', 'wolf_young', 'wolf_guardian', 'wolf_alpha'
  ) then
    raise exception 'Avatar invalide.';
  end if;

  select p.avatar_url into v_previous_avatar_path
  from public.profiles p
  where p.id = current_user_id;

  update public.profiles p
  set avatar_preset = p_avatar_preset,
      avatar_url = null
  where p.id = current_user_id;

  return query
    select p.id, p.avatar_preset, p.avatar_url, v_previous_avatar_path
    from public.profiles p
    where p.id = current_user_id;
end;
$$;

comment on function public.update_my_avatar_preset(text) is
  'Met à jour avatar_preset de auth.uid() uniquement, restreint à la liste '
  'officielle des 9 loups (contrainte CHECK avatar_preset_valid en dernier '
  'rempart), et efface systématiquement avatar_url (choisir un préréglage '
  'remplace toute photo personnelle existante — AvatarImage donne priorité '
  'à avatar_url sur avatar_preset). Renvoie previous_avatar_path pour '
  'permettre un nettoyage Storage côté client (removeAvatarFile, '
  'best-effort). Ne touche jamais role ni id. Réservée à authenticated.';

revoke execute on function public.update_my_avatar_preset(text) from public;
revoke execute on function public.update_my_avatar_preset(text) from anon;
grant execute on function public.update_my_avatar_preset(text) to authenticated;
