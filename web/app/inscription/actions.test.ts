import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { createClient } from '@/lib/supabase/server';

import { registerAction } from './actions';

const mockSignUp = jest.fn();
const mockUpdateUser = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/lib/auth-diagnostics', () => ({
  logAuthDiagnostic: jest.fn(),
}));

const mockHashRequestIp = jest.fn();
const mockInvitationCodeHashPrefix = jest.fn();
const mockHashInvitationCode = jest.fn();
jest.mock('@/lib/invitation-rate-limit', () => ({
  hashRequestIp: (...args: unknown[]) => mockHashRequestIp(...args),
  invitationCodeHashPrefix: (...args: unknown[]) => mockInvitationCodeHashPrefix(...args),
  hashInvitationCode: (...args: unknown[]) => mockHashInvitationCode(...args),
}));

const mockCreateClient = createClient as jest.Mock;
const mockLogAuthDiagnostic = logAuthDiagnostic as jest.Mock;

// Message UNIQUE pour les 6 cas de blocage liés au code (absent, inconnu,
// expiré, révoqué, déjà utilisé, rate limiting) — voir INVITATION_BLOCKED_COPY.
const BLOCKED_MESSAGE = "Impossible de finaliser l'inscription. Vérifie les informations saisies et réessaie.";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

const VALID_FIELDS = {
  invitationCode: 'WA-7K9P-X4DM-Q8TZ-ABCD-EFGH-JKMN-PQ',
  username: 'test_user',
  email: 'a@example.com',
  password: 'secret123',
  confirmPassword: 'secret123',
  acceptPrivacy: 'on',
};

beforeEach(() => {
  mockSignUp.mockReset();
  mockUpdateUser.mockReset();
  mockRpc.mockReset();
  mockLogAuthDiagnostic.mockReset();
  mockHashRequestIp.mockReset();
  mockInvitationCodeHashPrefix.mockReset();
  mockHashInvitationCode.mockReset();

  mockHashRequestIp.mockResolvedValue('fake-ip-hash');
  mockInvitationCodeHashPrefix.mockReturnValue('fake-code-prefix');
  mockHashInvitationCode.mockReturnValue('fake-code-hash');
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
    if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: true, error: null });
    if (fn === 'record_invitation_attempt') return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  });
  mockCreateClient.mockResolvedValue({
    auth: { signUp: mockSignUp, updateUser: mockUpdateUser },
    rpc: mockRpc,
  });
});

describe('registerAction — validations de formulaire (avant tout appel réseau)', () => {
  it('code d’invitation absent : même message générique unique, aucun appel Supabase', async () => {
    const result = await registerAction(
      { error: null, submitted: false },
      formData({ ...VALID_FIELDS, invitationCode: '' }),
    );

    expect(result.error).toBe(BLOCKED_MESSAGE);
    expect(result.submitted).toBe(false);
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("nom d'utilisateur invalide : refuse sans appeler Supabase", async () => {
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
});

describe('registerAction — rate limiting (même message générique unique)', () => {
  it('bloqué par is_invitation_rate_limited : message générique, aucun appel signUp', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.submitted).toBe(false);
    expect(result.error).toBe(BLOCKED_MESSAGE);
  });

  it('la vérification du rate limit échoue (erreur RPC) : échec fermé, même message générique', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: null, error: { message: 'network' } });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBe(BLOCKED_MESSAGE);
  });

  it('secret de hachage IP indisponible (hashRequestIp lève) : échec fermé, même message générique', async () => {
    mockHashRequestIp.mockRejectedValue(new Error('INVITATION_IP_HASH_SECRET manquant.'));

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(result.error).toBe(BLOCKED_MESSAGE);
  });

  it('non bloqué : enregistre la tentative réussie après un signUp réussi', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockRpc).toHaveBeenCalledWith('record_invitation_attempt', {
      p_ip_hash: 'fake-ip-hash',
      p_code_hash_prefix: 'fake-code-prefix',
      p_success: true,
    });
  });
});

/**
 * Ces 4 cas (introuvable/inconnu, expiré, révoqué, déjà utilisé) sont
 * TOUS mappés sur `is_invitation_code_usable` renvoyant `false` : depuis
 * `registerAction`, ils sont strictement indiscernables — c'est précisément
 * la garantie testée ici. La distinction réelle entre ces 4 raisons vit
 * uniquement côté SQL (`is_invitation_code_usable`, testée séparément par
 * `supabase/tests/database/phase8_9_invitation_codes_test.sql`), jamais ici.
 */
