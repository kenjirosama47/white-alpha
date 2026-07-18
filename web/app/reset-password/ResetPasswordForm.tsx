'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';
import formStyles from '@/styles/form.module.css';

import { resetPasswordAction, type ResetPasswordState } from './actions';

// Défini ici (composant client), jamais exporté depuis actions.ts : un
// fichier "use server" ne peut exporter que des fonctions asynchrones — voir
// la même note dans `app/inscription/RegisterForm.tsx`.
const initialState: ResetPasswordState = { error: null, success: false };

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  if (state.success) {
    return (
      <div className={formStyles.form}>
        <p role="status">Ton mot de passe a été changé. Tu peux maintenant te connecter.</p>
        <Button href="/login" variant="primary">
          Aller à la connexion
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className={formStyles.form}>
      <PasswordField
        label="Nouveau mot de passe"
        name="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        disabled={isPending}
      />
      <PasswordField
        label="Confirmer le mot de passe"
        name="confirmPassword"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        disabled={isPending}
      />

      <FormError message={state.error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Mise à jour…' : 'Valider le nouveau mot de passe'}
      </Button>

      <Link href="/login" className={formStyles.link}>
        Retour à la connexion
      </Link>
    </form>
  );
}
