import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSignedAttachmentUrl } from '@/hooks/use-signed-attachment-url';

type MessageImageProps = {
  storagePath: string;
  width: number | null;
  height: number | null;
  onPress: (url: string) => void;
};

const FALLBACK_ASPECT_RATIO = 4 / 3;

/** Image d'une pièce jointe dans une bulle de message : URL signée, chargement, erreur avec nouvelle tentative. */
export function MessageImage({ storagePath, width, height, onPress }: MessageImageProps) {
  const { url, isLoading, error, refresh } = useSignedAttachmentUrl(storagePath);
  const [loadFailed, setLoadFailed] = useState(false);
  const aspectRatio = width && height ? width / height : FALLBACK_ASPECT_RATIO;

  function retry() {
    setLoadFailed(false);
    refresh();
  }

  if (error || loadFailed) {
    return (
      <Pressable onPress={retry} style={[styles.placeholder, { aspectRatio }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Image indisponible. Toucher pour réessayer.
        </ThemedText>
      </Pressable>
    );
  }

  if (isLoading || !url) {
    return (
      <View testID="message-image-loading" style={[styles.placeholder, { aspectRatio }]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <Pressable testID="message-image-pressable" onPress={() => onPress(url)}>
      <Image source={{ uri: url }} style={[styles.image, { aspectRatio }]} contentFit="cover" onError={() => setLoadFailed(true)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    maxWidth: 240,
    borderRadius: Spacing.two,
  },
  placeholder: {
    width: '100%',
    maxWidth: 240,
    minHeight: 120,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000014',
    padding: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
});
