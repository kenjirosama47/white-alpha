import { createClient } from '@/lib/supabase/server';

import {
  cancelMfaEnrollmentAction,
  disableMfaAction,
  enrollMfaAction,
  getMfaEnrollmentStatusAction,
  verifyMfaEnrollmentAction,
} from './actions';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

const mockGetUser = jest.fn();
const mockSingle = jest.fn();
const mockListFactors = jest.fn();
const mockEnroll = jest.fn();
const mockUnenroll = jest.fn();
const mockChallengeAndVerify = jest.fn();
const mockGetAAL = jest.fn();

function buildClient() {
  return {
    auth: {
      getUser: mockGetUser,
      mfa: {
        listFactors: mockListFactors,
        enroll: mockEnroll,
        unenroll: mockUnenroll,
        challengeAndVerify: mockChallengeAndVerify,
        getAuthenticatorAssuranceLevel: mockGetAAL,
      },
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  };
}

const OWNER_ONLY_DENIED = 'Action réservée au propriétaire du compte.';
const OWNER_AAL2_DENIED = 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.';
const CODE_GENERIC_ERROR = 'Code incorrect. Réessaie.';

beforeEach(() => {
  [mockGetUser, mockSingle, mockListFactors, mockEnroll, mockUnenroll, mockChallengeAndVerify, mockGetAAL].forEach((mock) =>
    mock.mockReset(),
  );
  mockCreateClient.mockResolvedValue(buildClient());
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
  mockSingle.mockResolvedValue({ data: { role: 'owner' } });
  mockUnenroll.mockResolvedValue({ error: null });
  mockListFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
});

describe('enrollMfaAction — utilisateur non connecté / non-owner refusé', () => {
  it('utilisateur non connecté : refuse sans appeler mfa.enroll', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await enrollMfaAction();

    expect(result).toEqual({ status: 'error', error: OWNER_ONLY_DENIED });
    expect(mockEnroll).not.toHaveBeenCalled();
  });

  it('utilisateur connecté mais non-owner : refuse sans appeler mfa.enroll', async () => {
    mockSingle.mockResolvedValue({ data: { role: 'member' } });

    const result = await enrollMfaAction();

    expect(result).toEqual({ status: 'error', error: OWNER_ONLY_DENIED });
    expect(mockEnroll).not.toHaveBeenCalled();
  });
});

describe('enrollMfaAction — owner', () => {
  it('owner sans facteur : démarre un enrôlement, QR en data URI SVG, secret jamais journalisé', async () => {
    mockEnroll.mockResolvedValue({
      data: { id: 'factor-1', totp: { qr_code: '<svg>fake</svg>', secret: 'SECRETVALUE' } },
      error: null,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await enrollMfaAction();

    expect(result).toEqual({
      status: 'success',
      factorId: 'factor-1',
      qrCode: `data:image/svg+xml;base64,${Buffer.from('<svg>fake</svg>', 'utf-8').toString('base64')}`,
      secret: 'SECRETVALUE',
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('owner avec un facteur déjà vérifié : renvoie already_enrolled sans appeler mfa.enroll ni jamais toucher ce facteur vérifié', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f0', status: 'verified' }], all: [{ id: 'f0', factor_type: 'totp', status: 'verified' }] },
      error: null,
    });

    const result = await enrollMfaAction();

    expect(result).toEqual({ status: 'already_enrolled' });
    expect(mockEnroll).not.toHaveBeenCalled();
    // Le court-circuit sur `totp.length > 0` a lieu AVANT le nettoyage des
    // facteurs `unverified` (qui lit `data.all`) : un facteur déjà vérifié
    // n'est donc jamais examiné ni désenrôlé par ce chemin.
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it('owner avec un facteur unverified abandonné : le nettoie avant de créer le nouveau (double clic, tentative abandonnée)', async () => {
    // `listFactors().data.totp` ne contient jamais les facteurs unverified
    // (comportement réel de GoTrue) : seul `data.all` les expose.
    mockListFactors.mockResolvedValue({
      data: { totp: [], all: [{ id: 'stale-factor', factor_type: 'totp', status: 'unverified' }] },
      error: null,
    });
    mockEnroll.mockResolvedValue({
      data: { id: 'factor-2', totp: { qr_code: '<svg/>', secret: 'S2' } },
      error: null,
    });

    await enrollMfaAction();

    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'stale-factor' });
    expect(mockEnroll).toHaveBeenCalled();
  });

  it('nettoyage des facteurs unverified : ne touche jamais un facteur vérifié d’un autre type (défense en profondeur)', async () => {
    mockListFactors.mockResolvedValue({
      data: {
        totp: [],
        all: [
          { id: 'stale-totp', factor_type: 'totp', status: 'unverified' },
          { id: 'verified-other', factor_type: 'phone', status: 'verified' },
        ],
      },
      error: null,
    });
    mockEnroll.mockResolvedValue({
      data: { id: 'factor-3', totp: { qr_code: '<svg/>', secret: 'S3' } },
      error: null,
    });

    await enrollMfaAction();

    expect(mockUnenroll).toHaveBeenCalledTimes(1);
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'stale-totp' });
  });

  it('erreur Supabase lors de listFactors : message générique, jamais le détail technique', async () => {
    mockListFactors.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await enrollMfaAction();

    expect(result).toEqual({ status: 'error', error: 'Une erreur est survenue. Réessaie.' });
  });
});

describe('cancelMfaEnrollmentAction', () => {
  it('non-owner : refuse sans appeler unenroll', async () => {
    mockSingle.mockResolvedValue({ data: { role: 'member' } });

    const result = await cancelMfaEnrollmentAction('factor-1');

    expect(result).toEqual({ ok: false });
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it('owner : désenrôle le facteur unverified en cours', async () => {
    const result = await cancelMfaEnrollmentAction('factor-1');

    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(result).toEqual({ ok: true });
  });
});

describe('verifyMfaEnrollmentAction — code valide active aal2', () => {
  it('code mal formé : refuse sans appeler Supabase', async () => {
    const result = await verifyMfaEnrollmentAction('factor-1', 'abcdef');

    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', error: CODE_GENERIC_ERROR });
  });

  it('code invalide refusé : message générique, jamais le détail Supabase brut', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } });

    const result = await verifyMfaEnrollmentAction('factor-1', '000000');

    expect(result).toEqual({ status: 'error', error: CODE_GENERIC_ERROR });
  });

  it('code valide : vérifie le facteur, la session passe à aal2 côté Supabase', async () => {
    mockChallengeAndVerify.mockResolvedValue({ error: null });

    const result = await verifyMfaEnrollmentAction('factor-1', '123456');

    expect(mockChallengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(result).toEqual({ status: 'success' });
  });

  it('non-owner : refuse sans appeler Supabase', async () => {
    mockSingle.mockResolvedValue({ data: { role: 'member' } });

    const result = await verifyMfaEnrollmentAction('factor-1', '123456');

    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', error: OWNER_ONLY_DENIED });
  });
});

