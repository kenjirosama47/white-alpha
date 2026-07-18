import { createClient } from '@/lib/supabase/server';

import { resetPasswordAction } from './actions';

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

describe('resetPasswordAction (Phase 8.3)', () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockCreateClient.mockResolvedValue({ auth: { updateUser: mockUpdateUser } });
  });

  it('réinitialisation réussie', async () => {
    mockUpdateUser.mockResolvedValue({ error: null });

    const result = await resetPasswordAction(
      { error: null, success: false },
      formData({ password: 'nouveauMdp1', confirmPassword: 'nouveauMdp1' }),
    );

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'nouveauMdp1' });
    expect(result.success).toBe(true);
  });

  it('mots de passe différents : refuse sans appeler Supabase', async () => {
    const result = await resetPasswordAction(
      { error: null, success: false },
      formData({ password: 'nouveauMdp1', confirmPassword: 'autreChose1' }),
    );

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(result.error).toBe('Les deux mots de passe ne correspondent pas.');
  });

  it('mot de passe trop court : refuse sans appeler Supabase', async () => {
    const result = await resetPasswordAction(
      { error: null, success: false },
      formData({ password: 'abc', confirmPassword: 'abc' }),
    );

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('lien invalide ou expiré (session de récupération absente) : message dédié', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } });

    const result = await resetPasswordAction(
      { error: null, success: false },
      formData({ password: 'nouveauMdp1', confirmPassword: 'nouveauMdp1' }),
    );

    expect(result.error).toContain('invalide ou a expiré');
    expect(result.success).toBe(false);
  });
});
