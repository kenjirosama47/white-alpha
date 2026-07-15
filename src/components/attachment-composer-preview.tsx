import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { PickedImage } from '@/services/media';

type AttachmentComposerPreviewProps = {
  image: PickedImage;
  isUploading: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: () => void;
};

/** Aperçu de l'image sélectionnée avant envoi, avec Annuler/Envoyer et l'état de chargement. */
export function AttachmentComposerPreview({ image, isUploading, error, onCancel, onSend }: AttachmentComposerPreviewProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <Image source={{ uri: image.uri }} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.actions}>
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <View style={styles.buttonsRow}>
          <Pressable
            onPress={onCancel}
            disabled={isUploading}
            hitSlop={8}
            style={({ pressed }) => [styles.button, (pressed || isUploading) && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Annuler
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={onSend}
            disabled={isUploading}
            style={({ pressed }) => [styles.button, styles.sendButton, (pressed || isUploading) && styles.pressed]}>
            {isUploading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.sendButtonLabel}>
                Envoyer
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  actions: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  sendButton: {
    backgroundColor: '#208AEF',
  },
  sendButtonLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    color: '#D14343',
  },
});
