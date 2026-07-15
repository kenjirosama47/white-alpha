import { supabase } from '@/lib/supabase';
import { validateSearchQuery, type PublicProfile } from '@/types/chat';

type SearchProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function mapProfileRow(row: SearchProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
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
    throw new Error(error.message || 'Impossible de rechercher des utilisateurs pour le moment.');
  }

  return (data ?? []).map(mapProfileRow);
}
