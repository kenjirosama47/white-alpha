import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/use-network-status';

/**
 * Bandeau discret affiché en haut de l'écran, sur toute l'application (monté
 * une seule fois dans le layout racine — jamais un abonnement par écran).
 * Rien n'est affiché quand la connexion est stable (ni en ligne, ni hors
 * ligne depuis longtemps) : uniquement pendant une coupure, puis brièvement
 * au retour de connexion.
 */
export function OfflineBanner() {
  const { isOffline, justReconnected } = useNetworkStatus();

  if (!isOffline && !justReconnected) {
    return null;
  }

  return (
    <View
      style={[styles.banner, isOffline ? styles.offline : styles.reconnected]}
      accessibilityRole="alert"
      accessibilityLabel={isOffline ? 'Aucune connexion Internet' : 'Connexion rétablie'}>
      <ThemedText type="small" style={styles.label}>
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
  offline: {
    backgroundColor: '#D14343',
  },
  reconnected: {
    backgroundColor: '#2E9E5B',
  },
  label: {
    color: '#ffffff',
  },
});
