'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import formStyles from '@/styles/form.module.css';

import { loginAction, type LoginState } from './actions';

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className={formStyles.form}>
      <input type="hidden" name="next" value={next} />

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

      <PasswordField label="Mot de passe" name="password" autoComplete="current-password" disabled={isPending} />

      <FormError message={state.error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Connexion…' : 'Se connecter'}
      </Button>

      <Link href="/forgot-password" className={formStyles.link}>
        Mot de passe oublié ?
      </Link>
      <Link href="/inscription" className={formStyles.link}>
        Créer un compte
      </Link>
    </form>
  );
}
