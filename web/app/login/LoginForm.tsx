'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PasswordField } from '@/components/PasswordField';
import formStyles from '@/styles/form.module.css';

import { loginAction } from './actions';

const NETWORK_ERROR_MESSAGE = 'Connexion impossible. Vérifie ta connexion et réessaie.';

/**
 * `redirect()` (appelé par `loginAction` en cas de succès, y compris vers
 * `/verification-mfa`) fonctionne en lançant une exception spéciale que
 * Next.js intercepte pour déclencher la navigation — jamais une vraie
 * erreur applicative. Le préfixe `NEXT_REDIRECT` du `digest` est le moyen
 * documenté par Next.js de la reconnaître (voir
 * `next/dist/client/components/redirect-error.ts`, `isRedirectError`) :
 * jamais avalée par le `catch` ci-dessous, sinon la redirection après une
 * connexion réussie n'aurait plus jamais lieu.
 */
function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

/**
 * Corrige un bug réel constaté en production (Phase 8.9.1) : avec
 * `useActionState`, si l'appel réseau sous-jacent à la Server Action
 * échoue AVANT même d'atteindre `loginAction` (503/proxy, connexion
 * coupée, timeout, réponse inattendue) — jamais capturé par le
 * `try/catch` de `loginAction`, qui ne s'exécute que côté serveur, une
 * fois la requête arrivée — l'état `isPending` peut ne jamais redevenir
 * cohérent et aucun message n'apparaît : le bouton semble ne plus
 * réagir, sans la moindre erreur visible ni journalisée. `loginAction`
 * est donc appelée manuellement ici, avec un `try/catch` qui couvre
 * explicitement CET appel réseau lui-même (pas seulement son contenu
 * métier) : un message générique s'affiche toujours en cas d'échec,
 * quelle qu'en soit la cause — jamais d'échec silencieux. `isPending`
 * (voir `useTransition` ci-dessous) retombe de lui-même à `false` dès que
 * la transition se termine, succès ou échec, sans bloc `finally` requis.
 *
 * `useTransition` plutôt qu'un simple `useState` pour `isPending` : un
 * `setState` synchrone placé avant le premier `await` d'une fonction
 * `action` de formulaire n'est pas garanti de produire un rendu visible
 * intermédiaire (React peut regrouper tous les rendus de l'action, y
 * compris l'état "en cours", jusqu'à la résolution complète de la
 * promesse — constaté empiriquement en test). `isPending` de
 * `useTransition` est lui spécifiquement conçu pour refléter l'état "en
 * cours" dès le déclenchement de la transition, sans ce risque.
 */
export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loginAction({ error: null }, formData);
        // Un succès n'atteint jamais cette ligne : loginAction redirige (voir
        // isNextRedirectError ci-dessus). Un résultat ici signifie toujours un
        // échec identifié côté serveur (identifiants invalides, etc.).
        setError(result.error);
      } catch (caught) {
        if (isNextRedirectError(caught)) {
          throw caught;
        }
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <form action={handleSubmit} className={formStyles.form}>
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

      <FormError message={error} />

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