describe('registerAction — vérification du code (pré-check en lecture seule, même message générique unique)', () => {
  it('code invalide/inconnu (introuvable en base) : message générique, aucun appel signUp, code non consommé', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: BLOCKED_MESSAGE, submitted: false });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('code expiré : même message générique, aucun appel signUp', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: BLOCKED_MESSAGE, submitted: false });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('code révoqué : même message générique, aucun appel signUp', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: BLOCKED_MESSAGE, submitted: false });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('code déjà utilisé (use_count = max_uses) : même message générique, aucun appel signUp', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: BLOCKED_MESSAGE, submitted: false });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('la vérification d’utilisabilité échoue (erreur RPC) : échec fermé, même message générique', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: null, error: { message: 'network' } });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: BLOCKED_MESSAGE, submitted: false });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('code valide (utilisable) : signUp est appelé', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockRpc).toHaveBeenCalledWith('is_invitation_code_usable', { p_code_hash: 'fake-code-hash' });
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('enregistre une tentative échouée quand le code n’est pas utilisable (rate limiting alimenté même sans appel signUp)', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
      if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockRpc).toHaveBeenCalledWith('record_invitation_attempt', {
      p_ip_hash: 'fake-ip-hash',
      p_code_hash_prefix: 'fake-code-prefix',
      p_success: false,
    });
  });
});

describe('registerAction — signUp avec code d’invitation valide', () => {
  it('transmet le code d’invitation et le username, jamais de rôle privilégié', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'secret123',
      options: {
        data: { username: 'test_user', invitation_code: VALID_FIELDS.invitationCode },
        emailRedirectTo: expect.any(String),
      },
    });
    const callArgs = mockSignUp.mock.calls[0][0];
    expect(callArgs.options.data).toEqual({ username: 'test_user', invitation_code: VALID_FIELDS.invitationCode });
  });

  it(
    'signUp échoue malgré un code jugé utilisable (rare course avec une inscription concurrente) : ' +
      'succès simulé, jamais le message de blocage ni le détail brut — même traitement anti-énumération que les autres erreurs signUp',
    async () => {
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'Database error saving new user', status: 500 },
      });

      const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(result.submitted).toBe(true);
      expect(result.error).toBeNull();
      expect(JSON.stringify(result)).not.toContain('Database error saving new user');
    },
  );

  it('adresse déjà enregistrée (erreur non liée au code) : succès simulé, anti-énumération inchangée', async () => {
    mockSignUp.mockResolvedValue({ data: null, error: { message: 'User already registered' } });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
    expect(JSON.stringify(result)).not.toContain('User already registered');
  });

  it('succès avec session immédiate : efface le code brut de user_metadata (best-effort)', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { invitation_code: null } });
  });

  it('succès sans session (confirmation email requise) : n’appelle jamais updateUser', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('updateUser échoue : reste best-effort, l’inscription reste un succès', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    mockUpdateUser.mockRejectedValue(new Error('network'));

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
  });

  it('toute autre erreur Supabase (réseau, limite de débit) : même résultat générique, jamais le détail brut', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'For security purposes, you can only request this after 20 seconds.' },
    });

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
  });

  it('erreur réseau distincte (exception levée par signUp, pas un objet error) : même message générique de succès simulé', async () => {
    mockSignUp.mockRejectedValue(new Error('network down'));

    const result = await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

    expect(result).toEqual({ error: null, submitted: true });
  });

  describe('diagnostic serveur temporaire (jamais de donnée sensible)', () => {
    it('signUp réussi : journalise une catégorie/étape/statut, jamais email, mot de passe ni code', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

      await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'supabase_signup_ok');
      for (const call of mockLogAuthDiagnostic.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.email);
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.password);
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.username);
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.invitationCode);
      }
    });

    it('code jugé inutilisable (pré-check) : journalise une étape non sensible, jamais le code', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'is_invitation_rate_limited') return Promise.resolve({ data: false, error: null });
        if (fn === 'is_invitation_code_usable') return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'invitation_code_unusable');
      for (const call of mockLogAuthDiagnostic.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.invitationCode);
      }
    });

    it('signUp échoue (statut non sensible uniquement) : jamais error.message journalisé, jamais le code', async () => {
      mockSignUp.mockResolvedValue({ data: null, error: { message: "Code d'invitation invalide.", status: 500 } });

      await registerAction({ error: null, submitted: false }, formData(VALID_FIELDS));

      expect(mockLogAuthDiagnostic).toHaveBeenCalledWith('signup', 'supabase_signup_error', 500);
      for (const call of mockLogAuthDiagnostic.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(VALID_FIELDS.invitationCode);
        expect(JSON.stringify(call)).not.toContain("Code d'invitation invalide.");
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
