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
};

/**
 * Ligne `profiles` incluant `role`, uniquement pour son propre profil
 * (`getMyProfile`) : ni `search_public_profiles` ni `update_my_profile` ne
 * renvoient cette colonne (voir migration Phase 5.S3 — `role` n'est
 * exposée qu'en lecture, jamais modifiable via ces RPC).
 */
type MyProfileRow = ProfileRow & { role: UserRole };

/** `avatar_url` en base est un CHEMIN Storage, pas une URL : converti ici en URL publique prête à afficher, pour tous les appelants de ce module. */
function mapProfileRow(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ? getAvatarPublicUrl(row.avatar_url) : null,
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
    .select('id, username, display_name, avatar_url, role')
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
 * Ne renvoie jamais `role` : `update_my_profile` ne l'a jamais pris en
 * paramètre ni ne le renvoie (voir migration Phase 5.S3) — le rôle ne change
 * jamais via ce chemin, l'appelant conserve la valeur déjà connue.
 */
export async function updateMyProfile(params: UpdateMyProfileParams): Promise<Omit<MyProfile, 'role'>> {
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

  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | undefined;
  if (!row) {
    throw new Error('Impossible de mettre à jour le profil pour le moment.');
  }

  return { ...mapProfileRow(row), avatarPath: row.avatar_url };
}
