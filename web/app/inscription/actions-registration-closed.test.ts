import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { createClient } from '@/lib/supabase/server';

import { registerAction } from './actions';

// Aucun mock de '@/lib/registration-config' ici, volontairement : ce fichier
// vérifie le comportement RÉEL par défaut (PUBLIC_REGISTRATION_ENABLED =
// false, voir registration-config.ts) — White Alpha est une messagerie
// privée, les comptes sont créés par un administrateur, jamais en
// libre-service (PLAN.md, Phase 8).
const mockSignUp = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/lib/auth-diagnostics', () => ({
  logAuthDiagnostic: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;
const mockLogAuthDiagnostic = logAuthDiagnostic as jest.Mock;

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

const VALID_FIELDS = {
  username: 'test_user',
  email: 'a@example.com',
  password: 'secret123',
  confirmPassword: 'secret123',
  acceptPrivacy: 'on',
};

describe('registerAction — inscription publique désactivée (défaut réel de production)', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockLogAuthDiagnostic.mockReset();
    mockCreateClient.mockResolvedValue({ auth: { signUp: mockSignUp } });
  });

  it('refuse toute soumission, même avec des champs parfaitement valides, sans jamais appeler Supabase', async () => {
    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(result.submitted).toBe(false);
    expect(result.error).toBe('White Alpha est une messagerie privée : les comptes sont créés uniquement par un administrateur.');
  });

  it("ne journalise aucune trace de la tentative (ni email, ni username, ni diagnostic d'inscription)", async () => {
    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockLogAuthDiagnostic).not.toHaveBeenCalled();
  });

  it('refuse avant même de valider les champs (le blocage est la toute première vérification)', async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, username: '', email: '', password: '' }),
    );

    expect(result.error).toBe('White Alpha est une messagerie privée : les comptes sont créés uniquement par un administrateur.');
  });
});
