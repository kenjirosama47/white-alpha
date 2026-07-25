import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { InvitationAdminClient } from './InvitationAdminClient';
import { generateInvitationCodeAction, listInvitationCodesAction, revokeInvitationCodeAction, type InvitationRow } from './actions';

jest.mock('./actions', () => ({
  generateInvitationCodeAction: jest.fn(),
  listInvitationCodesAction: jest.fn(),
  revokeInvitationCodeAction: jest.fn(),
}));

const mockGenerate = generateInvitationCodeAction as jest.Mock;
const mockList = listInvitationCodesAction as jest.Mock;
const mockRevoke = revokeInvitationCodeAction as jest.Mock;

const ACTIVE_ROW: InvitationRow = {
  id: 'inv-1',
  status: 'active',
  createdAt: '2026-07-01T10:00:00Z',
  expiresAt: '2026-07-08T10:00:00Z',
  usedAt: null,
  usedByUsername: null,
  revokedAt: null,
  maxUses: 1,
  useCount: 0,
  note: 'Pour Alice',
};

const USED_ROW: InvitationRow = {
  id: 'inv-2',
  status: 'used',
  createdAt: '2026-06-01T10:00:00Z',
  expiresAt: '2026-06-08T10:00:00Z',
  usedAt: '2026-06-02T10:00:00Z',
  usedByUsername: 'bob',
  revokedAt: null,
  maxUses: 1,
  useCount: 1,
  note: null,
};

beforeEach(() => {
  mockGenerate.mockReset();
  mockList.mockReset();
  mockRevoke.mockReset();
});

describe('InvitationAdminClient — tableau initial', () => {
  it('affiche les lignes fournies au montage (créé le, statut, expiration, utilisations, invité, note)', () => {
    render(<InvitationAdminClient initialInvitations={[ACTIVE_ROW, USED_ROW]} />);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // en-tête + 2 lignes

    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText('Utilisé')).toBeTruthy();
    expect(screen.getByText('Pour Alice')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText('0 / 1')).toBeTruthy();
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('liste vide : affiche un message plutôt qu’un tableau vide silencieux', () => {
    render(<InvitationAdminClient initialInvitations={[]} />);

    expect(screen.getByText("Aucun code d'invitation pour l'instant.")).toBeTruthy();
  });
});

describe('InvitationAdminClient — génération', () => {
  it('succès : révèle le code une seule fois et rafraîchit la liste depuis le serveur', async () => {
    mockGenerate.mockResolvedValue({
      status: 'success',
      code: 'WA-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG',
      expiresAt: '2026-07-15T00:00:00Z',
      maxUses: 1,
    });
    mockList.mockResolvedValue({ ok: true, invitations: [ACTIVE_ROW] });

    render(<InvitationAdminClient initialInvitations={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Générer un code' }));
    });

    expect(await screen.findByText('WA-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG')).toBeTruthy();
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Pour Alice')).toBeTruthy();
  });

  it('échec : affiche le message générique, jamais d’encart de révélation', async () => {
    mockGenerate.mockResolvedValue({ status: 'error', error: 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.' });

    render(<InvitationAdminClient initialInvitations={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Générer un code' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Action réservée au propriétaire');
    expect(screen.queryByRole('status')).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('InvitationAdminClient — révocation', () => {
  it('succès : révoque puis rafraîchit la liste (le statut vient du serveur, jamais deviné côté client)', async () => {
    mockRevoke.mockResolvedValue({ ok: true });
    mockList.mockResolvedValue({ ok: true, invitations: [{ ...ACTIVE_ROW, status: 'revoked', revokedAt: '2026-07-02T00:00:00Z' }] });

    render(<InvitationAdminClient initialInvitations={[ACTIVE_ROW]} />);

    const row = screen.getByText('Pour Alice').closest('tr')!;
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'Révoquer' }));
    });

    expect(mockRevoke).toHaveBeenCalledWith('inv-1');
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Révoqué')).toBeTruthy();
  });

  it('échec : affiche le message générique de la liste, sans faire disparaître la ligne', async () => {
    mockRevoke.mockResolvedValue({ ok: false, error: 'Action réservée au propriétaire du compte, avec vérification multifacteur (MFA) à jour.' });

    render(<InvitationAdminClient initialInvitations={[ACTIVE_ROW]} />);

    const row = screen.getByText('Pour Alice').closest('tr')!;
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'Révoquer' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Action réservée au propriétaire');
    expect(screen.getByText('Actif')).toBeTruthy();
  });

  it('un code non actif (utilisé/expiré/révoqué) a son bouton "Révoquer" désactivé', () => {
    render(<InvitationAdminClient initialInvitations={[USED_ROW]} />);

    const row = screen.getByText('bob').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Révoquer' })).toBeDisabled();
  });
});
