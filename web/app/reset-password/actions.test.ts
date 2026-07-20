import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { resetPasswordAction } from './actions';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

describe('resetPasswordAction (Phase 8.3/8.4)', () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
    mockRedirect.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({ auth: { updateUser: mockUpdateUser, signOut: mockSignOut } });
  });

  it('réinitialisation réussie : appelle updateUser, déconnecte la session de récupération, puis redirige vers /login?reason=password_updated', async () => {
    mockUpdateUser.mockResolvedValue({ error: null });

    await resetPasswordAction({ error: null }, formData({ password: 'nouveauMdp1', confirmPassword: 'nouveauMdp1' }));

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'nouveauMdp1' });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/login?reason=password_updated');
  });

  it('mots de passe différents : refuse sans appeler Supabase, jamais de redirection', async () => {
    const result = await resetPasswordAction({ error: null }, formData({ password: 'nouveauMdp1', confirmPassword: 'autreChose1' }));

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.error).toBe('Les deux mots de passe ne correspondent pas.');
  });

  it('mot de passe trop court : refuse sans appeler Supabase', async () => {
    const result = await resetPasswordAction({ error: null }, formData({ password: 'abc', confirmPassword: 'abc' }));

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('lien invalide ou expiré (session de récupération absente) : message dédié, jamais de redirection vers /login', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } });

    const result = await resetPasswordAction({ error: null }, formData({ password: 'nouveauMdp1', confirmPassword: 'nouveauMdp1' }));

    expect(result.error).toContain('invalide ou a expiré');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
