import { act, fireEvent, render, screen } from '@testing-library/react';

import { LoginForm } from './LoginForm';
import { loginAction } from './actions';

jest.mock('./actions', () => ({
  loginAction: jest.fn(),
}));

const mockLoginAction = loginAction as jest.Mock;

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

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret123' } });

    const submitButton = screen.getByRole('button', { name: 'Se connecter' });
    fireEvent.click(submitButton);

    expect(await screen.findByRole('button', { name: 'Connexion…' })).toBeDisabled();
    expect(mockLoginAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ error: null });
    });
  });
});
