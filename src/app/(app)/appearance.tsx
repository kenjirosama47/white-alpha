import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppLoadingState } from '@/components/app-loading-state';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APPEARANCE_COLOR_PRESETS, TEXT_SCALE_STEPS, THEME_MODE_OPTIONS } from '@/constants/appearance';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppearanceContext } from '@/contexts/appearance-context';
import { useTheme } from '@/hooks/use-theme';
import type { AppearancePreferences } from '@/types/appearance';

type ColorTarget = 'accentColor' | 'buttonColor' | 'bubbleSentColor' | 'bubbleReceivedColor';

const COLOR_TARGETS: readonly { key: ColorTarget; label: string }[] = [
  { key: 'accentColor', label: 'Couleur principale' },
  { key: 'buttonColor', label: 'Couleur des boutons' },
  { key: 'bubbleSentColor', label: 'Bulles envoyées' },
  { key: 'bubbleReceivedColor', label: 'Bulles reçues' },
];

/** Durée d'affichage de la confirmation discrète après une sauvegarde ou une réinitialisation. */
const CONFIRMATION_DURATION_MS = 2000;

export default function AppearanceScreen() {
  const { preferences, isLoading, updatePreferences, resetPreferences } = useAppearanceContext();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nettoyage du minuteur de confirmation au démontage (navigation retour
  // pendant l'affichage du message) : évite un setState après démontage.
  useEffect(() => {
    return () => {
      if (confirmationTimeoutRef.current) clearTimeout(confirmationTimeoutRef.current);
    };
  }, []);

  function showConfirmation(message: string) {
    setConfirmation(message);
    if (confirmationTimeoutRef.current) clearTimeout(confirmationTimeoutRef.current);
    confirmationTimeoutRef.current = setTimeout(() => setConfirmation(null), CONFIRMATION_DURATION_MS);
  }

  /**
   * Chaque réglage s'applique et se sauvegarde immédiatement (pas de bouton
   * Enregistrer séparé, voir PLAN.md Phase 10.3) : `updatePreferences`
   * (Phase 10.2) met déjà à jour l'état partagé de façon optimiste avant même
   * la fin de l'écriture locale — l'aperçu ci-dessous en profite sans code
   * supplémentaire, puisqu'il lit le même `useTheme()` que le reste de l'app.
   */
  async function applyChange(partial: Partial<AppearancePreferences>) {
    setError(null);
    try {
      await updatePreferences(partial);
      showConfirmation('Modifications enregistrées.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer ce changement pour le moment.');
    }
  }

  async function handleReset() {
    setError(null);
    await resetPreferences();
    showConfirmation('Préférences réinitialisées.');
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Apparence" />

      {isLoading ? (
        <AppLoadingState accessibilityLabel="Chargement des préférences d'apparence" />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <AppearancePreviewCard />

          <Card style={styles.card}>
            <ThemedText type="label" themeColor="textSecondary">
              Thème
            </ThemedText>
            <SegmentedControl
              options={THEME_MODE_OPTIONS}
              value={preferences.themeMode}
              onChange={(themeMode) => applyChange({ themeMode })}
              accessibilityLabel="Thème clair ou sombre"
            />
          </Card>

          <Card style={styles.card}>
            <ThemedText type="label" themeColor="textSecondary">
              Taille du texte
            </ThemedText>
            <SegmentedControl
              options={TEXT_SCALE_STEPS.map((step) => ({ value: step.label, label: step.label }))}
              value={TEXT_SCALE_STEPS.find((step) => step.value === preferences.textScale)?.label ?? 'Normal'}
              onChange={(label) => {
                const step = TEXT_SCALE_STEPS.find((s) => s.label === label);
                if (step) applyChange({ textScale: step.value });
              }}
              accessibilityLabel="Taille du texte"
            />
          </Card>

          {COLOR_TARGETS.map((target) => (
            <Card key={target.key} style={styles.card}>
              <ThemedText type="label" themeColor="textSecondary">
                {target.label}
              </ThemedText>
              <ColorPresetRow
                value={preferences[target.key]}
                onSelect={(hex) => applyChange({ [target.key]: hex } as Partial<AppearancePreferences>)}
              />
            </Card>
          ))}

          {error && (
            <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
              {error}
            </ThemedText>
          )}
          {confirmation && (
            <ThemedText type="bodySmall" themeColor="accent">
              {confirmation}
            </ThemedText>
          )}

          <Button label="Réinitialiser" onPress={handleReset} variant="secondary" />
        </ScrollView>
      )}
    </ThemedView>
  );
}

/**
 * Aperçu en temps réel : aucune prop de préférences — lit `useTheme()`
 * directement, comme n'importe quel autre écran de l'app. Reflète donc
 * automatiquement chaque changement appliqué ci-dessus (même Provider
 * partagé, voir `AppearanceContext`), sans plomberie supplémentaire.
 *
 * L'ensemble est regroupé en un seul nœud d'accessibilité (`accessible` sur
 * la carte) : le texte des bulles factices ci-dessous est un exemple
 * purement visuel, jamais une information à parcourir élément par élément
 * au lecteur d'écran.
 */
function AppearancePreviewCard() {
  const theme = useTheme();

  return (
    <Card
      elevated
      accessible
      accessibilityLabel="Aperçu de l'apparence : thème, couleurs des bulles et du bouton"
      style={styles.previewCard}>
      <View style={[styles.previewPhone, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="label" style={styles.previewHeaderText}>
          White Alpha
        </ThemedText>

        <View
          style={[
            styles.previewBubble,
            styles.previewBubbleReceived,
            { backgroundColor: theme.bubbleReceivedColor, borderWidth: 1, borderColor: theme.border },
          ]}>
          <ThemedText type="bodySmall">Salut, ça va ?</ThemedText>
        </View>
        <View style={[styles.previewBubble, styles.previewBubbleSent, { backgroundColor: theme.bubbleSentColor }]}>
          <ThemedText type="bodySmall" style={{ color: theme.onAccent }}>
            Oui, et toi ?
          </ThemedText>
        </View>

        <View style={[styles.previewButton, { backgroundColor: theme.buttonColor }]}>
          <ThemedText type="label" style={{ color: theme.onAccent }}>
            Bouton
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

type ColorPresetRowProps = {
  value: string;
  onSelect: (hex: string) => void;
};

/** Repère de sélection non basé uniquement sur la couleur (coche + bordure épaisse) — même principe que `avatar-gallery.tsx`. */
function ColorPresetRow({ value, onSelect }: ColorPresetRowProps) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
      {APPEARANCE_COLOR_PRESETS.map((preset) => {
        const isSelected = preset.hex.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={preset.id}
            onPress={() => onSelect(preset.hex)}
            accessibilityRole="button"
            accessibilityLabel={`${preset.label}${isSelected ? ' (sélectionné)' : ''}`}
            accessibilityState={{ selected: isSelected }}
            hitSlop={4}
            style={({ pressed }) => [styles.swatchWrapper, pressed && styles.pressed]}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: preset.hex },
                isSelected ? { borderColor: theme.text, borderWidth: 3 } : { borderColor: theme.border, borderWidth: 1 },
              ]}>
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: theme.surface, borderColor: theme.text }]}>
                  <ThemedText type="caption">✓</ThemedText>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
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
  card: {
    gap: Spacing.two,
  },
  previewCard: {
    alignItems: 'center',
  },
  previewPhone: {
    width: 200,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  previewHeaderText: {
    textAlign: 'center',
  },
  previewBubble: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    maxWidth: '85%',
  },
  previewBubbleReceived: {
    alignSelf: 'flex-start',
  },
  previewBubbleSent: {
    alignSelf: 'flex-end',
  },
  previewButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  swatchWrapper: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
