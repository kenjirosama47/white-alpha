import { supabase } from '@/lib/supabase';
import { enrollTotpFactor, getMfaStatus, unenrollTotpFactor, verifyTotpEnrollment } from '@/lib/mfa';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: jest.fn(),
        challengeAndVerify: jest.fn(),
        unenroll: jest.fn(),
        listFactors: jest.fn(),
        getAuthenticatorAssuranceLevel: jest.fn(),
      },
    },
  },
}));

const mockEnroll = supabase.auth.mfa.enroll as jest.Mock;
const mockChallengeAndVerify = supabase.auth.mfa.challengeAndVerify as jest.Mock;
const mockUnenroll = supabase.auth.mfa.unenroll as jest.Mock;
const mockListFactors = supabase.auth.mfa.listFactors as jest.Mock;
const mockGetAAL = supabase.auth.mfa.getAuthenticatorAssuranceLevel as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMfaStatus', () => {
  it('retourne le niveau AAL courant/suivant et les facteurs TOTP déjà vérifiés uniquement', async () => {
    mockGetAAL.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: 'factor-1', factor_type: 'totp', status: 'verified', created_at: 't', updated_at: 't' }] },
      error: null,
    });

    const result = await getMfaStatus();

    expect(result).toEqual({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
      verifiedFactors: [{ id: 'factor-1', createdAt: 't' }],
    });
  });

  it("niveau absent (currentLevel/nextLevel null) : traité comme 'aal1' par défaut", async () => {
    mockGetAAL.mockResolvedValue({
      data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });

    const result = await getMfaStatus();

    expect(result.currentLevel).toBe('aal1');
    expect(result.nextLevel).toBe('aal1');
  });

  it('session expirée : erreur générique française, jamais le message technique brut', async () => {
    mockGetAAL.mockResolvedValue({ data: null, error: { message: 'JWT expired', status: 401 } });
    mockListFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });

    await expect(getMfaStatus()).rejects.toThrow('Session expirée. Reconnecte-toi.');
  });
});

describe('enrollTotpFactor', () => {
  it("construit une data URI SVG à partir du qr_code brut retourné par Supabase (jamais journalisé)", async () => {
    mockEnroll.mockResolvedValue({
      data: {
        id: 'factor-1',
        type: 'totp',
        totp: { qr_code: '<svg>test</svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' },
      },
      error: null,
    });

    const result = await enrollTotpFactor();

    expect(mockEnroll).toHaveBeenCalledWith({ factorType: 'totp' });
    expect(result.factorId).toBe('factor-1');
    expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.qrCodeDataUri).toBe(`data:image/svg+xml;utf-8,${encodeURIComponent('<svg>test</svg>')}`);
  });

  it('échec : erreur française générique', async () => {
    mockEnroll.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(enrollTotpFactor()).rejects.toThrow(
      "Impossible de démarrer l'activation de l'authentification multifacteur.",
    );
  });
});

describe('verifyTotpEnrollment', () => {
  it('appelle challengeAndVerify avec factorId/code, aucune erreur en cas de succès', async () => {
    mockChallengeAndVerify.mockResolvedValue({ data: {}, error: null });

    await expect(verifyTotpEnrollment('factor-1', '123456')).resolves.toBeUndefined();
    expect(mockChallengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
  });

  it('code TOTP invalide : message français explicite', async () => {
    mockChallengeAndVerify.mockResolvedValue({
      data: null,
      error: { message: 'Invalid TOTP code entered' },
    });

    await expect(verifyTotpEnrollment('factor-1', '000000')).rejects.toThrow(
      "Code incorrect. Vérifie l'heure de ton appareil et réessaie.",
    );
  });

  it('trop de tentatives : message français explicite', async () => {
    mockChallengeAndVerify.mockResolvedValue({
      data: null,
      error: { message: 'For security purposes, you can only request this after 30 seconds.' },
    });

    await expect(verifyTotpEnrollment('factor-1', '123456')).rejects.toThrow(
      'Trop de tentatives : merci de patienter quelques instants avant de réessayer.',
    );
  });
});

describe('unenrollTotpFactor', () => {
  it('appelle unenroll avec factorId, aucune erreur en cas de succès', async () => {
    mockUnenroll.mockResolvedValue({ data: { id: 'factor-1' }, error: null });

    await expect(unenrollTotpFactor('factor-1')).resolves.toBeUndefined();
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });

  it('échec : erreur française générique', async () => {
    mockUnenroll.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(unenrollTotpFactor('factor-1')).rejects.toThrow('Impossible de désactiver ce facteur pour le moment.');
  });
});