describe('disableMfaAction — aucune désactivation sans aal2 + confirmation + nouveau code', () => {
  it('non-owner : refuse', async () => {
    mockSingle.mockResolvedValue({ data: { role: 'member' } });

    const result = await disableMfaAction('123456');

    expect(result).toEqual({ status: 'error', error: OWNER_ONLY_DENIED });
    expect(mockGetAAL).not.toHaveBeenCalled();
  });

  it('session non aal2 : refuse avant même de regarder le code', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });

    const result = await disableMfaAction('123456');

    expect(result).toEqual({ status: 'error', error: OWNER_AAL2_DENIED });
    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it('aal2 mais code mal formé : refuse sans appeler Supabase', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });

    const result = await disableMfaAction('bad');

    expect(result).toEqual({ status: 'error', error: CODE_GENERIC_ERROR });
    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
  });

  it('aal2, code frais valide : revérifie puis désenrôle', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: 'factor-1', status: 'verified' }] }, error: null });
    mockChallengeAndVerify.mockResolvedValue({ error: null });

    const result = await disableMfaAction('123456');

    expect(mockChallengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(result).toEqual({ status: 'success' });
  });

  it('aal2, code frais incorrect : ne désenrôle jamais', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: 'factor-1', status: 'verified' }] }, error: null });
    mockChallengeAndVerify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } });

    const result = await disableMfaAction('000000');

    expect(mockUnenroll).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', error: CODE_GENERIC_ERROR });
  });

  it('aal2 mais aucun facteur vérifié trouvé (incohérence) : refuse plutôt que de planter', async () => {
    mockGetAAL.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await disableMfaAction('123456');

    expect(mockChallengeAndVerify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', error: 'Une erreur est survenue. Réessaie.' });
  });
});

describe('getMfaEnrollmentStatusAction — accès /membre/admin/invitations autorisé après aal2', () => {
  it('non-owner : refuse', async () => {
    mockSingle.mockResolvedValue({ data: { role: 'member' } });

    const result = await getMfaEnrollmentStatusAction();

    expect(result).toEqual({ ok: false, error: OWNER_ONLY_DENIED });
  });

  it('owner sans facteur vérifié : status none (écran d’enrôlement affiché)', async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await getMfaEnrollmentStatusAction();

    expect(result).toEqual({ ok: true, status: 'none' });
  });

  it('owner avec facteur vérifié : status verified', async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });

    const result = await getMfaEnrollmentStatusAction();

    expect(result).toEqual({ ok: true, status: 'verified' });
  });
});
