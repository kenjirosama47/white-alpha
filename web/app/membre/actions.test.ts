import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { logoutAction } from './actions';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const mockSignOut = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

describe('logoutAction (Phase 8.2)', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockRedirect.mockReset();
    mockCreateClient.mockResolvedValue({ auth: { signOut: mockSignOut } });
  });

  it('révoque la session Supabase puis redirige vers la page d’accueil', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await logoutAction();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
