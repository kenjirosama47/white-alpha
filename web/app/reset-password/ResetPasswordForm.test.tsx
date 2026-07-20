import { act, fireEvent, render, screen } from '@testing-library/react';

import { ResetPasswordForm } from './ResetPasswordForm';
import { resetPasswordAction } from './actions';

jest.mock('./actions', () => ({
  resetPasswordAction: jest.fn(),
}));

const mockResetPasswordAction = resetPasswordAction as jest.Mock;

describe('ResetPasswordForm (Phase 8.4)', () => {
  beforeEach(() => {
    mockResetPasswordAction.mockReset();
  });

  it('affiche les deux champs requis : Nouveau mot de passe et Confirmer le nouveau mot de passe', () => {
    render(<ResetPasswordForm />);

    const newPassword = screen.getByLabelText('Nouveau mot de passe') as HTMLInputElement;
    const confirmPassword = screen.getByLabelText('Confirmer le mot de passe') as HTMLInputElement;

    expect(newPassword).toBeTruthy();
    expect(confirmPassword).toBeTruthy();
    expect(newPassword.required).toBe(true);
    expect(confirmPassword.required).toBe(true);
  });

  it('chaque champ a son propre bouton afficher/masquer', () => {
    render(<ResetPasswordForm />);

    expect(screen.getAllByRole('button', { name: /Afficher le mot de passe/ })).toHaveLength(2);
  });

  it('mots de passe différents : soumission envoyée à l’action, qui refuse (validation serveur, jamais d’appel Supabase direct depuis le composant)', async () => {
    mockResetPasswordAction.mockResolvedValue({ error: 'Les deux mots de passe ne correspondent pas.' });

    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'motdepasse1' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'autreChose1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Valider le nouveau mot de passe' }));
    });

    expect(await screen.findByText('Les deux mots de passe ne correspondent pas.')).toBeTruthy();
  });

  it('mots de passe identiques : appelle l’action avec les deux valeurs', async () => {
    mockResetPasswordAction.mockResolvedValue({ error: null });

    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'motdepasse1' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'motdepasse1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Valider le nouveau mot de passe' }));
    });

    expect(mockResetPasswordAction).toHaveBeenCalledTimes(1);
    const formData = mockResetPasswordAction.mock.calls[0][1] as FormData;
    expect(formData.get('password')).toBe('motdepasse1');
    expect(formData.get('confirmPassword')).toBe('motdepasse1');
  });

  it('bouton désactivé pendant l’envoi (double soumission bloquée)', async () => {
    let resolveAction: (value: { error: string | null }) => void = () => {};
    mockResetPasswordAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );

    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'motdepasse1' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'motdepasse1' } });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Valider le nouveau mot de passe' }));
    });

    expect(await screen.findByRole('button', { name: 'Mise à jour…' })).toBeDisabled();
    expect(mockResetPasswordAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ error: null });
    });
  });

  it('aucun mot de passe saisi n’apparaît dans le HTML rendu au repos (valeur uniquement dans le champ contrôlé, jamais dupliquée ailleurs)', () => {
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'motdepasseSecret1' } });

    const bodyTextOutsideInputs = Array.from(document.querySelectorAll('body *:not(input)'))
      .map((el) => el.textContent)
      .join(' ');
    expect(bodyTextOutsideInputs).not.toContain('motdepasseSecret1');
  });
});
