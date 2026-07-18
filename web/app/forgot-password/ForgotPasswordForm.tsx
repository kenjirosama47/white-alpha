'use client';

import { useActionState } from 'react';

import { Button } from '@/components/Button';

import { forgotPasswordAction, initialState } from './actions';
import styles from '../login/LoginForm.module.css';

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  if (state.submitted) {
    return (
      <p role="status">
        Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.
      </p>
    );
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
