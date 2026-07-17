import { act, render, screen } from '@testing-library/react-native';
import { useURL } from 'expo-linking';
import { router } from 'expo-router';

import AuthCallbackScreen from '@/app/auth/callback';

jest.mock('expo-linking', () => ({
  useURL: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockVerifyOtp = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCodeForSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthCallbackScreen — routage par type de lien (Phase 7.3)', () => {
  it('type=recovery : après vérification, redirige vers /auth/reset-password (jamais /)', async () => {
    (useURL as jest.Mock).mockReturnValue(
      'whitealpha://auth/callback?token_hash=abc123&type=recovery',
    );
    mockVerifyOtp.mockResolvedValue({ error: null });

    await act(async () => {
      await render(<AuthCallbackScreen />);
      await Promise.resolve();
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
    expect(router.replace).toHaveBeenCalledWith('/auth/reset-password');
    expect(router.replace).not.toHaveBeenCalledWith('/');
  });

  it('type=signup : après vérification, redirige vers / (comportement historique inchangé)', async () => {
    (useURL as jest.Mock).mockReturnValue(
      'whitealpha://auth/callback?token_hash=abc123&type=signup',
    );
    mockVerifyOtp.mockResolvedValue({ error: null });

    await act(async () => {
      await render(<AuthCallbackScreen />);
      await Promise.resolve();
    });

    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it("lien invalide (aucun paramètre reconnu) : état d'erreur, aucune redirection", async () => {
    (useURL as jest.Mock).mockReturnValue('whitealpha://auth/callback');

    await act(async () => {
      await render(<AuthCallbackScreen />);
      await Promise.resolve();
    });

    expect(await screen.findByText('Confirmation impossible')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('lien expiré (error_code=otp_expired) : message explicite', async () => {
    (useURL as jest.Mock).mockReturnValue(
      'whitealpha://auth/callback?error=access_denied&error_code=otp_expired',
    );

    await act(async () => {
      await render(<AuthCallbackScreen />);
      await Promise.resolve();
    });

    expect(await screen.findByText(/a expiré/)).toBeTruthy();
  });
});
