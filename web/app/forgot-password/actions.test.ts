import { createClient } from '@/lib/supabase/server';

import { forgotPasswordAction } from './actions';

const mockResetPasswordForEmail = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

describe('forgotPasswordAction (Phase 8.3)', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({ auth: { resetPasswordForEmail: mockResetPasswordForEmail } });
  });

  it('adresse associée à un compte : appelle resetPasswordForEmail avec le callback /auth/callback, jamais directement /reset-password', async () => {
    const result = await forgotPasswordAction({ submitted: false }, formData({ email: 'a@example.com' }));

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      redirectTo: expect.stringContaining('/auth/callback'),
    });
    expect(result.submitted).toBe(true);
  });

  it('adresse inconnue (erreur Supabase silencieuse) : même message générique de succès, jamais de divulgation', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });

    const result = await forgotPasswordAction({ submitted: false }, formData({ email: 'inconnu@example.com' }));

    expect(result.submitted).toBe(true);
  });

  it('adresse associée à un compte et adresse inconnue produisent exactement le même state (aucune divergence exploitable)', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const knownResult = await forgotPasswordAction({ submitted: false }, formData({ email: 'connu@example.com' }));

    mockResetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'User not found' } });
    const unknownResult = await forgotPasswordAction({ submitted: false }, formData({ email: 'inconnu@example.com' }));

    expect(knownResult).toEqual(unknownResult);
  });

  it('champ email vide : ne contacte jamais Supabase, mais renvoie tout de même le message générique', async () => {
    const result = await forgotPasswordAction({ submitted: false }, formData({ email: '' }));

    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(result.submitted).toBe(true);
  });
});
