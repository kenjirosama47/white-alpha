import { act, fireEvent, render, screen } from '@testing-library/react';

import { MfaSetupClient } from './MfaSetupClient';
import { cancelMfaEnrollmentAction, disableMfaAction, enrollMfaAction, verifyMfaEnrollmentAction } from './actions';

jest.mock('./actions', () => ({
  enrollMfaAction: jest.fn(),
  cancelMfaEnrollmentAction: jest.fn(),
  verifyMfaEnrollmentAction: jest.fn(),
  disableMfaAction: jest.fn(),
}));

const mockEnroll = enrollMfaAction as jest.Mock;
const mockCancel = cancelMfaEnrollmentAction as jest.Mock;
const mockVerify = verifyMfaEnrollmentAction as jest.Mock;
const mockDisable = disableMfaAction as jest.Mock;

const NETWORK_ERROR_MESSAGE = 'Connexion impossible. Vérifie ta connexion et réessaie.';

const ENROLL_SUCCESS = {
  status: 'success' as const,
  factorId: 'factor-1',
  qrCode: 'data:image/svg+xml;utf-8,%3Csvg%2F%3E',
  secret: 'SECRETVALUE',
};

function fillCode(value: string) {
  fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value } });
}

beforeEach(() => {
  mockEnroll.mockReset();
  mockCancel.mockReset();
  mockVerify.mockReset();
  mockDisable.mockReset();
});

describe('MfaSetupClient (Phase MFA — enrôlement TOTP owner)', () => {
  it("owner sans MFA voit l'écran d'enrôlement (bouton d'activation, pas de statut « activée »)", () => {
    render(<MfaSetupClient initialStatus="none" />);

    expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" })).toBeTruthy();
  });

  it('owner déjà enrôlé voit le statut « activée » et un bouton Désactiver, jamais le QR code', () => {
    render(<MfaSetupClient initialStatus="verified" />);

    expect(screen.getByText('Authentification à deux facteurs : activée.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeTruthy();
    expect(screen.queryByAltText(/Code QR/)).toBeNull();
  });

  it("clic sur Activer : démarre l'enrôlement et affiche le QR code (data URI) et le secret manuel", async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    expect(mockEnroll).toHaveBeenCalledTimes(1);
    const qrImage = screen.getByAltText("Code QR d'activation de l'authentification multifacteur") as HTMLImageElement;
    expect(qrImage.src).toContain('data:image/svg+xml');
    expect(screen.getByText('SECRETVALUE')).toBeTruthy();
  });

  it('erreur réseau au démarrage de l’enrôlement : message générique visible, bouton réactivé (jamais un échec silencieux)', async () => {
    mockEnroll.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MfaSetupClient initialStatus="none" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" })).not.toBeDisabled();
  });

  it('facteur déjà enrôlé (concurrence) : bascule directement sur le statut « activée »', async () => {
    mockEnroll.mockResolvedValue({ status: 'already_enrolled' });
    render(<MfaSetupClient initialStatus="none" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    expect(screen.getByText('Authentification à deux facteurs : activée.')).toBeTruthy();
  });

  it('code invalide pendant la vérification : message générique, reste sur l’écran de QR', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockVerify.mockResolvedValue({ status: 'error', error: 'Code incorrect. Réessaie.' });
    render(<MfaSetupClient initialStatus="none" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    fillCode('000000');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    });

    expect(mockVerify).toHaveBeenCalledWith('factor-1', '000000');
    expect(screen.getByRole('alert')).toHaveTextContent('Code incorrect. Réessaie.');
    expect(screen.getByAltText(/Code QR/)).toBeTruthy();
  });

  it('code valide : affiche « MFA activée » et l’accès aux codes d’invitation', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockVerify.mockResolvedValue({ status: 'success' });
    render(<MfaSetupClient initialStatus="none" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    fillCode('123456');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    });

    expect(screen.getByText('Authentification à deux facteurs activée.')).toBeTruthy();
    expect(screen.getByRole('link', { name: "Accéder aux codes d'invitation" })).toBeTruthy();
  });

  it('Annuler pendant l’enrôlement : désenrôle le facteur unverified et revient à l’écran initial', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockCancel.mockResolvedValue({ ok: true });
    render(<MfaSetupClient initialStatus="none" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    });

    expect(mockCancel).toHaveBeenCalledWith('factor-1');
    expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
  });

  it('double clic sur Activer pendant une soumission en cours : enrollMfaAction appelée une seule fois', async () => {
    let resolveEnroll: (value: typeof ENROLL_SUCCESS) => void = () => {};
    mockEnroll.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnroll = resolve;
        }),
    );
    render(<MfaSetupClient initialStatus="none" />);

    const button = screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" });
    fireEvent.click(button);
    await screen.findByRole('button', { name: 'Préparation…' });
    fireEvent.click(screen.getByRole('button', { name: 'Préparation…' }));

    expect(mockEnroll).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveEnroll(ENROLL_SUCCESS);
    });
  });

  it('désactivation : exige un nouveau code, revient au statut « non activée » après succès', async () => {
    mockDisable.mockResolvedValue({ status: 'success' });
    render(<MfaSetupClient initialStatus="verified" />);

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    fillCode('654321');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));
    });

    expect(mockDisable).toHaveBeenCalledWith('654321');
    expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
  });

  it('désactivation refusée par le serveur (ex. code incorrect) : message affiché, reste activée', async () => {
    mockDisable.mockResolvedValue({ status: 'error', error: 'Code incorrect. Réessaie.' });
    render(<MfaSetupClient initialStatus="verified" />);

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    fillCode('000000');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Code incorrect. Réessaie.');
    expect(screen.getByText('Authentification à deux facteurs : activée.')).toBeTruthy();
  });
});
