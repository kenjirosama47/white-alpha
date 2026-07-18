'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import { REGISTER_SUBMITTED_COPY } from '@/lib/copy';
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

  if (state.submitted) {
    return <p role="status">{REGISTER_SUBMITTED_COPY.message}</p>;
  }

  return (
    <form action={formAction} className={formStyles.form}>
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
