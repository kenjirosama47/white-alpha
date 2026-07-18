import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { loginAction } from './actions';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const mockSignInWithPassword = jest.fn();
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

describe('loginAction (Phase 8.2)', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockRedirect.mockReset();
    mockCreateClient.mockResolvedValue({
      auth: { signInWithPassword: mockSignInWithPassword },
    });
  });

  it('connexion réussie : redirige vers /app par défaut', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction({ error: null }, formData({ email: 'a@example.com', password: 'secret123' }));

    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret123' });
    expect(mockRedirect).toHaveBeenCalledWith('/app');
  });

  it('connexion réussie avec un paramètre next : redirige vers cette route', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction(
      { error: null },
      formData({ email: 'a@example.com', password: 'secret123', next: '/install' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/install');
  });

  it('ignore un paramètre next externe (protection contre une redirection ouverte)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await loginAction(
      { error: null },
      formData({ email: 'a@example.com', password: 'secret123', next: 'https://evil.example' }),
    );

    expect(mockRedirect).toHaveBeenCalledWith('/app');
  });

  it('échec de connexion : renvoie un message générique, jamais le détail Supabase brut', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const result = await loginAction({ error: null }, formData({ email: 'a@example.com', password: 'wrong' }));

    expect(result.error).toBe('Email ou mot de passe incorrect.');
    expect(result.error).not.toContain('Invalid login credentials');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('champs vides : refuse sans appeler Supabase', async () => {
    const result = await loginAction({ error: null }, formData({ email: '', password: '' }));

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
