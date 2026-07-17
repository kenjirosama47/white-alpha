import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { ensureAndroidNotificationChannelAsync, registerForPushNotificationsAsync } from '@/lib/push-notifications';
import type { NotificationPreferences } from '@/services/notification-preferences';

export default function NotificationsScreen() {
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
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle">Notifications</ThemedText>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

        {isLoading ? (
          <AppLoadingState accessibilityLabel="Chargement des préférences de notification" />
        ) : error && !preferences ? (
          <AppErrorState description={error} onRetry={refresh} />
        ) : !preferences ? (
          <AppErrorState description="Préférences introuvables." onRetry={refresh} />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedView style={styles.block}>
              <ThemedText type="small" themeColor="textSecondary">
                Par défaut, une notification affiche uniquement « Nouveau message » : jamais le contenu, jamais le
                nom complet de l&apos;expéditeur, jamais une photo ou une vidéo.
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText>Notifications activées</ThemedText>
              </ThemedView>
              <Switch
                value={preferences.notificationsEnabled}
                disabled={isSaving}
                onValueChange={(value) => applyChange({ ...preferences, notificationsEnabled: value })}
                trackColor={{ true: '#208AEF' }}
              />
            </ThemedView>

            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText>Aperçu sur écran verrouillé</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Désactivé par défaut.
                </ThemedText>
              </ThemedView>
              <Switch
                value={preferences.lockScreenPreview}
                disabled={isSaving || !preferences.notificationsEnabled}
                onValueChange={(value) => applyChange({ ...preferences, lockScreenPreview: value })}
                trackColor={{ true: '#208AEF' }}
              />
            </ThemedView>

            <ThemedView style={styles.row}>
              <ThemedView style={styles.rowLabel}>
                <ThemedText>Son</ThemedText>
              </ThemedView>
              <Switch
                value={preferences.soundEnabled}
                disabled={isSaving || !preferences.notificationsEnabled}
                onValueChange={(value) => applyChange({ ...preferences, soundEnabled: value })}
                trackColor={{ true: '#208AEF' }}
              />
            </ThemedView>

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  headerSpacer: {
    width: 50,
  },
  scrollContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
  },
  block: {
    gap: Spacing.two,
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
  error: {
    color: '#D14343',
  },
});
