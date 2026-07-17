import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ForgotPasswordScreen from '@/app/(auth)/forgot-password';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockRequestPasswordReset = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ requestPasswordReset: mockRequestPasswordReset }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

async function fillEmail(email: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('ton@email.com'), email);
    await Promise.resolve();
  });
}

describe('ForgotPasswordScreen — textes officiels (Phase 7.3)', () => {
  it('affiche le titre et le texte officiels', async () => {
    await render(<ForgotPasswordScreen />);

    expect(screen.getByText("Retrouver l'accès à la meute")).toBeTruthy();
    expect(screen.getByText('Recevez un lien sécurisé pour créer un nouveau mot de passe.')).toBeTruthy();
  });

  it('ne contient aucune référence visible à Claude', async () => {
    await render(<ForgotPasswordScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });
});

describe('ForgotPasswordScreen — soumission', () => {
  it("succès : affiche un message générique unique, sans révéler si le compte existe", async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });

    await render(<ForgotPasswordScreen />);
    await fillEmail('a@test.local');

    await act(async () => {
      fireEvent.press(screen.getByText('Recevoir le lien'));
      await Promise.resolve();
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledWith('a@test.local');
    expect(await screen.findByText('Vérifie ta boîte mail')).toBeTruthy();
    expect(screen.getByText(/Si un compte existe pour/)).toBeTruthy();
  });

  it('erreur technique : message affiché, reste sur le formulaire', async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: 'Une erreur est survenue. Réessaie.' });

    await render(<ForgotPasswordScreen />);
    await fillEmail('a@test.local');

    await act(async () => {
      fireEvent.press(screen.getByText('Recevoir le lien'));
      await Promise.resolve();
    });

    expect(await screen.findByText('Une erreur est survenue. Réessaie.')).toBeTruthy();
    expect(screen.queryByText('Vérifie ta boîte mail')).toBeNull();
  });

  it('le bouton est désactivé tant que le champ email est vide', async () => {
    await render(<ForgotPasswordScreen />);

    expect(screen.getByLabelText('Recevoir le lien').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});

describe('ForgotPasswordScreen — navigation', () => {
  it('bouton Retour appelle router.back', async () => {
    await render(<ForgotPasswordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Retour'));
      await Promise.resolve();
    });

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
