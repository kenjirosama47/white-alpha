'use client';

import { useActionState } from 'react';

import { Button } from '@/components/Button';
import { FORGOT_PASSWORD_SUBMITTED_COPY } from '@/lib/copy';
import styles from '@/styles/form.module.css';

import { forgotPasswordAction, type ForgotPasswordState } from './actions';

// Défini ici (composant client), jamais exporté depuis actions.ts : un
// fichier "use server" ne peut exporter que des fonctions asynchrones — voir
// la même note dans `app/inscription/RegisterForm.tsx`.
const initialState: ForgotPasswordState = { submitted: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  if (state.submitted) {
    return <p role="status">{FORGOT_PASSWORD_SUBMITTED_COPY.message}</p>;
  }

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
      </Button>
    </form>
  );
}
