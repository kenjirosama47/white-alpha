/**
 * Textes officiels White Alpha, portés depuis le projet mobile
 * (`src/constants/copy.ts`) — recopiés à l'identique (voir la note dans
 * `theme.ts` sur l'indépendance des deux dépôts de build).
 */
export const SITE_COPY = {
  title: 'White Alpha — La meute privée',
  subtitle: 'Une messagerie privée réservée aux membres autorisés.',
} as const;

export const INSTALL_ANDROID_COPY = {
  buttonLabel: 'Télécharger White Alpha pour Android',
} as const;

export const INSTALL_IOS_COPY = {
  buttonLabel: 'Installer White Alpha sur iPhone',
  steps: [
    'Ouvrir White Alpha dans Safari',
    'Toucher le bouton Partager',
    'Choisir « Ajouter à l’écran d’accueil »',
    'Confirmer « Ajouter »',
    'Ouvrir White Alpha depuis son icône',
  ],
} as const;

export const INSTALL_ANDROID_WEB_COPY = {
  buttonLabel: 'Installer la version Web',
} as const;

/** Phase 8.3 — authentification réelle. */
export const LOGIN_COPY = {
  title: 'Retrouvez la meute',
} as const;

export const REGISTER_COPY = {
  title: 'Rejoignez la meute White Alpha',
} as const;

export const MEMBER_HOME_COPY = {
  welcomeTitle: 'Bienvenue dans la meute',
} as const;

export const SESSION_EXPIRED_COPY = {
  message: 'Votre session a expiré. Reconnectez-vous pour continuer.',
} as const;

export const GENERIC_ERROR_COPY = {
  message: 'Une erreur est survenue. Réessayez dans quelques instants.',
} as const;

export const CONFIRMATION_FAILED_COPY = {
  message: 'Ce lien de confirmation est invalide ou a expiré. Merci de réessayer.',
} as const;

export const MFA_CHALLENGE_COPY = {
  title: 'Vérification supplémentaire',
  subtitle: "Saisis le code à 6 chiffres généré par ton application d'authentification.",
} as const;

export const RESET_PASSWORD_COPY = {
  title: 'Créer un nouveau mot de passe',
  subtitle: 'Choisis un nouveau mot de passe pour ton compte.',
} as const;

/**
 * Anti-énumération (corrigé après revue) : message strictement identique
 * qu'une adresse soit déjà enregistrée ou non — ne jamais y substituer un
 * texte plus spécifique ("compte déjà existant", etc.), même partiellement.
 */
export const REGISTER_SUBMITTED_COPY = {
  message: 'Si cette adresse peut être utilisée, vous recevrez un message contenant les prochaines étapes.',
} as const;

/** Anti-énumération : même message qu'un compte existe ou non pour cette adresse. */
export const FORGOT_PASSWORD_SUBMITTED_COPY = {
  message: 'Si cette adresse est associée à un compte, un lien de réinitialisation sera envoyé.',
} as const;
