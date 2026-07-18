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
