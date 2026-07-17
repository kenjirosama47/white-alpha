import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { RefObject } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { restoreAccessibilityFocus } from '@/utils/accessibility-focus';

type ImageViewerModalProps = {
  url: string | null;
  onClose: () => void;
  /**
   * Ref vers l'élément (ex. la vignette pressée) sur lequel restaurer le
   * focus d'accessibilité une fois la visionneuse refermée. Une ref plutôt
   * qu'une valeur directe : sa `.current` n'est lue qu'au moment de la
   * fermeture (gestionnaire d'événement), jamais pendant le rendu.
   */
  triggerRef?: RefObject<View | null>;
};

/** Visionneuse plein écran pour une image de conversation. `url` à `null` masque le modal. */
export function ImageViewerModal({ url, onClose, triggerRef }: ImageViewerModalProps) {
  function handleClose() {
    onClose();
    restoreAccessibilityFocus(triggerRef?.current ?? null);
  }

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Fermer l'image">
            <ThemedText type="smallBold" style={styles.closeLabel}>
              Fermer
            </ThemedText>
          </Pressable>
          {url && <Image source={{ uri: url }} style={styles.image} contentFit="contain" />}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// Fond quasi-opaque + bouton blanc : « chrome » de visionneuse plein écran
// superposé à une photo par nature imprévisible (pas de couleur de fond
// fixe) — noir/blanc conservés volontairement, non issus du thème, même
// raisonnement que le menu ⋮ des vidéos dans message-bubble.tsx.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000E6',
  },
  safeArea: {
    flex: 1,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: Spacing.three,
  },
  closeLabel: {
    color: '#ffffff',
  },
  image: {
    flex: 1,
  },
});
