import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMfa } from '@/hooks/use-mfa';
import { enrollTotpFactor, getMfaStatus, unenrollTotpFactor, verifyTotpEnrollment } from '@/lib/mfa';
import type { MfaStatus, TotpEnrollment } from '@/lib/mfa';

jest.mock('@/lib/mfa', () => ({
  getMfaStatus: jest.fn(),
  enrollTotpFactor: jest.fn(),
  verifyTotpEnrollment: jest.fn(),
  unenrollTotpFactor: jest.fn(),
}));

const statusAal1Unconfigured: MfaStatus = {
  currentLevel: 'aal1',
  nextLevel: 'aal1',
  verifiedFactors: [],
};

const statusAal2Configured: MfaStatus = {
  currentLevel: 'aal2',
  nextLevel: 'aal2',
  verifiedFactors: [{ id: 'factor-1', createdAt: '2026-07-17T00:00:00.000Z' }],
};

const enrollment: TotpEnrollment = {
  factorId: 'factor-1',
  qrCodeDataUri: 'data:image/svg+xml;utf-8,%3Csvg%3E%3C%2Fsvg%3E',
  secret: 'JBSWY3DPEHPK3PXP',
};

// Même constat que use-network-status.test.tsx/use-profile-editor.test.ts : un
// act() synchrone ne garantit pas le hop d'effet interne à renderHook.
async function run(fn: () => unknown) {
  await act(async () => {
    await fn();
    await Promise.resolve();
  });
}

