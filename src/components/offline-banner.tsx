import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useTheme } from '@/hooks/use-theme';

/**
 * Bandeau discret affiché en haut de l'écran, sur toute l'application (monté
 * une seule fois dans le layout racine — jamais un abonnement par écran).
 * Rien n'est affiché quand la connexion est stable (ni en ligne, ni hors
 * ligne depuis longtemps) : uniquement pendant une coupure, puis brièvement
 * au retour de connexion. Couvre l'exigence « état hors connexion » des
 * écrans de conversation (Phase 7.4) sans logique dédiée par écran.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const { isOffline, justReconnected } = useNetworkStatus();

  if (!isOffline && !justReconnected) {
    return null;
  }

  return (
    <View
      style={[styles.banner, { backgroundColor: isOffline ? theme.danger : theme.accentBright }]}
      accessibilityRole="alert"
      accessibilityLabel={isOffline ? 'Aucune connexion Internet' : 'Connexion rétablie'}>
      <ThemedText type="label" style={{ color: theme.onAccent }}>
        {isOffline ? 'Aucune connexion Internet' : 'Connexion rétablie'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
