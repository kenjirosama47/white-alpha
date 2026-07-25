'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import formStyles from '@/styles/form.module.css';

import {
  cancelMfaEnrollmentAction,
  disableMfaAction,
  enrollMfaAction,
  verifyMfaEnrollmentAction,
  type MfaEnrollmentStatus,
} from './actions';
import styles from './page.module.css';

const NETWORK_ERROR_MESSAGE = 'Connexion impossible. Vérifie ta connexion et réessaie.';

type ViewState =
  | { kind: 'idle' }
  | { kind: 'enrolling'; factorId: string; qrCode: string; secret: string }
  | { kind: 'success' }
  | { kind: 'enrolled' };

function initialView(status: MfaEnrollmentStatus): ViewState {
  return status === 'verified' ? { kind: 'enrolled' } : { kind: 'idle' };
}

/**
 * Même politique que LoginForm.tsx (Phase 8.9.1) : chaque action serveur est
 * appelée manuellement dans un `try/catch` explicite plutôt que via
 * `useActionState`, pour ne jamais laisser un échec réseau (avant même
 * d'atteindre le serveur) se traduire par un bouton silencieusement figé.
 * `useTransition` (et non `useState` pour `isPending`) pour la même raison
 * que LoginForm : seul `useTransition` garantit un rendu intermédiaire
 * visible de l'état "en cours".
 */
export function MfaSetupClient({ initialStatus }: { initialStatus: MfaEnrollmentStatus }) {
  const [view, setView] = useState<ViewState>(() => initialView(initialStatus));
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEnroll() {
    setEnrollError(null);
    startTransition(async () => {
      try {
        const result = await enrollMfaAction();
        if (result.status === 'success') {
          setView({ kind: 'enrolling', factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
        } else if (result.status === 'already_enrolled') {
          setView({ kind: 'enrolled' });
        } else {
          setEnrollError(result.error);
        }
      } catch {
        setEnrollError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleVerify(formData: FormData) {
    if (view.kind !== 'enrolling') return;
    const factorId = view.factorId;
    const code = String(formData.get('code') ?? '').trim();
    setVerifyError(null);
    startTransition(async () => {
      try {
        const result = await verifyMfaEnrollmentAction(factorId, code);
        if (result.status === 'success') {
          setView({ kind: 'success' });
        } else {
          setVerifyError(result.error);
        }
      } catch {
        setVerifyError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleCancelEnrollment() {
    if (view.kind !== 'enrolling') return;
    const factorId = view.factorId;
    setVerifyError(null);
    startTransition(async () => {
      try {
        await cancelMfaEnrollmentAction(factorId);
      } catch {
        // Nettoyage best-effort : jamais bloquant pour quitter l'écran d'enrôlement.
      }
      setView({ kind: 'idle' });
    });
  }

  function handleDisable(formData: FormData) {
    const code = String(formData.get('code') ?? '').trim();
    setDisableError(null);
    startTransition(async () => {
      try {
        const result = await disableMfaAction(code);
        if (result.status === 'success') {
          setShowDisableForm(false);
          setView({ kind: 'idle' });
        } else {
          setDisableError(result.error);
        }
      } catch {
        setDisableError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  if (view.kind === 'success') {
    return (
      <div className={styles.block} role="status">
        <p className={styles.successMessage}>Authentification à deux facteurs activée.</p>
        <Button href="/membre/admin/invitations">Accéder aux codes d&apos;invitation</Button>
        <p>
          <Link href="/membre">Retour à l&apos;espace membre</Link>
        </p>
      </div>
    );
  }

  if (view.kind === 'enrolling') {
    return (
      <div className={styles.block}>
        <h2>Activer l&apos;authentification à deux facteurs</h2>
        <p>
          Scanne ce code avec ton application d&apos;authentification (Google Authenticator, 1Password…), puis
          saisis le code à 6 chiffres généré.
        </p>

        <img src={view.qrCode} alt="Code QR d'activation de l'authentification multifacteur" className={styles.qrImage} />

        <p>Impossible de scanner ? Saisis ce code manuellement :</p>
        <p className={styles.codeValue}>{view.secret}</p>

        <form action={handleVerify} className={formStyles.form}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="code">
              Code à 6 chiffres
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className={formStyles.input}
              disabled={isPending}
            />
          </div>

          <FormError message={verifyError} />

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Vérification…' : 'Vérifier'}
          </Button>
        </form>

        <Button type="button" variant="ghost" disabled={isPending} onClick={handleCancelEnrollment}>
          Annuler
        </Button>
      </div>
    );
  }

  if (view.kind === 'enrolled') {
    return (
      <div className={styles.block}>
        <p>Authentification à deux facteurs : activée.</p>

        {!showDisableForm && (
          <Button type="button" variant="secondary" onClick={() => setShowDisableForm(true)}>
            Désactiver
          </Button>
        )}

        {showDisableForm && (
          <form action={handleDisable} className={formStyles.form}>
            <p>Pour confirmer la désactivation, saisis un nouveau code généré par ton application d&apos;authentification.</p>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="disable-code">
                Code à 6 chiffres
              </label>
              <input
                id="disable-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className={formStyles.input}
                disabled={isPending}
              />
            </div>

            <FormError message={disableError} />

            <Button type="submit" variant="secondary" disabled={isPending}>
              {isPending ? 'Désactivation…' : 'Confirmer la désactivation'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setShowDisableForm(false);
                setDisableError(null);
              }}
            >
              Annuler
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <p>Authentification à deux facteurs : non activée.</p>
      <FormError message={enrollError} />
      <Button type="button" disabled={isPending} onClick={handleEnroll}>
        {isPending ? 'Préparation…' : "Activer l'authentification à deux facteurs"}
      </Button>
    </div>
  );
}
