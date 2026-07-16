/**
 * Traduction centralisée des erreurs techniques en messages français adaptés
 * à l'utilisateur. Ne jamais laisser un code SQL, une trace, un jeton, une
 * URL signée ou un identifiant interne atteindre l'UI : ce module est le
 * point de passage unique pour ça (Phase 5.2).
 */

/** SQLSTATE que Postgres assigne à `raise exception '...'` sans code explicite (nos RPC). */
const RAISE_EXCEPTION_SQLSTATE = 'P0001';

type SupabaseLikeError = { message?: string; code?: string; status?: number } | null | undefined;

/**
 * Ne fait confiance à `error.message` que pour une exception volontairement
 * levée par l'une de nos RPC (`raise exception`, SQLSTATE P0001) : c'est le
 * seul cas où le message a été rédigé pour être lu tel quel par
 * l'utilisateur. Toute autre erreur (contrainte violée hors `raise
 * exception`, erreur de type, panne réseau, etc.) est un détail technique
 * brut qui ne doit jamais l'atteindre.
 */
export function rpcErrorMessage(error: SupabaseLikeError, fallback: string): string {
  if (error?.code === RAISE_EXCEPTION_SQLSTATE && error.message) {
    return error.message;
  }
  return fallback;
}

const SESSION_EXPIRED_MESSAGE = 'Session expirée. Reconnecte-toi.';
const ACCESS_DENIED_MESSAGE = "Accès refusé pour cette action.";
const SERVER_UNAVAILABLE_MESSAGE = 'Serveur indisponible pour le moment. Réessaie dans un instant.';
const TIMEOUT_MESSAGE = "Le délai de la requête a été dépassé. Vérifie ta connexion et réessaie.";
const NETWORK_MESSAGE = 'Aucune connexion Internet. Vérifie ta connexion et réessaie.';
const UNKNOWN_MESSAGE = 'Une erreur est survenue. Réessaie.';

/**
 * Classement heuristique d'une erreur inattendue (pas une exception
 * volontaire de nos RPC) en une catégorie franco-affichable. Utilisé en
 * dernier recours par `describeError`, jamais pour afficher `error.message`
 * tel quel.
 */
export type ErrorCategory =
  | 'network'
  | 'session_expired'
  | 'access_denied'
  | 'server_unavailable'
  | 'timeout'
  | 'unknown';

export function classifyError(err: unknown): ErrorCategory {
  // `err` peut être une véritable instance `Error`, ou un objet brut au
  // format Supabase (`PostgrestError`/`AuthError`, jamais des instances
  // `Error`) : `.message` doit être lu dans les deux cas.
  const message =
    typeof err === 'string'
      ? err
      : typeof (err as { message?: unknown })?.message === 'string'
        ? ((err as { message: string }).message)
        : '';
  const code = (err as SupabaseLikeError)?.code ?? '';
  const status = (err as SupabaseLikeError)?.status;

  // Panne réseau : fetch échoue avant même d'atteindre le serveur (RN et web
  // ont des libellés différents pour la même situation), ou l'erreur est un
  // TypeError générique (signature classique d'un fetch qui n'a pas abouti).
  if (
    /network request failed|failed to fetch|networkerror|no internet|internet connection/i.test(message) ||
    (err instanceof TypeError && /fetch/i.test(message))
  ) {
    return 'network';
  }

  if (/abort|timed out|timeout/i.test(message) || code === '57014') {
    return 'timeout';
  }

  // JWT expiré : PostgREST (PGRST301), GoTrue, ou message générique.
  if (/jwt expired|jwt is expired|refresh_token_not_found|session.*expired/i.test(message) || code === 'PGRST301') {
    return 'session_expired';
  }

  // Accès refusé : privilège Postgres insuffisant (42501) ou HTTP 401/403.
  if (code === '42501' || status === 401 || status === 403 || /permission denied|not authorized/i.test(message)) {
    return 'access_denied';
  }

  if ((status != null && status >= 500) || /service unavailable|internal server error/i.test(message)) {
    return 'server_unavailable';
  }

  return 'unknown';
}

/**
 * Point d'entrée générique pour toute erreur qui n'est pas une exception
 * volontaire d'une RPC (voir `rpcErrorMessage` pour ce cas). `fallback`
 * permet de garder un message spécifique au contexte (« Impossible de
 * charger les conversations… ») quand la catégorie est `unknown`.
 */
export function describeError(err: unknown, fallback: string = UNKNOWN_MESSAGE): string {
  switch (classifyError(err)) {
    case 'network':
      return NETWORK_MESSAGE;
    case 'timeout':
      return TIMEOUT_MESSAGE;
    case 'session_expired':
      return SESSION_EXPIRED_MESSAGE;
    case 'access_denied':
      return ACCESS_DENIED_MESSAGE;
    case 'server_unavailable':
      return SERVER_UNAVAILABLE_MESSAGE;
    default:
      return fallback;
  }
}

/**
 * Combine les deux : message volontaire d'une RPC (P0001) s'il existe,
 * sinon classement générique de l'erreur (réseau/session/accès/serveur/
 * inconnue). Point d'entrée recommandé pour tout nouvel appel RPC.
 */
export function friendlyRpcError(error: SupabaseLikeError, fallback: string): string {
  if (error?.code === RAISE_EXCEPTION_SQLSTATE && error.message) {
    return error.message;
  }
  return describeError(error, fallback);
}
