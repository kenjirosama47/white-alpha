/**
 * Menu trombone du composeur de conversation : remplace les deux boutons
 * séparés Photo/Vidéo par une seule icône, avec un petit menu Photo/Vidéo/
 * Annuler à l'appui (voir PLAN.md 9.1 — jamais implémenté jusqu'ici).
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AttachmentMenuProps = {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
};

export function AttachmentMenu({ visible, onClose, onPickImage, onPickVideo }: AttachmentMenuProps) {
  // Palette sombre imposée (Anomalie 2, build 16) — même environnement que le reste du composeur.
  const theme = useTheme('dark');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer le menu pièce jointe">
        <View style={[styles.sheet, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
          <Pressable
            onPress={() => {
              onClose();
              onPickImage();
            }}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel="Photo">
            <ThemedText type="body" forcedScheme="dark">
              Photo
            </ThemedText>
          </Pressable>
          <Divider />
          <Pressable
            onPress={() => {
              onClose();
              onPickVideo();
            }}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel="Vidéo">
            <ThemedText type="body" forcedScheme="dark">
              Vidéo
            </ThemedText>
          </Pressable>
          <Divider />
          <Pressable onPress={onClose} style={styles.option} accessibilityRole="button" accessibilityLabel="Annuler">
            <ThemedText type="body" themeColor="danger" forcedScheme="dark">
              Annuler
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#000000A0',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    minHeight: TouchTarget.comfortable,
    justifyContent: 'center',
  },
});
