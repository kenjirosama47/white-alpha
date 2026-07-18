'use client';

import { useActionState } from 'react';

import { Button } from '@/components/Button';

import { loginAction, type LoginState } from './actions';
import styles from './LoginForm.module.css';

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="next" value={next} />

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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={styles.input}
          disabled={isPending}
        />
      </div>

      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
