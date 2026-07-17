import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import RegisterScreen from '@/app/(auth)/register';

jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Link: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
      asChild ? children : ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

const mockSignUp = jest.fn();
const mockResendConfirmation = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ signUp: mockSignUp, resendConfirmation: mockResendConfirmation }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

async function fillRegisterForm(username: string, email: string, password: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText("Nom d'utilisateur"), username);
    fireEvent.changeText(screen.getByPlaceholderText('ton@email.com'), email);
    fireEvent.changeText(screen.getByPlaceholderText('Mot de passe'), password);
    await Promise.resolve();
  });
}

describe('RegisterScreen — textes officiels (Phase 7.3)', () => {
  it('affiche le titre et le sous-texte officiels', async () => {
    await render(<RegisterScreen />);

    expect(screen.getByText('Rejoignez la meute White Alpha')).toBeTruthy();
    expect(screen.getByText('Créez votre espace privé et sécurisé.')).toBeTruthy();
  });

  it('ne contient aucune référence visible à Claude', async () => {
    await render(<RegisterScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });
});

describe('RegisterScreen — validation et soumission', () => {
  it("nom d'utilisateur invalide : message affiché, signUp jamais appelé", async () => {
    await render(<RegisterScreen />);
    await fillRegisterForm('ab', 'a@test.local', 'motdepasse');

    await act(async () => {
      fireEvent.press(screen.getByText('Créer mon compte'));
      await Promise.resolve();
    });

    expect(await screen.findByText(/entre 3 et 24 caractères/)).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("inscription réussie : bascule vers l'écran de confirmation email", async () => {
    mockSignUp.mockResolvedValue({ error: null });

    await render(<RegisterScreen />);
    await fillRegisterForm('kenjiro47', 'a@test.local', 'motdepasse');

    await act(async () => {
      fireEvent.press(screen.getByText('Créer mon compte'));
      await Promise.resolve();
    });

    expect(mockSignUp).toHaveBeenCalledWith('a@test.local', 'motdepasse', 'kenjiro47');
    expect(await screen.findByText('Vérifie ta boîte mail')).toBeTruthy();
    expect(screen.getByText(/a@test\.local/)).toBeTruthy();
  });

  it('erreur serveur : message affiché, reste sur le formulaire', async () => {
    mockSignUp.mockResolvedValue({ error: 'Un compte existe déjà avec cet email.' });

    await render(<RegisterScreen />);
    await fillRegisterForm('kenjiro47', 'a@test.local', 'motdepasse');

    await act(async () => {
      fireEvent.press(screen.getByText('Créer mon compte'));
      await Promise.resolve();
    });

    expect(await screen.findByText('Un compte existe déjà avec cet email.')).toBeTruthy();
    expect(screen.queryByText('Vérifie ta boîte mail')).toBeNull();
  });
});

describe('RegisterScreen — champs et navigation', () => {
  it('mot de passe masqué par défaut', async () => {
    await render(<RegisterScreen />);

    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(true);
  });

  it("nom d'utilisateur : autocorrection et capitalisation désactivées", async () => {
    await render(<RegisterScreen />);

    const input = screen.getByPlaceholderText("Nom d'utilisateur");
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoCapitalize).toBe('none');
  });

  it('lien vers connexion présent', async () => {
    await render(<RegisterScreen />);

    expect(screen.getByText('Déjà un compte ? Se connecter')).toBeTruthy();
  });

  it('bouton Retour appelle router.back', async () => {
    await render(<RegisterScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Retour'));
      await Promise.resolve();
    });

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('RegisterScreen — renvoi de confirmation', () => {
  async function reachConfirmationScreen() {
    mockSignUp.mockResolvedValue({ error: null });
    await render(<RegisterScreen />);
    await fillRegisterForm('kenjiro47', 'a@test.local', 'motdepasse');
    await act(async () => {
      fireEvent.press(screen.getByText('Créer mon compte'));
      await Promise.resolve();
    });
    await screen.findByText('Vérifie ta boîte mail');
  }

  it('bouton de renvoi appelle resendConfirmation avec le bon email', async () => {
    mockResendConfirmation.mockResolvedValue({ error: null });
    await reachConfirmationScreen();

    await act(async () => {
      fireEvent.press(screen.getByText("Renvoyer l'email de confirmation"));
      await Promise.resolve();
    });

    expect(mockResendConfirmation).toHaveBeenCalledWith('a@test.local');
    expect(await screen.findByText('Email de confirmation renvoyé.')).toBeTruthy();
  });
});
