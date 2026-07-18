import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { createClient } from '@/lib/supabase/server';

import { registerAction } from './actions';

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

describe('registerAction (Phase 8.3, corrigé anti-énumération)', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockLogAuthDiagnostic.mockReset();
    mockCreateClient.mockResolvedValue({ auth: { signUp: mockSignUp } });
  });

  it('nouvelle adresse : appelle signUp avec le username normalisé, jamais de rôle privilégié, résultat générique', async () => {
    mockSignUp.mockResolvedValue({ error: null, data: { session: null } });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'secret123',
      options: { data: { username: 'test_user' }, emailRedirectTo: expect.any(String) },
    });
    const callArgs = mockSignUp.mock.calls[0][0];
    expect(callArgs.options.data).toEqual({ username: 'test_user' });
    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
  });

  it('adresse déjà enregistrée : même résultat générique que pour une nouvelle adresse, jamais "User already registered"', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' }, data: null });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
    expect(JSON.stringify(result)).not.toContain('User already registered');
    expect(JSON.stringify(result)).not.toContain('existe déjà');
  });

  it('adresse nouvelle et adresse déjà enregistrée produisent exactement le même state (aucune divergence exploitable)', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null, data: { session: null } });
    const newAddressResult = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    mockSignUp.mockResolvedValueOnce({ error: { message: 'User already registered' }, data: null });
    const existingAddressResult = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, email: 'deja-inscrit@example.com' }),
    );

    expect(newAddressResult).toEqual(existingAddressResult);
  });

  it('toute autre erreur Supabase (réseau, limite de débit) : même résultat générique, jamais le détail brut', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 20 seconds.' }, data: null });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
  });

  it("nom d'utilisateur invalide : refuse sans appeler Supabase (erreur de saisie, ne révèle rien sur un compte existant)", async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, username: 'A' }),
    );

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
    expect(result.submitted).toBe(false);
  });

  it('mots de passe différents : refuse sans appeler Supabase', async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, confirmPassword: 'autreChose1' }),
    );

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBe('Les deux mots de passe ne correspondent pas.');
  });

  it('politique de confidentialité non acceptée : refuse sans appeler Supabase', async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, acceptPrivacy: '' }),
    );

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('mot de passe trop court : refuse sans appeler Supabase', async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, password: 'abc', confirmPassword: 'abc' }),
    );

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  describe('diagnostic serveur temporaire (jamais de donnée sensible)', () => {
    it('signUp réussi : journalise une catégorie/étape/statut, jamais email ni mot de passe', async () => {
      mockSignUp.mockResolvedValue({ error: null, data: { session: null } });

      await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'supabase_signup_ok', undefined);
      for (const call of mockLogAuthDiagnostic.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.email);
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.password);
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.username);
      }
    });

    it('signUp en erreur : journalise uniquement un statut non sensible, jamais le détail ni les identifiants saisis', async () => {
      mockSignUp.mockResolvedValue({ error: { message: 'User already registered', status: 422 }, data: null });

      await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'supabase_signup_error', 422);
      for (const call of mockLogAuthDiagnostic.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('User already registered');
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.email);
      }
    });

    it('exception inattendue (ex. réseau) : toujours le même message générique au client, diagnostic serveur seulement', async () => {
      mockSignUp.mockRejectedValue(new Error('network down'));

      const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(result).toEqual({ error: null, submitted: true });
      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'unexpected_exception');
    });
  });
});
