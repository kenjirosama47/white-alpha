import { DEFAULT_WOLF_AVATAR_ID, isWolfAvatarId, type WolfAvatarId } from '@/constants/avatars';
import { getAvatarPublicUrl } from '@/services/avatars';
import { supabase } from '@/lib/supabase';
import {
  validateDisplayName,
  validateSearchQuery,
  validateUsername,
  type PublicProfile,
  type UserRole,
} from '@/types/chat';
import { friendlyRpcError } from '@/utils/errors';

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  /** Chemin Storage dans le bucket `avatars` (jamais une URL complète) — voir migration 20260716140000. */
  avatar_url: string | null;
  /** Identifiant loup prédéfini (Phase 7.5) — toujours l'un des 9 officiels côté base (contrainte CHECK), revalidé ici en repli défensif. */
  avatar_preset: string;
};

/**
 * Ligne `profiles` incluant `role`, uniquement pour son propre profil
 * (`getMyProfile`) : ni `search_public_profiles` ni `update_my_profile` ne
 * renvoient cette colonne (voir migration Phase 5.S3 — `role` n'est
 * exposée qu'en lecture, jamais modifiable via ces RPC).
 */
type MyProfileRow = ProfileRow & { role: UserRole };

/**
 * `avatar_url` en base est un CHEMIN Storage, pas une URL : converti ici en
 * URL publique prête à afficher, pour tous les appelants de ce module.
 * `avatar_preset` est revalidé côté client (repli sur la valeur par défaut
 * si jamais une valeur inattendue arrivait malgré la contrainte CHECK côté
 * base — défense en profondeur, jamais censé se produire en pratique).
 */
function mapProfileRow(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ? getAvatarPublicUrl(row.avatar_url) : null,
    avatarPreset: isWolfAvatarId(row.avatar_preset) ? row.avatar_preset : DEFAULT_WOLF_AVATAR_ID,
  };
}

/**
 * Profil de l'utilisateur connecté : en plus de `PublicProfile`, expose
 * `avatarPath` (le chemin Storage brut, pas l'URL) — nécessaire uniquement
 * pour supprimer son propre ancien avatar après un remplacement réussi
 * (`services/avatars.ts`) — et `role`, jamais modifiable côté client (voir
 * migration Phase 5.S3). Ne jamais exposer `avatarPath`/`role` d'un autre
 * utilisateur : cette forme n'est utilisée que pour son propre profil.
 */
export type MyProfile = PublicProfile & { avatarPath: string | null; role: UserRole };

function mapMyProfileRow(row: MyProfileRow): MyProfile {
  return { ...mapProfileRow(row), avatarPath: row.avatar_url, role: row.role };
}

/** Recherche des profils publics via la RPC `search_public_profiles` (jamais d'email). */
export async function searchProfiles(query: string): Promise<PublicProfile[]> {
  const validation = validateSearchQuery(query);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { data, error } = await supabase.rpc('search_public_profiles', {
    search_query: query.trim(),
  });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de rechercher des utilisateurs pour le moment.'));
  }

  return (data ?? []).map(mapProfileRow);
}

/**
 * Profil de l'utilisateur connecté. Repose uniquement sur la policy RLS
 * Phase 2 "Un utilisateur peut lire son propre profil" (`auth.uid() = id`) :
 * aucun filtre explicite nécessaire, une seule ligne peut jamais être
 * retournée pour cette session.
 */
export async function getMyProfile(): Promise<MyProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, avatar_preset, role')
    .maybeSingle();

  if (error) {
    throw new Error('Impossible de charger le profil pour le moment.');
  }
  if (!data) {
    throw new Error('Profil introuvable.');
  }

  return mapMyProfileRow(data as MyProfileRow);
}

type UpdateMyProfileParams = {
  username: string;
  displayName: string;
  /** Chemin Storage du nouvel avatar (bucket `avatars`), déjà uploadé. Omis : avatar inchangé. */
  avatarPath?: string;
};

/**
 * Met à jour le profil via la RPC `update_my_profile` (jamais d'UPDATE
 * direct : sender_id-style falsification impossible, message français
 * explicite en cas de nom d'utilisateur déjà pris). Validation appliquée ici
 * en plus de la RPC pour un retour immédiat côté UI, mais la RPC reste la
 * seule source de vérité (revalide tout côté serveur).
 *
 * Ne renvoie jamais `role` ni `avatarPreset` : `update_my_profile` ne les a
 * jamais pris en paramètre ni ne les renvoie (le rôle depuis la Phase 5.S3,
 * `avatarPreset` depuis son introduction Phase 7.5, volontairement via une
 * RPC dédiée `update_my_avatar_preset` — voir plus bas) — ni l'un ni l'autre
 * ne changent jamais via ce chemin, l'appelant conserve les valeurs déjà
 * connues.
 */
export async function updateMyProfile(
  params: UpdateMyProfileParams,
): Promise<Omit<MyProfile, 'role' | 'avatarPreset'>> {
  const usernameValidation = validateUsername(params.username);
  if (!usernameValidation.ok) {
    throw new Error(usernameValidation.error);
  }
  const displayNameValidation = validateDisplayName(params.displayName);
  if (!displayNameValidation.ok) {
    throw new Error(displayNameValidation.error);
  }

  const { data, error } = await supabase.rpc('update_my_profile', {
    p_username: params.username.trim().toLowerCase(),
    p_display_name: params.displayName.trim(),
    p_avatar_path: params.avatarPath ?? null,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de mettre à jour le profil pour le moment.'));
  }

  // `update_my_profile` ne renvoie pas `avatar_preset` (signature Phase 5.1
  // inchangée, non touchée par la Phase 7.5) : ce type reflète exactement ce
  // que la RPC renvoie réellement, pour ne jamais construire un `avatarPreset`
  // à partir d'une colonne absente de la réponse.
  const row = (Array.isArray(data) ? data[0] : data) as Omit<ProfileRow, 'avatar_preset'> | undefined;
  if (!row) {
    throw new Error('Impossible de mettre à jour le profil pour le moment.');
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ? getAvatarPublicUrl(row.avatar_url) : null,
    avatarPath: row.avatar_url,
  };
}

/**
 * Met à jour l'avatar loup prédéfini via la RPC dédiée `update_my_avatar_preset`
 * (jamais d'UPDATE direct — aucun GRANT sur cette colonne, voir migration
 * Phase 7.5). Le typage `WolfAvatarId` du paramètre empêche déjà tout envoi
 * d'une valeur hors catalogue depuis l'app ; la RPC revalide malgré tout côté
 * serveur (contrainte CHECK en dernier rempart).
 */
export async function updateMyAvatarPreset(avatarPreset: WolfAvatarId): Promise<WolfAvatarId> {
  const { data, error } = await supabase.rpc('update_my_avatar_preset', {
    p_avatar_preset: avatarPreset,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, "Impossible de mettre à jour l'avatar pour le moment."));
  }

  const row = (Array.isArray(data) ? data[0] : data) as { id: string; avatar_preset: string } | undefined;
  if (!row || !isWolfAvatarId(row.avatar_preset)) {
    throw new Error("Impossible de mettre à jour l'avatar pour le moment.");
  }

  return row.avatar_preset;
}
