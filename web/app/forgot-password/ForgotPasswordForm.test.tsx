import { act, fireEvent, render, screen } from '@testing-library/react';

import { FORGOT_PASSWORD_SUBMITTED_COPY } from '@/lib/copy';

import { ForgotPasswordForm } from './ForgotPasswordForm';
import { forgotPasswordAction } from './actions';

jest.mock('./actions', () => ({
  forgotPasswordAction: jest.fn(),
}));

const mockForgotPasswordAction = forgotPasswordAction as jest.Mock;

describe('ForgotPasswordForm (Phase 8.3, anti-énumération)', () => {
  beforeEach(() => {
    mockForgotPasswordAction.mockReset();
    mockForgotPasswordAction.mockResolvedValue({ submitted: true });
  });

  it('affiche le message générique officiel après soumission, jamais un texte confirmant l’existence du compte', async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien de réinitialisation' }));
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(FORGOT_PASSWORD_SUBMITTED_COPY.message);
    expect(document.body.textContent).not.toContain('existe');
  });
});
