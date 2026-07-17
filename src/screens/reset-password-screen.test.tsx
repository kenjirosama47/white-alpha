import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ResetPasswordScreen from '@/app/auth/reset-password';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockUpdatePassword = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ updatePassword: mockUpdatePassword }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

async function fillPasswords(newPassword: string, confirmPassword: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('Nouveau mot de passe'), newPassword);
    fireEvent.changeText(screen.getByPlaceholderText('Confirmer le mot de passe'), confirmPassword);
    await Promise.resolve();
  });
}

describe('ResetPasswordScreen — textes et accessibilité', () => {
  it('affiche le titre et le sous-texte', async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.getByText('Créer un nouveau mot de passe')).toBeTruthy();
    expect(screen.getByText('Choisis un nouveau mot de passe pour ton compte.')).toBeTruthy();
  });

  it('ne contient aucune référence visible à Claude', async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });

  it('les deux champs mot de passe sont masqués par défaut', async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.getByPlaceholderText('Nouveau mot de passe').props.secureTextEntry).toBe(true);
    expect(screen.getByPlaceholderText('Confirmer le mot de passe').props.secureTextEntry).toBe(true);
  });
});

describe('ResetPasswordScreen — validation et soumission', () => {
  it('mots de passe différents : message affiché, updatePassword jamais appelé', async () => {
    await render(<ResetPasswordScreen />);
    await fillPasswords('motdepasse1', 'motdepasse2');

    await act(async () => {
      fireEvent.press(screen.getByText('Valider le nouveau mot de passe'));
      await Promise.resolve();
    });

    expect(await screen.findByText('Les deux mots de passe ne correspondent pas.')).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('succès : appelle updatePassword puis affiche la confirmation', async () => {
    mockUpdatePassword.mockResolvedValue({ error: null });

    await render(<ResetPasswordScreen />);
    await fillPasswords('motdepasseSecurise1', 'motdepasseSecurise1');

    await act(async () => {
      fireEvent.press(screen.getByText('Valider le nouveau mot de passe'));
      await Promise.resolve();
    });

    expect(mockUpdatePassword).toHaveBeenCalledWith('motdepasseSecurise1');
    expect(await screen.findByText('Mot de passe mis à jour')).toBeTruthy();
  });

  it('confirmation : bouton Continuer redirige vers les conversations', async () => {
    mockUpdatePassword.mockResolvedValue({ error: null });

    await render(<ResetPasswordScreen />);
    await fillPasswords('motdepasseSecurise1', 'motdepasseSecurise1');

    await act(async () => {
      fireEvent.press(screen.getByText('Valider le nouveau mot de passe'));
      await Promise.resolve();
    });

    await screen.findByText('Mot de passe mis à jour');
    await act(async () => {
      fireEvent.press(screen.getByText('Continuer'));
      await Promise.resolve();
    });

    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it("erreur serveur (ex. identique à l'ancien) : message affiché", async () => {
    mockUpdatePassword.mockResolvedValue({ error: "Le nouveau mot de passe doit être différent de l'ancien." });

    await render(<ResetPasswordScreen />);
    await fillPasswords('motdepasseSecurise1', 'motdepasseSecurise1');

    await act(async () => {
      fireEvent.press(screen.getByText('Valider le nouveau mot de passe'));
      await Promise.resolve();
    });

    expect(await screen.findByText("Le nouveau mot de passe doit être différent de l'ancien.")).toBeTruthy();
  });
});
