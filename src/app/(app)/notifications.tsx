import { ScrollView, StyleSheet, Switch } from 'react-native';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { Card } from '@/components/card';
import { Divider } from '@/components/divider';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { useTheme } from '@/hooks/use-theme';
import { ensureAndroidNotificationChannelAsync, registerForPushNotificationsAsync } from '@/lib/push-notifications';
import type { NotificationPreferences } from '@/services/notification-preferences';

export default function NotificationsScreen() {
  const theme = useTheme();
  const { preferences, isLoading, isSaving, error, refresh, update } = useNotificationPreferences();

  async function applyChange(next: NotificationPreferences) {
    const ok = await update(next);
    if (!ok) return;

    if (next.notificationsEnabled) {
      // Permission éventuellement jamais demandée jusqu'ici : tentative
      // best-effort, sans jamais bloquer l'écran si elle est refusée.
      void registerForPushNotificationsAsync();
    }
    void ensureAndroidNotificationChannelAsync(next.lockScreenPreview);
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Notifications" />

      {isLoading ? (
        <AppLoadingState accessibilityLabel="Chargement des préférences de notification" />
      ) : error && !preferences ? (
        <AppErrorState description={error} onRetry={refresh} />
      ) : !preferences ? (
        <AppErrorState description="Préférences introuvables." onRetry={refresh} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Par défaut, une notification affiche uniquement « Nouveau message » : jamais le contenu, jamais le nom
            complet de l&apos;expéditeur, jamais une photo ou une vidéo.
          </ThemedText>

          <Card style={styles.card}>
            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText type="body">Notifications activées</ThemedText>
              </ThemedView>
              <Switch
                value={preferences.notificationsEnabled}
                disabled={isSaving}
                onValueChange={(value) => applyChange({ ...preferences, notificationsEnabled: value })}
                trackColor={{ true: theme.accent }}
              />
            </ThemedView>

            <Divider />

            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText type="body">Aperçu sur écran verrouillé</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Désactivé par défaut.
                </ThemedText>
              </ThemedView>
              <Switch
                value={preferences.lockScreenPreview}
                disabled={isSaving || !preferences.notificationsEnabled}
                onValueChange={(value) => applyChange({ ...preferences, lockScreenPreview: value })}
                trackColor={{ true: theme.accent }}
              />
            </ThemedView>

            <Divider />

            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText type="body">Son</ThemedText>
              </ThemedView>
              <Switch
                value={preferences.soundEnabled}
                disabled={isSaving || !preferences.notificationsEnabled}
                onValueChange={(value) => applyChange({ ...preferences, soundEnabled: value })}
                trackColor={{ true: theme.accent }}
              />
            </ThemedView>
          </Card>

          {error && (
            <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
              {error}
            </ThemedText>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
  },
  card: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowLabel: {
    flex: 1,
    gap: Spacing.half,
  },
});
