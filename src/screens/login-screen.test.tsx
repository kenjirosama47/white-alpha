import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import LoginScreen from '@/app/(auth)/login';

async function fillCredentials(email: string, password: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('ton@email.com'), email);
    fireEvent.changeText(screen.getByPlaceholderText('Mot de passe'), password);
    await Promise.resolve();
  });
}

// Ce fichier vit délibérément hors de src/app (voir app-layout.test.tsx).
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Link: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
      asChild ? children : ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

const mockSignIn = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginScreen — textes officiels (Phase 7.3)', () => {
  it('affiche le titre et le sous-texte officiels', async () => {
    await render(<LoginScreen />);

    expect(screen.getByText('Retrouvez la meute')).toBeTruthy();
    expect(screen.getByText('Connectez-vous pour accéder à vos conversations privées.')).toBeTruthy();
  });

  it('ne contient aucune référence visible à Claude', async () => {
    await render(<LoginScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });
});

describe('LoginScreen — champs et accessibilité', () => {
  it('email : autocorrection et capitalisation automatique désactivées', async () => {
    await render(<LoginScreen />);

    const emailInput = screen.getByPlaceholderText('ton@email.com');
    expect(emailInput.props.autoCorrect).toBe(false);
    expect(emailInput.props.autoCapitalize).toBe('none');
  });

  it('mot de passe masqué par défaut, avec bouton afficher/masquer accessible', async () => {
    await render(<LoginScreen />);

    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Afficher le mot de passe')).toBeTruthy();
  });

  it('le bouton de connexion est désactivé tant que les deux champs ne sont pas remplis', async () => {
    await render(<LoginScreen />);

    const button = screen.getByLabelText('Se connecter');
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

describe('LoginScreen — navigation', () => {
  it('lien « Mot de passe oublié ? » présent', async () => {
    await render(<LoginScreen />);

    expect(screen.getByText('Mot de passe oublié ?')).toBeTruthy();
  });

  it('lien vers inscription présent', async () => {
    await render(<LoginScreen />);

    expect(screen.getByText('Pas encore de compte ? Créer un compte')).toBeTruthy();
  });

  it('bouton Retour appelle router.back', async () => {
    await render(<LoginScreen />);
    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('LoginScreen — soumission', () => {
  it('connexion réussie : redirige vers /', async () => {
    mockSignIn.mockResolvedValue({ error: null });

    await render(<LoginScreen />);
    await fillCredentials('a@test.local', 'motdepasse');

    await act(async () => {
      fireEvent.press(screen.getByText('Se connecter'));
      await Promise.resolve();
    });

    expect(mockSignIn).toHaveBeenCalledWith('a@test.local', 'motdepasse');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('erreur de connexion : message affiché près du bouton, aucune redirection', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email ou mot de passe incorrect.' });

    await render(<LoginScreen />);
    await fillCredentials('a@test.local', 'mauvais');

    await act(async () => {
      fireEvent.press(screen.getByText('Se connecter'));
      await Promise.resolve();
    });

    expect(await screen.findByText('Email ou mot de passe incorrect.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('pendant la soumission : affiche « Connexion… » et désactive le bouton', async () => {
    let resolveSignIn: (value: { error: string | null }) => void = () => {};
    mockSignIn.mockReturnValue(new Promise((resolve) => (resolveSignIn = resolve)));

    await render(<LoginScreen />);
    await fillCredentials('a@test.local', 'motdepasse');

    await act(async () => {
      fireEvent.press(screen.getByText('Se connecter'));
      await Promise.resolve();
    });

    await screen.findByLabelText('Connexion…');

    await act(async () => {
      resolveSignIn({ error: null });
      await Promise.resolve();
    });
  });
});
