import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppLoadingState } from '@/components/app-loading-state';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DecorationTile } from '@/components/decoration-tile';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APPEARANCE_COLOR_PRESETS, BACKGROUND_SLOT_OPTIONS, TEXT_SCALE_STEPS, THEME_MODE_OPTIONS } from '@/constants/appearance';
import { DECORATION_CATEGORIES, getDecorationsByCategory, type DecorationCategoryId } from '@/constants/decorations';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppearanceContext } from '@/contexts/appearance-context';
import { usePersonalPhotoEditor } from '@/hooks/use-personal-photo-editor';
import { useTheme } from '@/hooks/use-theme';
import { deletePersonalPhotoFile, personalPhotoFileExists } from '@/lib/personal-photo-storage';
import { resolveBackgroundSource } from '@/lib/resolve-background-source';
import type { AppearancePreferences, BackgroundConfig, BackgroundSlot } from '@/types/appearance';

type ColorTarget = 'accentColor' | 'buttonColor' | 'bubbleSentColor' | 'bubbleReceivedColor';

const COLOR_TARGETS: readonly { key: ColorTarget; label: string }[] = [
  { key: 'accentColor', label: 'Couleur principale' },
  { key: 'buttonColor', label: 'Couleur des boutons' },
  { key: 'bubbleSentColor', label: 'Bulles envoyées' },
  { key: 'bubbleReceivedColor', label: 'Bulles reçues' },
];

function backgroundSlotLabel(slot: BackgroundSlot): string {
  return BACKGROUND_SLOT_OPTIONS.find((option) => option.value === slot)?.label ?? slot;
}

/** Durée d'affichage de la confirmation discrète après une sauvegarde ou une réinitialisation. */
const CONFIRMATION_DURATION_MS = 2000;

