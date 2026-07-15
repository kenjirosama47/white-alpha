import { supabase } from '@/lib/supabase';
import { searchProfiles } from '@/services/profiles';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;

describe('searchProfiles', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('rejette une recherche trop courte sans appeler la RPC', async () => {
    await expect(searchProfiles('a')).rejects.toThrow('au moins 2 caractères');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('retourne les profils mappés pour une recherche valide', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: '1', username: 'bob', display_name: 'Bob', avatar_url: null }],
      error: null,
    });

    const result = await searchProfiles('bob');

    expect(mockRpc).toHaveBeenCalledWith('search_public_profiles', { search_query: 'bob' });
    expect(result).toEqual([{ id: '1', username: 'bob', displayName: 'Bob', avatarUrl: null }]);
  });

  it("remonte une erreur réseau/RPC sous forme d'exception", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(searchProfiles('bob')).rejects.toThrow('Network error');
  });
});
