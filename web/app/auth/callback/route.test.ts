/** @jest-environment node */
import { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

import { GET } from './route';

const mockExchangeCodeForSession = jest.fn();
const mockVerifyOtp = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

function requestFor(search: string) {
  return new NextRequest(`https://white-alpha.example/auth/callback${search}`);
}

describe('GET /auth/callback (Phase 8.3)', () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockReset();
    mockVerifyOtp.mockReset();
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchangeCodeForSession, verifyOtp: mockVerifyOtp },
    });
  });

  it('code (PKCE) valide, confirmation classique : redirige vers /membre', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(requestFor('?code=abc123'));

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.headers.get('location')).toBe('https://white-alpha.example/membre');
  });

  it('code (PKCE) valide, récupération de mot de passe : redirige vers /reset-password', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(requestFor('?code=abc123&type=recovery'));

    expect(response.headers.get('location')).toBe('https://white-alpha.example/reset-password');
  });

  it('token_hash + type valides : appelle verifyOtp puis redirige', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor('?token_hash=xyz&type=signup'));

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'signup' });
    expect(response.headers.get('location')).toBe('https://white-alpha.example/membre');
  });

  it('erreur explicite dans les paramètres : redirige vers /login sans jamais appeler Supabase', async () => {
    const response = await GET(requestFor('?error=access_denied&error_code=otp_expired'));

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://white-alpha.example/login?reason=confirmation_failed');
  });

  it('lien invalide/incomplet (aucun paramètre exploitable) : redirige vers /login', async () => {
    const response = await GET(requestFor(''));

    expect(response.headers.get('location')).toBe('https://white-alpha.example/login?reason=confirmation_failed');
  });

  it('échec de exchangeCodeForSession : redirige vers /login sans exposer le détail', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } });

    const response = await GET(requestFor('?code=expired'));

    expect(response.headers.get('location')).toBe('https://white-alpha.example/login?reason=confirmation_failed');
  });
});
