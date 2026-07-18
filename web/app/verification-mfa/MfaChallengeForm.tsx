'use client';

import { useActionState } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import formStyles from '@/styles/form.module.css';

import { verifyMfaAction, type MfaChallengeState } from './actions';

const initialState: MfaChallengeState = { error: null };

export function MfaChallengeForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(verifyMfaAction, initialState);

  return (
    <form action={formAction} className={formStyles.form}>
      <input type="hidden" name="next" value={next} />

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

      <FormError message={state.error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Vérification…' : 'Vérifier'}
      </Button>
    </form>
  );
}
