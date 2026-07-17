import { Button } from '@/components/button';

type RetryButtonProps = {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
};

/** Bouton « Réessayer » réutilisable : fine enveloppe autour de `Button` (variante secondaire, taille réduite) pour préserver son API existante. */
export function RetryButton({ onPress, label = 'Réessayer', accessibilityLabel }: RetryButtonProps) {
  return <Button onPress={onPress} label={label} accessibilityLabel={accessibilityLabel} variant="secondary" size="small" />;
}
