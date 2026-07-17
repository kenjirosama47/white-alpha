/**
 * Textes officiels White Alpha (Phase 7.2 — préparation uniquement, voir
 * PLAN.md). Centralisés ici pour que la Phase 7.3 (refonte des écrans
 * d'authentification et des états vides) les consomme sans re-décider le
 * wording : aucun écran n'est encore modifié à ce stade.
 *
 * La seule référence « Claude » encore visible par l'utilisateur (titre de
 * l'écran d'accueil, `src/app/(auth)/index.tsx`) est volontairement laissée
 * inchangée ici : son remplacement nécessite d'éditer ce fichier écran,
 * explicitement hors périmètre de la Phase 7.2.
 */

export const WELCOME_COPY = {
  title: 'Bienvenue dans White Alpha',
  subtitle: 'La meute privée. Vos échanges restent entre vous.',
} as const;

export const LOGIN_COPY = {
  title: 'Retrouvez la meute',
} as const;

export const REGISTER_COPY = {
  title: 'Rejoignez la meute White Alpha',
} as const;

export const EMPTY_CONVERSATIONS_COPY = {
  title: 'La meute est encore silencieuse',
  description: 'Commencez une conversation privée',
  actionLabel: 'Nouvelle conversation',
} as const;

export const SECURITY_COPY = {
  title: 'Votre espace reste protégé',
} as const;

export const SEARCH_COPY = {
  noResultsTitle: 'Aucun membre trouvé',
} as const;

export const OFFLINE_COPY = {
  offlineTitle: 'Connexion indisponible',
  offlineDescription: 'Certaines actions reprendront une fois le réseau rétabli.',
  reconnectedTitle: 'Connexion rétablie',
} as const;

/** État vide générique (Phase 7.6) : galerie ou contenu indisponible sans détail technique. */
export const EMPTY_CONTENT_COPY = {
  title: 'Aucun élément disponible',
} as const;