export default function AppearanceScreen() {
  const { preferences, isLoading, updatePreferences, resetPreferences } = useAppearanceContext();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Section actuellement éditée et catégorie affichée dans la galerie
  // (Phase 10.4) : navigation purement locale à l'écran, jamais persistée
  // telle quelle — seul le choix effectif d'un fond (ou « Fond par défaut »)
  // modifie `AppearancePreferences`.
  const [activeSlot, setActiveSlot] = useState<BackgroundSlot>('home');
  const [activeCategory, setActiveCategory] = useState<DecorationCategoryId>(DECORATION_CATEGORIES[0].id);
  const personalPhotoEditor = usePersonalPhotoEditor();

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
    const previousBackgrounds = preferences.backgrounds;
    await resetPreferences();
    showConfirmation('Préférences réinitialisées.');
    // Nettoyage des photos personnelles des 3 sections (Phase 10.5a) : une
    // réinitialisation globale ne doit jamais laisser de fichier privé
    // orphelin, qu'aucune préférence ne référence plus.
    for (const background of Object.values(previousBackgrounds)) {
      if (background.kind === 'personal') {
        await deletePersonalPhotoFile(background.localUri);
      }
    }
  }

  const currentSlotBackground = preferences.backgrounds[activeSlot];

  function applyBackgroundChange(nextBackground: BackgroundConfig) {
    return applyChange({ backgrounds: { ...preferences.backgrounds, [activeSlot]: nextBackground } });
  }

  /**
   * Réinitialise la section active vers le fond par défaut (bouton déjà
   * présent depuis la Phase 10.4, réutilisé tel quel pour la Phase 10.5a) :
   * si le fond retiré était une photo personnelle, son fichier privé est
   * aussi supprimé définitivement (jamais un résidu orphelin).
   */
  async function resetSlotToDefault() {
    const previousBackground = currentSlotBackground;
    await applyBackgroundChange({ kind: 'default' });
    if (previousBackground.kind === 'personal') {
      await deletePersonalPhotoFile(previousBackground.localUri);
    }
  }

  /**
   * `true` tant que le fond actif n'est pas une photo personnelle (rien à
   * vérifier), ou si le fichier référencé existe encore. Vérification
   * synchrone (voir `lib/personal-photo-storage.ts`) : pas d'état de
   * chargement intermédiaire nécessaire.
   */
  const personalPhotoAvailable = useMemo(() => {
    if (currentSlotBackground.kind !== 'personal') return true;
    return personalPhotoFileExists(currentSlotBackground.localUri);
  }, [currentSlotBackground]);

  // Photo personnelle devenue inaccessible (fichier supprimé hors de l'app,
  // stockage externe démonté, etc., Phase 10.5a) : repli automatique et
  // silencieux sur le fond par défaut, jamais une erreur bloquante affichée
  // à l'utilisateur pour un fichier qu'il ne peut de toute façon plus
  // récupérer depuis cet écran. `applyBackgroundChange` synchronise l'état
  // React avec un système externe (le système de fichiers, via
  // `personalPhotoAvailable`) qui a changé en dehors de React : c'est
  // exactement l'usage prévu d'un effet (voir la documentation React), pas
  // un anti-pattern — la règle de lint est donc désactivée ici sciemment,
  // pas contournée artificiellement.
  useEffect(() => {
    if (currentSlotBackground.kind === 'personal' && !personalPhotoAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation volontaire avec le système de fichiers (fichier disparu hors de React), voir commentaire au-dessus de l'effet.
      applyBackgroundChange({ kind: 'default' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit réagir qu'à un changement réel de fond, jamais à l'identité de applyBackgroundChange (recréée à chaque rendu).
  }, [currentSlotBackground, personalPhotoAvailable]);

  /** Confirme la photo en attente (déjà recadrée/compressée/enregistrée en privé, voir `use-personal-photo-editor.ts`) : ne supprime l'ancienne photo remplacée qu'une fois la nouvelle appliquée avec succès. */
  async function confirmPersonalPhoto() {
    const newUri = personalPhotoEditor.previewUri;
    if (!newUri) return;
    const previousBackground = currentSlotBackground;
    await applyBackgroundChange({ kind: 'personal', localUri: newUri });
    personalPhotoEditor.clearAfterConfirm();
    if (previousBackground.kind === 'personal' && previousBackground.localUri !== newUri) {
      await deletePersonalPhotoFile(previousBackground.localUri);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Apparence" />

      {isLoading ? (
        <AppLoadingState accessibilityLabel="Chargement des préférences d'apparence" />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <AppearancePreviewCard activeSlot={activeSlot} />

          <Card style={styles.card}>
            <ThemedText type="label" themeColor="textSecondary">
              Fonds d’écran
            </ThemedText>

            <ThemedText type="bodySmall" themeColor="textSecondary">
              Appliquer à
            </ThemedText>
            <SegmentedControl
              options={BACKGROUND_SLOT_OPTIONS}
              value={activeSlot}
              onChange={setActiveSlot}
              accessibilityLabel="Section à personnaliser"
            />

            <CategoryTabs value={activeCategory} onChange={setActiveCategory} />

            <DecorationGalleryRow
              categoryId={activeCategory}
              selectedDecorationId={currentSlotBackground.kind === 'catalog' ? currentSlotBackground.decorationId : null}
              onSelect={(decorationId) => applyBackgroundChange({ kind: 'catalog', decorationId })}
            />

            <PersonalPhotoSection
              activeSlot={activeSlot}
              currentBackground={currentSlotBackground}
              currentBackgroundAvailable={personalPhotoAvailable}
              editor={personalPhotoEditor}
              onConfirm={confirmPersonalPhoto}
            />

            <Button
              label="Fond par défaut"
              onPress={resetSlotToDefault}
              variant="secondary"
              size="small"
              disabled={currentSlotBackground.kind === 'default'}
              accessibilityLabel={`Revenir au fond par défaut pour ${backgroundSlotLabel(activeSlot).toLowerCase()}`}
            />
          </Card>

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

type AppearancePreviewCardProps = {
  /** Section dont le fond d'écran est prévisualisé (Phase 10.4) — la palette (thème/couleurs) reste toujours globale. */
  activeSlot: BackgroundSlot;
};

/**
 * Aperçu en temps réel : lit `useTheme()` directement, comme n'importe quel
 * autre écran de l'app — reflète donc automatiquement chaque changement de
 * thème/couleurs appliqué ci-dessus (même Provider partagé, voir
 * `AppearanceContext`), sans plomberie supplémentaire. Le fond d'écran
 * affiché est celui de la section actuellement éditée (`activeSlot`,
 * Phase 10.4) : `theme.preferences` expose déjà l'intégralité des
 * préférences (voir `use-theme.ts`), donc aucune prop supplémentaire n'est
 * nécessaire pour le résoudre.
 *
 * L'ensemble est regroupé en un seul nœud d'accessibilité (`accessible` sur
 * la carte) : le texte des bulles factices ci-dessous est un exemple
 * purement visuel, jamais une information à parcourir élément par élément
 * au lecteur d'écran.
 */
function AppearancePreviewCard({ activeSlot }: AppearancePreviewCardProps) {
  const theme = useTheme();
  const background = theme.preferences.backgrounds[activeSlot];
  const imageSource = resolveBackgroundSource(background);

  const content = (
    <>
      <ThemedText type="label" style={styles.previewHeaderText}>
        White Alpha
      </ThemedText>

      <View
        testID="appearance-preview-bubble-received"
        style={[
          styles.previewBubble,
          styles.previewBubbleReceived,
          { backgroundColor: theme.bubbleReceivedColor, borderWidth: 1, borderColor: theme.border },
        ]}>
        <ThemedText type="bodySmall">Salut, ça va ?</ThemedText>
      </View>
      <View
        testID="appearance-preview-bubble-sent"
        style={[styles.previewBubble, styles.previewBubbleSent, { backgroundColor: theme.bubbleSentColor }]}>
        <ThemedText type="bodySmall" style={{ color: theme.onAccent }}>
          Oui, et toi ?
        </ThemedText>
      </View>

      <View testID="appearance-preview-button" style={[styles.previewButton, { backgroundColor: theme.buttonColor }]}>
        <ThemedText type="label" style={{ color: theme.onAccent }}>
          Bouton
        </ThemedText>
      </View>
    </>
  );

  const accessibilityLabel = `Aperçu de l'apparence pour ${backgroundSlotLabel(activeSlot).toLowerCase()} : thème, fond d'écran, couleurs des bulles et du bouton`;

  return (
    <Card elevated accessible accessibilityLabel={accessibilityLabel} style={styles.previewCard}>
      {imageSource ? (
        <ImageBackground
          testID="appearance-preview-background"
          source={imageSource}
          resizeMode="cover"
          style={[styles.previewPhone, { borderColor: theme.border }]}
          imageStyle={{ borderRadius: Radius.lg }}>
          {content}
        </ImageBackground>
      ) : (
        <View
          testID="appearance-preview-background"
          style={[styles.previewPhone, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {content}
        </View>
      )}
    </Card>
  );
}

type CategoryTabsProps = {
  value: DecorationCategoryId;
  onChange: (value: DecorationCategoryId) => void;
};

/** Navigation horizontale par catégorie (Phase 10.4) : chips non étirées, contrairement à `SegmentedControl` (adapté à 8 options de largeur variable). */
function CategoryTabs({ value, onChange }: CategoryTabsProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRow}
      accessibilityRole="tablist"
      accessibilityLabel="Catégories de décorations">
      {DECORATION_CATEGORIES.map((category) => {
        const isSelected = category.id === value;
        return (
          <Pressable
            key={category.id}
            onPress={() => onChange(category.id)}
            accessibilityRole="tab"
            accessibilityLabel={category.label}
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [
              styles.categoryChip,
              { borderColor: theme.border },
              isSelected && { backgroundColor: theme.accent, borderColor: theme.accent },
              pressed && !isSelected && styles.pressed,
            ]}>
            <ThemedText
              type="label"
              style={{ color: isSelected ? theme.onAccent : theme.textSecondary, fontWeight: isSelected ? '700' : '500' }}>
              {category.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type DecorationGalleryRowProps = {
  categoryId: DecorationCategoryId;
  selectedDecorationId: string | null;
  onSelect: (decorationId: string) => void;
};

/** Repère de sélection non basé uniquement sur la couleur (coche + bordure épaisse) — même principe que `ColorPresetRow`/`avatar-gallery.tsx`. */
function DecorationGalleryRow({ categoryId, selectedDecorationId, onSelect }: DecorationGalleryRowProps) {
  const theme = useTheme();
  const decorations = getDecorationsByCategory(categoryId);

  if (decorations.length === 0) {
    return (
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Aucun fond disponible dans cette catégorie pour le moment.
      </ThemedText>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.decorationRow}>
      {decorations.map((entry) => {
        const isSelected = entry.id === selectedDecorationId;
        return (
          <Pressable
            key={entry.id}
            onPress={() => onSelect(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label}${isSelected ? ' (sélectionné)' : ''}`}
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [styles.decorationWrapper, pressed && styles.pressed]}>
            <View
              style={[
                styles.decorationRing,
                isSelected ? { borderColor: theme.text, borderWidth: 3 } : { borderColor: theme.border, borderWidth: 1 },
              ]}>
              <DecorationTile id={entry.id} width={88} height={88} />
              {isSelected && (
                <View
                  style={[
                    styles.checkBadge,
                    styles.decorationCheckBadge,
                    { backgroundColor: theme.surface, borderColor: theme.text },
                  ]}>
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

type PersonalPhotoSectionProps = {
  activeSlot: BackgroundSlot;
  currentBackground: BackgroundConfig;
  /** `false` si `currentBackground` est de type `personal` mais que le fichier référencé n'existe plus (Phase 10.5a) — le composant parent se charge du repli réel sur les préférences, cette prop évite seulement d'afficher une vignette cassée pendant ce court instant. */
  currentBackgroundAvailable: boolean;
  editor: ReturnType<typeof usePersonalPhotoEditor>;
  onConfirm: () => void;
};

/**
 * Entrée « Mes photos » (Phase 10.5a) : choisir/remplacer une photo
 * personnelle pour la section active. Le recadrage portrait, le
 * repositionnement et le zoom sont fournis par l'éditeur natif du système
 * (`allowsEditing`, voir `services/personal-photo.ts`) — aucune
 * bibliothèque de recadrage supplémentaire. Un aperçu (photo déjà
 * recadrée/compressée/enregistrée en privé, pas encore appliquée) doit
 * être confirmé ou annulé avant de remplacer la préférence. La suppression
 * définitive réutilise le bouton « Fond par défaut » déjà présent
 * juste en dessous (voir `resetSlotToDefault` dans le composant parent),
 * qui supprime aussi le fichier privé — jamais un second bouton faisant la
 * même chose.
 */
function PersonalPhotoSection({
  activeSlot,
  currentBackground,
  currentBackgroundAvailable,
  editor,
  onConfirm,
}: PersonalPhotoSectionProps) {
  const personalUri =
    currentBackground.kind === 'personal' && currentBackgroundAvailable ? currentBackground.localUri : null;
  const isBusy = editor.isPicking || editor.isProcessing;

  return (
    <ThemedView style={styles.personalPhotoSection}>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Mes photos
      </ThemedText>

      {editor.previewUri ? (
        <>
          <Image
            source={{ uri: editor.previewUri }}
            style={styles.personalPreviewImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            Aperçu avant validation
          </ThemedText>
          <ThemedView style={styles.personalPhotoActions}>
            <Button label="Annuler" onPress={editor.cancel} variant="secondary" size="small" />
            <Button label="Utiliser cette photo" onPress={onConfirm} size="small" />
          </ThemedView>
        </>
      ) : (
        <>
          {personalUri && (
            <Image
              source={{ uri: personalUri }}
              style={styles.personalPreviewImage}
              contentFit="cover"
              accessibilityLabel={`Photo personnelle actuelle pour ${backgroundSlotLabel(activeSlot).toLowerCase()}`}
            />
          )}
          <Button
            label={personalUri ? 'Remplacer par une autre photo' : 'Choisir une photo'}
            onPress={editor.pick}
            variant={personalUri ? 'secondary' : 'primary'}
            size="small"
            loading={isBusy}
            disabled={isBusy}
          />
        </>
      )}

      {editor.error && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {editor.error}
        </ThemedText>
      )}
    </ThemedView>
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
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  categoryChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  decorationRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  decorationWrapper: {
    alignItems: 'center',
  },
  decorationRing: {
    borderRadius: Radius.md,
    padding: 3,
    position: 'relative',
  },
  decorationCheckBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  personalPhotoSection: {
    gap: Spacing.two,
  },
  personalPreviewImage: {
    width: 120,
    height: Math.round((120 * 16) / 9),
    borderRadius: Radius.md,
  },
  personalPhotoActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
