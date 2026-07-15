import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ImageViewerModalProps = {
  url: string | null;
  onClose: () => void;
};

/** Visionneuse plein écran pour une image de conversation. `url` à `null` masque le modal. */
export function ImageViewerModal({ url, onClose }: ImageViewerModalProps) {
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
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
