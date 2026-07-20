import { resolveAvatarDisplay } from '@/lib/avatars';
import styles from './Avatar.module.css';

type AvatarProps = {
  avatarUrl: string | null | undefined;
  avatarPreset: string | null | undefined;
  /** Utilisée uniquement pour l'initiale de repli et le texte alternatif — jamais affichée ailleurs. */
  displayName: string;
  size?: number;
};

/**
 * Avatar White Alpha (Phase 8.4) — seul point d'appel de
 * `resolveAvatarDisplay` (voir `lib/avatars.ts`) : liste des conversations,
 * résultats de recherche, en-tête de discussion. Jamais de logique de
 * résolution dupliquée ailleurs.
 */
export function Avatar({ avatarUrl, avatarPreset, displayName, size = 48 }: AvatarProps) {
  const display = resolveAvatarDisplay(avatarUrl, avatarPreset);
  const style = { width: size, height: size };

  if (display.kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element -- avatar distant (Supabase Storage), next/image nécessiterait de configurer un domaine externe pour un gain marginal ici.
    return <img src={display.uri} alt="" role="presentation" className={styles.avatar} style={style} />;
  }

  if (display.kind === 'wolf') {
    // eslint-disable-next-line @next/next/no-img-element -- image statique locale, cohérent avec le logo de la page d'accueil (next/image inutile ici).
    return <img src={display.src} alt="" role="presentation" className={styles.avatar} style={style} />;
  }

  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={styles.initial} style={style} aria-hidden="true">
      {initial}
    </div>
  );
}
