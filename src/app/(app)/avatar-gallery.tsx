import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WolfAvatarTile } from '@/components/wolf-avatar-tile';
import { WOLF_AVATAR_CATALOG, getWolfAvatarLabel } from '@/constants/avatars';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAvatarPreset } from '@/hooks/use-avatar-preset';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useTheme } from '@/hooks/use-theme';
import type { MyProfile } from '@/services/profiles';

export default function AvatarGalleryScreen() {
  const { profile, isLoading, error, refresh, setProfile } = useMyProfile();

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Choisir un avatar" />
      {isLoading ? (
        <AppLoadingState accessibilityLabel="Chargement du profil" />
      ) : error ? (
        <AppErrorState description={error} onRetry={refresh} />
      ) : !profile ? (
        <AppErrorState description="Profil introuvable." onRetry={refresh} />
      ) : (
        <AvatarGalleryContent profile={profile} onSaved={setProfile} />
      )}
    </ThemedView>
  );
}

type AvatarGalleryContentProps = {
  profile: MyProfile;
  onSaved: (profile: MyProfile) => void;
};

function AvatarGalleryContent({ profile, onSaved }: AvatarGalleryContentProps) {
  const theme = useTheme();
  const editor = useAvatarPreset(profile, onSaved);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.preview}>
        <WolfAvatarTile id={editor.selected} size={128} />
        <ThemedText type="label" style={styles.centeredText}>
          {getWolfAvatarLabel(editor.selected)}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.grid}>
        {WOLF_AVATAR_CATALOG.map((entry) => {
          const isSelected = entry.id === editor.selected;
          const isCurrent = entry.id === profile.avatarPreset;
          return (
            <Pressable
              key={entry.id}
              onPress={() => editor.select(entry.id)}
              disabled={editor.isSaving}
              accessibilityRole="button"
              accessibilityLabel={`${entry.label}${isCurrent ? ' (avatar actuel)' : ''}${isSelected ? ' (sélectionné)' : ''}`}
              accessibilityState={{ selected: isSelected, disabled: editor.isSaving }}
              style={({ pressed }) => [styles.tileWrapper, pressed && styles.pressed]}>
              <View
                style={[
                  styles.tileRing,
                  isSelected
                    ? { borderColor: theme.accent, borderWidth: 3 }
                    : { borderColor: theme.border, borderWidth: 1 },
                ]}>
                <WolfAvatarTile id={entry.id} />
                {/* Repère de sélection non basé uniquement sur la couleur
                    (Phase 7.6, Section 7) : une coche visible s'ajoute à
                    l'épaisseur de bordure accrue, pour rester identifiable
                    même sans distinction du vert (daltonisme, niveaux de
                    gris, contraste élevé). */}
                {isSelected && (
                  <View style={[styles.checkBadge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
                    <ThemedText type="caption" style={{ color: theme.onAccent }}>
                      ✓
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.tileLabel}>
                {entry.label}
              </ThemedText>
              {isCurrent && (
                <ThemedText type="caption" themeColor="accent">
                  Actuel
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </ThemedView>

      {editor.error && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert" style={styles.centeredText}>
          {editor.error}
        </ThemedText>
      )}
      {editor.success && (
        <ThemedText type="bodySmall" themeColor="accent" style={styles.centeredText}>
          Avatar mis à jour.
        </ThemedText>
      )}

      <ThemedView style={styles.actions}>
        <Button label="Annuler" onPress={editor.reset} disabled={!editor.isDirty || editor.isSaving} variant="secondary" />
        <Button
          label="Choisir cet avatar"
          onPress={editor.save}
          disabled={!editor.isDirty || editor.isSaving}
          loading={editor.isSaving}
        />
      </ThemedView>
    </ScrollView>
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
  preview: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  tileWrapper: {
    width: '30%',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  tileRing: {
    borderRadius: Radius.pill,
    padding: 3,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
