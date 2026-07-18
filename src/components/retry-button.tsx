import { Button } from '@/components/button';

type RetryButtonProps = {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
  /** Impose une palette indépendamment du thème système (Anomalie 2, build 16) — voir `useTheme`. */
  forcedScheme?: 'light' | 'dark';
};

/** Bouton « Réessayer » réutilisable : fine enveloppe autour de `Button` (variante secondaire, taille réduite) pour préserver son API existante. */
export function RetryButton({ onPress, label = 'Réessayer', accessibilityLabel, forcedScheme }: RetryButtonProps) {
  return (
    <Button
      onPress={onPress}
      label={label}
      accessibilityLabel={accessibilityLabel}
      variant="secondary"
      size="small"
      forcedScheme={forcedScheme}
    />
  );
}
