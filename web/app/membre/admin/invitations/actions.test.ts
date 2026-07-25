import { createClient } from '@/lib/supabase/server';

import { generateInvitationCodeAction, listInvitationCodesAction, revokeInvitationCodeAction } from './actions';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

const ADMIN_ACTION_DENIED = 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.';

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  Object.entries(entries).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});

describe('listInvitationCodesAction', () => {
  it('renvoie la liste mappée (snake_case -> camelCase) en cas de succès', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'inv-1',
          status: 'active',
          created_at: '2026-07-01T00:00:00Z',
          expires_at: '2026-07-08T00:00:00Z',
          used_at: null,
          used_by_username: null,
          revoked_at: null,
          max_uses: 1,
          use_count: 0,
          note: 'Pour Alice',
        },
      ],
      error: null,
    });

    const result = await listInvitationCodesAction();

    expect(mockRpc).toHaveBeenCalledWith('admin_list_invitation_codes');
    expect(result).toEqual({
      ok: true,
      invitations: [
        {
          id: 'inv-1',
          status: 'active',
          createdAt: '2026-07-01T00:00:00Z',
          expiresAt: '2026-07-08T00:00:00Z',
          usedAt: null,
          usedByUsername: null,
          revokedAt: null,
          maxUses: 1,
          useCount: 0,
          note: 'Pour Alice',
        },
      ],
    });
  });

  it('renvoie une liste vide si data est null (jamais une exception)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listInvitationCodesAction();

    expect(result).toEqual({ ok: true, invitations: [] });
  });

  it('refusé (non owner / aal2 non franchi) : message générique unique, jamais le détail Postgres', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Accès réservé au propriétaire, avec authentification multifacteur vérifiée.' } });

    const result = await listInvitationCodesAction();

    expect(result).toEqual({ ok: false, error: ADMIN_ACTION_DENIED });
  });
});

describe('generateInvitationCodeAction', () => {
  it('génère avec les paramètres saisis, renvoie le code en clair une seule fois', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'inv-2', code: 'WA-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG', expires_at: '2026-07-15T00:00:00Z', max_uses: 3, created_at: '2026-07-08T00:00:00Z' }],
      error: null,
    });

    const result = await generateInvitationCodeAction(
      { status: 'idle' },
      formData({ expiresInDays: '14', maxUses: '3', note: 'Pour Bob' }),
    );

    expect(mockRpc).toHaveBeenCalledWith('admin_create_invitation_code', {
      p_expires_in_days: 14,
      p_max_uses: 3,
      p_note: 'Pour Bob',
    });
    expect(result).toEqual({
      status: 'success',
      code: 'WA-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG',
      expiresAt: '2026-07-15T00:00:00Z',
      maxUses: 3,
    });
  });

  it('note vide (chaîne blanche) : transmise comme null, jamais une chaîne vide', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'inv-3', code: 'WA-CODE', expires_at: '2026-07-15T00:00:00Z', max_uses: 1, created_at: '2026-07-08T00:00:00Z' }],
      error: null,
    });

    await generateInvitationCodeAction({ status: 'idle' }, formData({ expiresInDays: '7', maxUses: '1', note: '   ' }));

    expect(mockRpc).toHaveBeenCalledWith('admin_create_invitation_code', {
      p_expires_in_days: 7,
      p_max_uses: 1,
      p_note: null,
    });
  });

  it('champs non numériques (formulaire trafiqué) : replie sur les valeurs par défaut (7 jours, 1 utilisation), jamais NaN transmis', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'inv-4', code: 'WA-CODE', expires_at: '2026-07-15T00:00:00Z', max_uses: 1, created_at: '2026-07-08T00:00:00Z' }],
      error: null,
    });

    await generateInvitationCodeAction({ status: 'idle' }, formData({ expiresInDays: 'abc', maxUses: 'xyz', note: '' }));

    expect(mockRpc).toHaveBeenCalledWith('admin_create_invitation_code', {
      p_expires_in_days: 7,
      p_max_uses: 1,
      p_note: null,
    });
  });

  it('refusé côté serveur (non owner / aal2 / bornes invalides) : message générique unique', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Durée de validité invalide (1 à 365 jours).' } });

    const result = await generateInvitationCodeAction({ status: 'idle' }, formData({ expiresInDays: '9999', maxUses: '1', note: '' }));

    expect(result).toEqual({ status: 'error', error: ADMIN_ACTION_DENIED });
  });

  it('data vide (tableau sans ligne) : traité comme un échec, jamais un succès avec un code undefined', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await generateInvitationCodeAction({ status: 'idle' }, formData({ expiresInDays: '7', maxUses: '1', note: '' }));

    expect(result).toEqual({ status: 'error', error: ADMIN_ACTION_DENIED });
  });
});

describe('revokeInvitationCodeAction', () => {
  it('révoque avec succès', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await revokeInvitationCodeAction('inv-1');

    expect(mockRpc).toHaveBeenCalledWith('admin_revoke_invitation_code', { p_id: 'inv-1' });
    expect(result).toEqual({ ok: true });
  });

  it('refusé (déjà révoqué, introuvable, ou non owner/aal2) : message générique unique', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Code introuvable ou déjà révoqué.' } });

    const result = await revokeInvitationCodeAction('inv-1');

    expect(result).toEqual({ ok: false, error: ADMIN_ACTION_DENIED });
  });
});
