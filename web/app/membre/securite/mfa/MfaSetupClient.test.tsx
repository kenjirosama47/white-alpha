import { act, fireEvent, render, screen } from '@testing-library/react';

import { MfaSetupClient } from './MfaSetupClient';
import { cancelMfaEnrollmentAction, disableMfaAction, enrollMfaAction, verifyMfaEnrollmentAction } from './actions';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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
  qrCode: `data:image/svg+xml;base64,${Buffer.from('<svg/>', 'utf-8').toString('base64')}`,
  secret: 'SECRETVALUE',
};

function fillCode(value: string) {
  fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value } });
}

async function startEnrollment() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
  });
}

/** Simule le chemin principal : « j'ai scanné », révèle uniquement le champ de code. */
async function openCodeForm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Scanner avec mon téléphone' }));
  });
}

/** Simule le repli : « Je ne peux pas scanner », révèle le code manuel (toujours masqué par défaut) et le champ de code. */
async function openManualFallback() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Je ne peux pas scanner' }));
  });
}

beforeEach(() => {
  mockEnroll.mockReset();
  mockCancel.mockReset();
  mockVerify.mockReset();
  mockDisable.mockReset();
  mockPush.mockReset();
});

describe('MfaSetupClient (parcours TOTP simplifié — enrôlement owner)', () => {
  it("owner sans MFA voit l'écran d'enrôlement (bouton d'activation, pas de statut « activée »)", () => {
    render(<MfaSetupClient initialStatus="none" />);

    expect(screen.getByText('Sécuriser mon compte')).toBeTruthy();
    expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" })).toBeTruthy();
  });

  it('owner déjà enrôlé voit le statut « activée » et un bouton Désactiver, jamais le QR code', () => {
    render(<MfaSetupClient initialStatus="verified" />);

    expect(screen.getByText('Authentification à deux facteurs : activée.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeTruthy();
    expect(screen.queryByAltText(/Code QR/)).toBeNull();
  });

  it('clic sur Activer : le QR code est visible immédiatement, avant tout choix (jamais une chaîne SVG brute)', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);

    await startEnrollment();

    expect(mockEnroll).toHaveBeenCalledTimes(1);
    const qrImage = screen.getByAltText(/Code QR/) as HTMLImageElement;
    expect(qrImage.src).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(qrImage.src).not.toContain('<svg');
    expect(screen.getByRole('note')).toHaveTextContent(/ne partage jamais/i);
    expect(screen.getByRole('button', { name: 'Scanner avec mon téléphone' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Je ne peux pas scanner' })).toBeTruthy();
  });

  it("cite uniquement Google Authenticator, Microsoft Authenticator et un gestionnaire compatible TOTP, avec le mode d'emploi en trois étapes", async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();

    expect(screen.getByText(/Google Authenticator/)).toBeTruthy();
    expect(screen.getByText(/Microsoft Authenticator/)).toBeTruthy();
    expect(screen.getByText(/gestionnaire de mots de passe compatible/i)).toBeTruthy();
    expect(screen.getByText("Ouvre l'application d'authentification sur ton téléphone.")).toBeTruthy();
    expect(screen.getByText('Appuie sur + puis scanne le QR code.')).toBeTruthy();
    expect(screen.getByText('Saisis ici le code à 6 chiffres affiché.')).toBeTruthy();
  });

  it('code manuel masqué par défaut : ni le secret ni même le repli ne sont dans le DOM tant que « Je ne peux pas scanner » n’a pas été choisi', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);

    await startEnrollment();

    expect(screen.queryByText('SECRETVALUE')).toBeNull();
    expect(screen.queryByText(/^•+$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Afficher le code manuel' })).toBeNull();
  });

  it('« Je ne peux pas scanner » révèle le repli code manuel, masqué par défaut derrière son propre bouton', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();

    await openManualFallback();

    expect(screen.queryByText('SECRETVALUE')).toBeNull();
    expect(screen.getByText(/^•+$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Afficher le code manuel' })).toBeTruthy();
  });

  it('bouton « Afficher le code manuel » révèle le secret, puis « Masquer » le cache à nouveau', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();
    await openManualFallback();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le code manuel' }));
    expect(screen.getByText('SECRETVALUE')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le code manuel' }));
    expect(screen.queryByText('SECRETVALUE')).toBeNull();
    expect(screen.getByText(/^•+$/)).toBeTruthy();
  });

  it('« Scanner avec mon téléphone » révèle le champ de code sans jamais afficher le secret manuel', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();

    await openCodeForm();

    expect(screen.getByLabelText('Code à 6 chiffres')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Terminer l'activation" })).toBeTruthy();
    expect(screen.queryByText('SECRETVALUE')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Afficher le code manuel' })).toBeNull();
  });

  it('erreur réseau au démarrage de l’enrôlement : message générique visible, bouton réactivé (jamais un échec silencieux)', async () => {
    mockEnroll.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MfaSetupClient initialStatus="none" />);

    await startEnrollment();

    expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" })).not.toBeDisabled();
  });

  it('facteur déjà enrôlé (concurrence) : bascule directement sur le statut « activée »', async () => {
    mockEnroll.mockResolvedValue({ status: 'already_enrolled' });
    render(<MfaSetupClient initialStatus="none" />);

    await startEnrollment();

    expect(screen.getByText('Authentification à deux facteurs : activée.')).toBeTruthy();
  });

  it('mauvais code refusé pendant la vérification : message générique, reste sur l’écran de QR, aal2 non franchi', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockVerify.mockResolvedValue({ status: 'error', error: 'Code incorrect. Réessaie.' });
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();
    await openCodeForm();

    fillCode('000000');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Terminer l'activation" }));
    });

    expect(mockVerify).toHaveBeenCalledWith('factor-1', '000000');
    expect(screen.getByRole('alert')).toHaveTextContent('Code incorrect. Réessaie.');
    expect(screen.getByAltText(/Code QR/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('code valide : franchit aal2 côté serveur (verifyMfaEnrollmentAction), affiche un message de réussite clair', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockVerify.mockResolvedValue({ status: 'success' });
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();
    await openCodeForm();

    fillCode('123456');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Terminer l'activation" }));
    });

    expect(mockVerify).toHaveBeenCalledWith('factor-1', '123456');
    expect(screen.getByText(/Compte sécurisé/)).toBeTruthy();
    expect(screen.queryByText('SECRETVALUE')).toBeNull();
  });

  it('après activation réussie, redirige automatiquement vers /membre/admin/invitations', async () => {
    jest.useFakeTimers();
    try {
      mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
      mockVerify.mockResolvedValue({ status: 'success' });
      render(<MfaSetupClient initialStatus="none" />);
      await startEnrollment();
      await openCodeForm();
      fillCode('123456');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: "Terminer l'activation" }));
      });

      expect(mockPush).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1500);
      });

      expect(mockPush).toHaveBeenCalledWith('/membre/admin/invitations');
      expect(mockPush).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('Annuler pendant l’enrôlement : désenrôle le facteur unverified (considéré compromis) et efface le secret de l’état', async () => {
    mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
    mockCancel.mockResolvedValue({ ok: true });
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();
    await openManualFallback();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le code manuel' }));
    expect(screen.getByText('SECRETVALUE')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    });

    expect(mockCancel).toHaveBeenCalledWith('factor-1');
    expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
    expect(screen.queryByText('SECRETVALUE')).toBeNull();
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

  it('nouveau facteur différent après redémarrage : un nouvel enrôlement après annulation génère et affiche un secret différent, jamais l’ancien réutilisé', async () => {
    mockEnroll.mockResolvedValueOnce(ENROLL_SUCCESS);
    mockCancel.mockResolvedValue({ ok: true });
    render(<MfaSetupClient initialStatus="none" />);
    await startEnrollment();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    });

    const SECOND_ENROLL = { ...ENROLL_SUCCESS, factorId: 'factor-2', secret: 'DIFFERENTSECRET' };
    mockEnroll.mockResolvedValueOnce(SECOND_ENROLL);
    await startEnrollment();
    await openManualFallback();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le code manuel' }));

    expect(screen.getByText('DIFFERENTSECRET')).toBeTruthy();
    expect(screen.queryByText('SECRETVALUE')).toBeNull();
  });

  it('expiration automatique de l’écran d’enrôlement : désenrôle le facteur, efface le secret, affiche un avis', async () => {
    jest.useFakeTimers();
    try {
      mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
      mockCancel.mockResolvedValue({ ok: true });
      render(<MfaSetupClient initialStatus="none" />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: "Activer l'authentification à deux facteurs" }));
      });

      await act(async () => {
        jest.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(mockCancel).toHaveBeenCalledWith('factor-1');
      expect(screen.getByText('Authentification à deux facteurs : non activée.')).toBeTruthy();
      expect(screen.queryByText('SECRETVALUE')).toBeNull();
      expect(screen.getByText(/expiré/i)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('aucune fuite du secret, du QR ni du code saisi dans console.* à aucune étape (activation, révélation, vérification, annulation)', async () => {
    const consoleSpies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      mockEnroll.mockResolvedValue(ENROLL_SUCCESS);
      mockVerify.mockResolvedValue({ status: 'error', error: 'Code incorrect. Réessaie.' });
      mockCancel.mockResolvedValue({ ok: true });
      render(<MfaSetupClient initialStatus="none" />);

      await startEnrollment();
      await openManualFallback();
      fireEvent.click(screen.getByRole('button', { name: 'Afficher le code manuel' }));
      fillCode('000000');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: "Terminer l'activation" }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      });

      for (const spy of consoleSpies) {
        for (const call of spy.mock.calls) {
          const serialized = call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
          expect(serialized).not.toContain('SECRETVALUE');
          expect(serialized).not.toContain('<svg');
          expect(serialized).not.toContain('000000');
        }
      }
    } finally {
      consoleSpies.forEach((spy) => spy.mockRestore());
    }
  });

  it('désactivation : exige un nouveau code, revient au statut « non activée » après succès (jamais un facteur vérifié supprimé sans ce parcours)', async () => {
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

  it('désactivation refusée par le serveur (ex. code incorrect) : message affiché, reste activée (le facteur vérifié n’est jamais supprimé côté client)', async () => {
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
