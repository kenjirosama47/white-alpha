import { useCallback, useEffect, useRef, useState } from 'react';

import {
  enrollTotpFactor,
  getMfaStatus,
  unenrollTotpFactor,
  verifyTotpEnrollment,
  type MfaStatus,
  type TotpEnrollment,
} from '@/lib/mfa';

type UseMfaResult = {
  status: MfaStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;

  /** Non null pendant l'enrôlement (QR code affiché, en attente du code temporaire). */
  enrollment: TotpEnrollment | null;
  isStartingEnrollment: boolean;
  enrollmentError: string | null;
  startEnrollment: () => Promise<void>;
  /** Annule un enrôlement en cours : désenrôle le facteur `unverified` créé côté serveur (best-effort). */
  cancelEnrollment: () => Promise<void>;

  isVerifying: boolean;
  verifyError: string | null;
  /** true si succès (session passée à aal2) ; false si code incorrect (l'écran reste affiché pour une nouvelle tentative). */
  confirmEnrollment: (code: string) => Promise<boolean>;

  /** Non null pendant la revérification obligatoire avant désactivation d'un facteur déjà vérifié. */
  pendingDisableFactorId: string | null;
  startDisable: (factorId: string) => void;
  cancelDisable: () => void;
  isDisabling: boolean;
  disableError: string | null;
  /** Revérifie via un nouveau code TOTP (step-up sensible) puis désactive uniquement si cette revérification réussit. */
  confirmDisable: (code: string) => Promise<boolean>;
};

/**
 * Statut MFA (niveau AAL, facteurs vérifiés) et parcours d'enrôlement/
 * désactivation TOTP complet, pour l'écran Sécurité du compte. Même
 * structure chargement/erreur/refresh que `use-my-profile.ts`. Aucune valeur
 * sensible (secret, code, QR code) n'est jamais journalisée par ce hook —
 * voir `lib/mfa.ts`.
 */
export function useMfa(): UseMfaResult {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [isStartingEnrollment, setIsStartingEnrollment] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const isStartingRef = useRef(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const isVerifyingRef = useRef(false);

  const [pendingDisableFactorId, setPendingDisableFactorId] = useState<string | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const isDisablingRef = useRef(false);

  // Aucun setState synchrone dans le corps de la fonction : tout passe par
  // .then/.catch/.finally (même principe que use-conversations.ts/use-my-profile.ts).
  const load = useCallback(() => {
    getMfaStatus()
      .then((result) => {
        setStatus(result);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    load();
  }, [load]);

  const startEnrollment = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStartingEnrollment(true);
    setEnrollmentError(null);
    try {
      const result = await enrollTotpFactor();
      setEnrollment(result);
    } catch (err) {
      setEnrollmentError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      isStartingRef.current = false;
      setIsStartingEnrollment(false);
    }
  }, []);

  const cancelEnrollment = useCallback(async () => {
    const pending = enrollment;
    setEnrollment(null);
    setVerifyError(null);
    if (pending) {
      // Best-effort : le facteur unverified créé par enrollTotpFactor est
      // nettoyé côté serveur pour ne pas laisser un facteur orphelin bloquer
      // un futur enrôlement. Un échec ici ne doit jamais empêcher l'utilisateur
      // de quitter l'écran d'enrôlement.
      try {
        await unenrollTotpFactor(pending.factorId);
      } catch {
        // Silencieux : nettoyage best-effort, jamais bloquant pour l'utilisateur.
      }
    }
  }, [enrollment]);

  const confirmEnrollment = useCallback(
    async (code: string) => {
      if (!enrollment || isVerifyingRef.current) return false;
      isVerifyingRef.current = true;
      setIsVerifying(true);
      setVerifyError(null);
      try {
        await verifyTotpEnrollment(enrollment.factorId, code);
        setEnrollment(null);
        refresh();
        return true;
      } catch (err) {
        setVerifyError(err instanceof Error ? err.message : 'Erreur inconnue.');
        return false;
      } finally {
        isVerifyingRef.current = false;
        setIsVerifying(false);
      }
    },
    [enrollment, refresh],
  );

  const startDisable = useCallback((factorId: string) => {
    setPendingDisableFactorId(factorId);
    setDisableError(null);
  }, []);

  const cancelDisable = useCallback(() => {
    setPendingDisableFactorId(null);
    setDisableError(null);
  }, []);

  // Désactivation autorisée uniquement après une nouvelle vérification
  // sensible : confirmDisable revérifie d'abord le facteur via un nouveau
  // code TOTP (même mécanisme que la fin d'enrôlement, challengeAndVerify),
  // et ne désenrôle QUE si cette revérification réussit.
  const confirmDisable = useCallback(
    async (code: string) => {
      if (!pendingDisableFactorId || isDisablingRef.current) return false;
      isDisablingRef.current = true;
      setIsDisabling(true);
      setDisableError(null);
      try {
        await verifyTotpEnrollment(pendingDisableFactorId, code);
        await unenrollTotpFactor(pendingDisableFactorId);
        setPendingDisableFactorId(null);
        refresh();
        return true;
      } catch (err) {
        setDisableError(err instanceof Error ? err.message : 'Erreur inconnue.');
        return false;
      } finally {
        isDisablingRef.current = false;
        setIsDisabling(false);
      }
    },
    [pendingDisableFactorId, refresh],
  );

  return {
    status,
    isLoading,
    error,
    refresh,
    enrollment,
    isStartingEnrollment,
    enrollmentError,
    startEnrollment,
    cancelEnrollment,
    isVerifying,
    verifyError,
    confirmEnrollment,
    pendingDisableFactorId,
    startDisable,
    cancelDisable,
    isDisabling,
    disableError,
    confirmDisable,
  };
}