describe('useMfa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('premier chargement : isLoading true puis le statut apparaît', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);

    const { result } = await renderHook(() => useMfa());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual(statusAal1Unconfigured);
    expect(result.current.error).toBeNull();
  });

  it('session expirée au premier chargement : message français, possibilité de réessayer via refresh', async () => {
    (getMfaStatus as jest.Mock).mockRejectedValueOnce(new Error('Session expirée. Reconnecte-toi.'));

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.error).toBe('Session expirée. Reconnecte-toi.'));

    (getMfaStatus as jest.Mock).mockResolvedValueOnce(statusAal1Unconfigured);
    await run(() => result.current.refresh());

    await waitFor(() => expect(result.current.status).toEqual(statusAal1Unconfigured));
    expect(result.current.error).toBeNull();
  });

  it('startEnrollment expose le QR code et le secret, jamais avant l’appel', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    (enrollTotpFactor as jest.Mock).mockResolvedValue(enrollment);

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enrollment).toBeNull();

    await run(() => result.current.startEnrollment());

    expect(result.current.enrollment).toEqual(enrollment);
    expect(result.current.enrollmentError).toBeNull();
  });

  it('startEnrollment : erreur affichée, enrollment reste null', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    (enrollTotpFactor as jest.Mock).mockRejectedValue(new Error('Une erreur est survenue. Réessaie.'));

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await run(() => result.current.startEnrollment());

    expect(result.current.enrollment).toBeNull();
    expect(result.current.enrollmentError).toBe('Une erreur est survenue. Réessaie.');
  });

  it('bloque le double-clic : un second startEnrollment() pendant que le premier est en cours ne relance pas l’appel', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    let resolveEnroll: (value: TotpEnrollment) => void = () => {};
    (enrollTotpFactor as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveEnroll = resolve;
      }),
    );

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await run(() => {
      result.current.startEnrollment();
      result.current.startEnrollment();
    });

    expect(enrollTotpFactor).toHaveBeenCalledTimes(1);

    await run(() => resolveEnroll(enrollment));
    expect(result.current.enrollment).toEqual(enrollment);
  });

  it('confirmEnrollment (navigation aal1 → MFA → aal2) : succès, enrollment se ferme, le statut passe à aal2', async () => {
    (getMfaStatus as jest.Mock)
      .mockResolvedValueOnce(statusAal1Unconfigured)
      .mockResolvedValueOnce(statusAal2Configured);
    (enrollTotpFactor as jest.Mock).mockResolvedValue(enrollment);
    (verifyTotpEnrollment as jest.Mock).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.status?.currentLevel).toBe('aal1'));

    await run(() => result.current.startEnrollment());
    expect(result.current.enrollment).toEqual(enrollment);

    let success = false;
    await run(async () => {
      success = await result.current.confirmEnrollment('123456');
    });

    expect(success).toBe(true);
    expect(verifyTotpEnrollment).toHaveBeenCalledWith('factor-1', '123456');
    expect(result.current.enrollment).toBeNull();
    await waitFor(() => expect(result.current.status?.currentLevel).toBe('aal2'));
  });

  it('confirmEnrollment : facteur incorrect (code invalide) — enrollment reste ouvert pour une nouvelle tentative', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    (enrollTotpFactor as jest.Mock).mockResolvedValue(enrollment);
    (verifyTotpEnrollment as jest.Mock).mockRejectedValue(
      new Error("Code incorrect. Vérifie l'heure de ton appareil et réessaie."),
    );

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startEnrollment());

    let success = true;
    await run(async () => {
      success = await result.current.confirmEnrollment('000000');
    });

    expect(success).toBe(false);
    expect(result.current.verifyError).toBe("Code incorrect. Vérifie l'heure de ton appareil et réessaie.");
    expect(result.current.enrollment).toEqual(enrollment);
  });

  it('bloque le double-clic : un second confirmEnrollment() pendant que le premier est en cours ne relance pas l’appel', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    (enrollTotpFactor as jest.Mock).mockResolvedValue(enrollment);
    let resolveVerify: () => void = () => {};
    (verifyTotpEnrollment as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveVerify = resolve;
      }),
    );

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startEnrollment());

    await run(() => {
      result.current.confirmEnrollment('123456');
      result.current.confirmEnrollment('123456');
    });

    expect(verifyTotpEnrollment).toHaveBeenCalledTimes(1);
    await run(() => resolveVerify());
  });

  it('cancelEnrollment : désenrôle le facteur unverified en best-effort et ferme l’écran même si le nettoyage échoue', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal1Unconfigured);
    (enrollTotpFactor as jest.Mock).mockResolvedValue(enrollment);
    (unenrollTotpFactor as jest.Mock).mockRejectedValue(new Error('panne réseau'));

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startEnrollment());
    expect(result.current.enrollment).toEqual(enrollment);

    await run(() => result.current.cancelEnrollment());

    expect(unenrollTotpFactor).toHaveBeenCalledWith('factor-1');
    expect(result.current.enrollment).toBeNull();
  });

  it('startDisable/cancelDisable : bascule pendingDisableFactorId sans appeler le serveur', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal2Configured);

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await run(() => result.current.startDisable('factor-1'));
    expect(result.current.pendingDisableFactorId).toBe('factor-1');
    expect(verifyTotpEnrollment).not.toHaveBeenCalled();
    expect(unenrollTotpFactor).not.toHaveBeenCalled();

    await run(() => result.current.cancelDisable());
    expect(result.current.pendingDisableFactorId).toBeNull();
  });

  it('confirmDisable : revérifie via un nouveau code puis désactive uniquement en cas de succès', async () => {
    (getMfaStatus as jest.Mock)
      .mockResolvedValueOnce(statusAal2Configured)
      .mockResolvedValueOnce(statusAal1Unconfigured);
    (verifyTotpEnrollment as jest.Mock).mockResolvedValue(undefined);
    (unenrollTotpFactor as jest.Mock).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startDisable('factor-1'));

    let success = false;
    await run(async () => {
      success = await result.current.confirmDisable('654321');
    });

    expect(success).toBe(true);
    expect(verifyTotpEnrollment).toHaveBeenCalledWith('factor-1', '654321');
    expect(unenrollTotpFactor).toHaveBeenCalledWith('factor-1');
    expect(result.current.pendingDisableFactorId).toBeNull();
  });

  it('confirmDisable : facteur incorrect — ne désactive jamais et laisse l’écran de revérification ouvert', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal2Configured);
    (verifyTotpEnrollment as jest.Mock).mockRejectedValue(
      new Error("Code incorrect. Vérifie l'heure de ton appareil et réessaie."),
    );

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startDisable('factor-1'));

    let success = true;
    await run(async () => {
      success = await result.current.confirmDisable('000000');
    });

    expect(success).toBe(false);
    expect(unenrollTotpFactor).not.toHaveBeenCalled();
    expect(result.current.disableError).toBe("Code incorrect. Vérifie l'heure de ton appareil et réessaie.");
    expect(result.current.pendingDisableFactorId).toBe('factor-1');
  });

  it('bloque le double-clic : un second confirmDisable() pendant que le premier est en cours ne relance pas l’appel', async () => {
    (getMfaStatus as jest.Mock).mockResolvedValue(statusAal2Configured);
    let resolveVerify: () => void = () => {};
    (verifyTotpEnrollment as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveVerify = resolve;
      }),
    );
    (unenrollTotpFactor as jest.Mock).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useMfa());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await run(() => result.current.startDisable('factor-1'));

    await run(() => {
      result.current.confirmDisable('123456');
      result.current.confirmDisable('123456');
    });

    expect(verifyTotpEnrollment).toHaveBeenCalledTimes(1);
    await run(() => resolveVerify());
  });
});
