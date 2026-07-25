import { Component, type ReactNode } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { LoginForm } from './LoginForm';
import { loginAction } from './actions';

jest.mock('./actions', () => ({
  loginAction: jest.fn(),
}));

const mockLoginAction = loginAction as jest.Mock;

const NETWORK_ERROR_MESSAGE = 'Connexion impossible. Vérifie ta connexion et réessaie.';

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret123' } });
}

/** Capture une erreur relancée par le composant (ex. NEXT_REDIRECT) sans faire échouer le test. */
class CapturingErrorBoundary extends Component<{ children: ReactNode; onError: (error: unknown) => void }, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  override render() {
    return this.state.hasError ? null : this.props.children;
  }
}

describe('LoginForm (Phase 8.3)', () => {
  beforeEach(() => {
    mockLoginAction.mockReset();
  });

  it('affiche les champs, les liens et le bouton de connexion', () => {
    render(<LoginForm next="/membre" />);

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mot de passe oublié ?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Créer un compte' })).toBeTruthy();
  });

  it('le mot de passe est masqué par défaut et peut être révélé', () => {
    render(<LoginForm next="/membre" />);

    const passwordInput = screen.getByLabelText('Mot de passe') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(passwordInput.type).toBe('text');
  });

  it('désactive le bouton pendant la soumission (empêche une double soumission)', async () => {
    let resolveAction: (value: { error: string | null }) => void = () => {};
    mockLoginAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<LoginForm next="/membre" />);

    fillValidForm();

    const submitButton = screen.getByRole('button', { name: 'Se connecter' });
    fireEvent.click(submitButton);

    expect(await screen.findByRole('button', { name: 'Connexion…' })).toBeDisabled();
    expect(mockLoginAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ error: null });
    });
  });

  it('identifiants invalides : affiche le message générique renvoyé par loginAction et réactive le bouton', async () => {
    mockLoginAction.mockResolvedValue({ error: 'Email ou mot de passe incorrect.' });

    render(<LoginForm next="/membre" />);
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect.');
    expect(screen.getByRole('button', { name: 'Se connecter' })).not.toBeDisabled();
  });

  it(
    "échec réseau (l'appel à loginAction échoue avant même d'atteindre le serveur — proxy, 503, connexion coupée) : " +
      "affiche un message générique visible et réactive le bouton, jamais d'échec silencieux (bug réel corrigé)",
    async () => {
      mockLoginAction.mockRejectedValue(new TypeError('Failed to fetch'));

      render(<LoginForm next="/membre" />);
      fillValidForm();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
      });

      expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
      expect(screen.getByRole('button', { name: 'Se connecter' })).not.toBeDisabled();
    },
  );

  it('connexion réussie (redirection) : ne bloque jamais la redirection Next.js, jamais confondue avec un échec réseau', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/membre;307;' });
    mockLoginAction.mockRejectedValue(redirectError);

    const onError = jest.fn();
    render(
      <CapturingErrorBoundary onError={onError}>
        <LoginForm next="/membre" />
      </CapturingErrorBoundary>,
    );
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ digest: 'NEXT_REDIRECT;push;/membre;307;' }));
    expect(screen.queryByText(NETWORK_ERROR_MESSAGE)).toBeNull();
  });

  it('double clic pendant une soumission en cours : loginAction appelée une seule fois', async () => {
    let resolveAction: (value: { error: string | null }) => void = () => {};
    mockLoginAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<LoginForm next="/membre" />);
    fillValidForm();

    const submitButton = screen.getByRole('button', { name: 'Se connecter' });
    fireEvent.click(submitButton);
    await screen.findByRole('button', { name: 'Connexion…' });
    fireEvent.click(screen.getByRole('button', { name: 'Connexion…' }));

    expect(mockLoginAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ error: null });
    });
  });

  it('champs vides : le navigateur bloque la soumission (required), loginAction jamais appelée', () => {
    render(<LoginForm next="/membre" />);

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(mockLoginAction).not.toHaveBeenCalled();
  });
});
