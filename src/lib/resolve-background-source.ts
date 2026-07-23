/**
 * Résolution partagée d'un `BackgroundConfig` vers une source d'image React
 * Native (`Image`/`ImageBackground`) — point unique de vérité utilisé à la
 * fois par l'aperçu de l'écran Apparence et par les écrans réels (Accueil,
 * Conversation, Profil, voir `components/appearance-background.tsx`).
 *
 * Priorité photo personnelle > décoration catalogue > fond par défaut :
 * garantie par construction, puisque `BackgroundConfig` est une union à un
 * seul `kind` actif par section — jamais deux fonds simultanés pour une
 * même section (choisir l'un remplace l'autre, voir `appearance.tsx`).
 */
import type { ImageSourcePropType } from 'react-native';

import { resolveDecorationSource } from '@/constants/decorations';
import { personalPhotoFileExists } from '@/lib/personal-photo-storage';
import type { BackgroundConfig } from '@/types/appearance';

export function resolveBackgroundSource(background: BackgroundConfig): ImageSourcePropType | null {
  if (background.kind === 'catalog') {
    return resolveDecorationSource(background.decorationId);
  }
  if (background.kind === 'personal' && personalPhotoFileExists(background.localUri)) {
    return { uri: background.localUri };
  }
  return null;
}
