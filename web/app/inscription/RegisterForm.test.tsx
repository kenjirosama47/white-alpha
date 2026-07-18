import { act, fireEvent, render, screen } from '@testing-library/react';

import { REGISTER_SUBMITTED_COPY } from '@/lib/copy';

import { RegisterForm } from './RegisterForm';
import { registerAction } from './actions';

jest.mock('./actions', () => ({
  registerAction: jest.fn(),
}));

const mockRegisterAction = registerAction as jest.Mock;

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'test_user' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByLabelText(/politique de confidentialité/));
}

describe('RegisterForm (Phase 8.3, anti-énumération)', () => {
  beforeEach(() => {
    mockRegisterAction.mockReset();
  });

  it('nouvelle adresse : affiche le message générique officiel', async () => {
    mockRegisterAction.mockResolvedValue({ error: null, submitted: true });

    render(<RegisterForm />);
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    });

    expect(await screen.findByRole('status')).toHaveTextContent(REGISTER_SUBMITTED_COPY.message);
  });

  it('adresse déjà enregistrée : affiche exactement le même message générique, jamais "User already registered"', async () => {
    mockRegisterAction.mockResolvedValue({ error: null, submitted: true });

    render(<RegisterForm />);
    fillValidForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(REGISTER_SUBMITTED_COPY.message);
    expect(document.body.textContent).not.toContain('User already registered');
    expect(document.body.textContent).not.toContain('existe déjà');
    expect(document.body.textContent).not.toContain('Compte déjà existant');
  });
});
