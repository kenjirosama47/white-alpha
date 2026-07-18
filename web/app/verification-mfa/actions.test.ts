import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { verifyMfaAction } from './actions';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const mockListFactors = jest.fn();
const mockChallengeAndVerify = jest.fn();
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

describe('verifyMfaAction (Phase 8.3)', () => {
  beforeEach(() => {
    mockListFactors.mockReset();
    mockChallengeAndVerify.mockReset();
    mockRedirect.mockReset();
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: 'factor-1' }] }, error: null });
    mockCreateClient.mockResolvedValue({
      auth: { mfa: { listFactors: mockListFactors, challengeAndVerify: mockChallengeAndVerify } },
    });
  });

  it('code valide : vérifie le facteur puis redirige vers next', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: null });

    await verifyMfaAction({ error: null }, formData({ code: '123456', next: '/profil' }));

    expect(mockChallengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(mockRedirect).toHaveBeenCalledWith('/profil');
  });

  it('code mal formé (pas 6 chiffres) : refuse sans appeler Supabase', async () => {
    const result = await verifyMfaAction({ error: null }, formData({ code: 'abcdef' }));

    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('code invalide : message générique, jamais le détail Supabase brut, jamais le code journalisé dans l’erreur', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } });

    const result = await verifyMfaAction({ error: null }, formData({ code: '000000' }));

    expect(result.error).toBe('Code incorrect. Réessaie.');
    expect(result.error).not.toContain('000000');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('trop de tentatives : message dédié', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 30 seconds.' } });

    const result = await verifyMfaAction({ error: null }, formData({ code: '111111' }));

    expect(result.error).toContain('patienter');
  });

  it('aucun facteur vérifié trouvé : refuse plutôt que de planter', async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await verifyMfaAction({ error: null }, formData({ code: '123456' }));

    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('next externe ignoré (protection contre une redirection ouverte)', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: null });

    await verifyMfaAction({ error: null }, formData({ code: '123456', next: '//evil.example' }));

    expect(mockRedirect).toHaveBeenCalledWith('/membre');
  });
});
