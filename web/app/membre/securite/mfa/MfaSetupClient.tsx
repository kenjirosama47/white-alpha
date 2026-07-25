'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

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
const SECRET_PLACEHOLDER = '•'.repeat(16);

/**
 * Un enrôlement non terminé (facteur `unverified` en base) n'expire jamais
 * de lui-même côté Supabase Auth — voir l'incident réel (Phase MFA) où un
 * facteur non vérifié, oublié dans cet état, a été considéré compromis après
 * une capture d'écran du secret. Cette expiration côté client (best-effort,
 * jamais une garantie de sécurité à elle seule) réduit la fenêtre pendant
 * laquelle un secret affiché reste exploitable si l'écran reste ouvert sans
 * surveillance.
 */
const ENROLLMENT_TIMEOUT_MS = 5 * 60 * 1000;

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
  // Jamais affiché par défaut (voir l'incident réel : une capture d'écran a
  // exposé le secret) — uniquement après un geste explicite de l'utilisateur.
  const [showSecret, setShowSecret] = useState(false);
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [isPending, startTransition] = useTransition();

  const enrollingFactorId = view.kind === 'enrolling' ? view.factorId : null;

  // Expiration automatique best-effort : désenrôle le facteur non vérifié et
  // efface le secret de l'état React (le seul endroit où il transite jamais
  // côté client) si l'écran d'enrôlement reste ouvert trop longtemps sans
  // être terminé.
  useEffect(() => {
    if (!enrollingFactorId) return;
    const timer = setTimeout(() => {
      cancelMfaEnrollmentAction(enrollingFactorId).catch(() => {});
      setView({ kind: 'idle' });
      setShowSecret(false);
      setExpiredNotice(true);
    }, ENROLLMENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [enrollingFactorId]);

  function handleEnroll() {
    setEnrollError(null);
    setExpiredNotice(false);
    startTransition(async () => {
      try {
        const result = await enrollMfaAction();
        if (result.status === 'success') {
          setShowSecret(false);
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
          setShowSecret(false);
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
      setShowSecret(false);
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

        <img
          src={view.qrCode}
          alt="Code QR d'activation de l'authentification multifacteur — à scanner avec ton application d'authentification"
          className={styles.qrImage}
        />

        <p className={styles.warning} role="note">
          Ne partage jamais ce code et n&apos;en fais aucune capture d&apos;écran : quiconque le possède peut activer
          un accès à ta place.
        </p>

        <p>Impossible de scanner ?</p>
        <div className={styles.secretRow}>
          <p className={styles.codeValue}>{showSecret ? view.secret : SECRET_PLACEHOLDER}</p>
          <Button type="button" variant="ghost" onClick={() => setShowSecret((current) => !current)}>
            {showSecret ? 'Masquer le code manuel' : 'Afficher le code manuel'}
          </Button>
        </div>

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
      {expiredNotice && <p role="status">Le code d&apos;activation a expiré pour des raisons de sécurité. Relance l&apos;activation.</p>}
      <FormError message={enrollError} />
      <Button type="button" disabled={isPending} onClick={handleEnroll}>
        {isPending ? 'Préparation…' : "Activer l'authentification à deux facteurs"}
      </Button>
    </div>
  );
}
