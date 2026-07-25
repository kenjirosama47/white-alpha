'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import { INVITATION_CODE_FIELD_COPY, REGISTER_SUBMITTED_COPY } from '@/lib/copy';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';
import formStyles from '@/styles/form.module.css';

import { registerAction, type RegisterState } from './actions';

// Défini ici (composant client), jamais exporté depuis actions.ts : un
// fichier "use server" ne peut exporter que des fonctions asynchrones
// (contrainte Next.js/React Server Actions) — exporter une valeur comme
// `initialState` y fait échouer l'évaluation du module entier (voir
// https://nextjs.org/docs/messages/invalid-use-server-value), cause réelle
// de l'erreur d'inscription corrigée ici.
const initialState: RegisterState = { error: null, submitted: false };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);
  const invitationCodeRef = useRef<HTMLInputElement>(null);

  // Le code d'invitation ne doit jamais rester affiché après une tentative,
  // réussie ou non (champ non contrôlé : le DOM le garderait sinon tel
  // quel après une erreur, puisque useActionState ne démonte pas le
  // formulaire). `state` change de référence à chaque appel de
  // registerAction (nouvel objet retourné) : cet effet s'exécute donc après
  // CHAQUE tentative, succès ou erreur, jamais seulement au montage initial.
  useEffect(() => {
    if (invitationCodeRef.current) {
      invitationCodeRef.current.value = '';
    }
  }, [state]);

  if (state.submitted) {
    return (
      <div className={formStyles.form}>
        <p role="status">{REGISTER_SUBMITTED_COPY.message}</p>
        <Link href="/login" className={formStyles.link}>
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className={formStyles.form}>
      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="invitationCode">
          {INVITATION_CODE_FIELD_COPY.label}
        </label>
        <input
          ref={invitationCodeRef}
          id="invitationCode"
          name="invitationCode"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder={INVITATION_CODE_FIELD_COPY.placeholder}
          required
          className={formStyles.input}
          disabled={isPending}
        />
      </div>

      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="username">
          Nom d&apos;utilisateur
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          pattern="[a-z0-9_]{3,24}"
          title="3 à 24 caractères : lettres minuscules, chiffres ou underscore"
          required
          className={formStyles.input}
          disabled={isPending}
        />
      </div>

      <div className={formStyles.field}>
        <label className={formStyles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={formStyles.input}
          disabled={isPending}
        />
      </div>

      <PasswordField label="Mot de passe" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} disabled={isPending} />
      <PasswordField
        label="Confirmer le mot de passe"
        name="confirmPassword"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        disabled={isPending}
      />

      <div className={formStyles.checkboxRow}>
        <input id="acceptPrivacy" name="acceptPrivacy" type="checkbox" required disabled={isPending} />
        <label htmlFor="acceptPrivacy">
          J&apos;accepte la{' '}
          <Link href="/politique-confidentialite" className={formStyles.link}>
            politique de confidentialité
          </Link>
          .
        </label>
      </div>

      <FormError message={state.error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Création…' : 'Créer mon compte'}
      </Button>

      <Link href="/login" className={formStyles.link}>
        Déjà un compte ? Se connecter
      </Link>
    </form>
  );
}
