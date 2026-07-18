import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { loginAction } from './actions';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const mockSignInWithPassword = jest.fn();
const mockGetAuthenticatorAssuranceLevel = jest.fn();
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

describe('loginAction (Phase 8.3)', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockGetAuthenticatorAssuranceLevel.mockReset();
    mockRedirect.mockReset();
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    mockCreateClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        mfa: { getAuthenticatorAssuranceLevel: mockGetAuthenticatorAssuranceLevel },
      },
    });
  });

  it('connexion réussie sans MFA : redirige vers /membre par défaut', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction({ error: null }, formData({ email: 'a@example.com', password: 'secret123' }));

    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret123' });
    expect(mockRedirect).toHaveBeenCalledWith('/membre');
  });

  it('connexion réussie avec un paramètre next : redirige vers cette route', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction(
      { error: null },
      formData({ email: 'a@example.com', password: 'secret123', next: '/install' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/install');
  });

  it('ignore un paramètre next externe classique (protection contre une redirection ouverte)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction(
      { error: null },
      formData({ email: 'a@example.com', password: 'secret123', next: 'https://evil.example' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/membre');
  });

  it('ignore un paramètre next protocole-relatif (//evil.example), interprété comme externe par les navigateurs', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction(
      { error: null },
      formData({ email: 'a@example.com', password: 'secret123', next: '//evil.example' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/membre');
  });

  it('MFA requis (AAL1 → AAL2) : redirige vers /verification-mfa en conservant next', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });

    await loginAction(
      { error: null },
      formData({ email: 'owner@example.com', password: 'secret123', next: '/profil' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/verification-mfa?next=%2Fprofil');
  });

  it('email mal formé : Supabase le refuse, message générique renvoyé (jamais le détail brut)', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Unable to validate email address: invalid format' },
    });

    const result = await loginAction({ error: null }, formData({ email: 'pas-un-email', password: 'secret123' }));

    expect(result.error).toBe('Email ou mot de passe incorrect.');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('échec de connexion : renvoie un message générique, jamais le détail Supabase brut', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const result = await loginAction({ error: null }, formData({ email: 'a@example.com', password: 'wrong' }));

    expect(result.error).toBe('Email ou mot de passe incorrect.');
    expect(result.error).not.toContain('Invalid login credentials');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('champs vides : refuse sans appeler Supabase (double soumission ou formulaire vide)', async () => {
    const result = await loginAction({ error: null }, formData({ email: '', password: '' }));

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
