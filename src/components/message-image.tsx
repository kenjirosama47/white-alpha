import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSignedAttachmentUrl } from '@/hooks/use-signed-attachment-url';
import { useTheme } from '@/hooks/use-theme';

type MessageImageProps = {
  storagePath: string;
  width: number | null;
  height: number | null;
  /** `triggerNode` : élément déclencheur, pour restaurer le focus d'accessibilité à la fermeture de la visionneuse (Phase 7.6). */
  onPress: (url: string, triggerNode: View | null) => void;
};

const FALLBACK_ASPECT_RATIO = 4 / 3;

/** Image d'une pièce jointe dans une bulle de message : URL signée, chargement, erreur avec nouvelle tentative. */
export function MessageImage({ storagePath, width, height, onPress }: MessageImageProps) {
  // Palette sombre imposée (Anomalie 2, build 16) — voir message-bubble.tsx.
  const theme = useTheme('dark');
  const { url, isLoading, error, refresh } = useSignedAttachmentUrl(storagePath);
  const [loadFailed, setLoadFailed] = useState(false);
  const pressableRef = useRef<View>(null);
  const aspectRatio = width && height ? width / height : FALLBACK_ASPECT_RATIO;

  function retry() {
    setLoadFailed(false);
    refresh();
  }

  if (error || loadFailed) {
    return (
      <Pressable
        onPress={retry}
        style={[styles.placeholder, { aspectRatio, backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel="Image indisponible. Toucher pour réessayer.">
        <ThemedText type="small" themeColor="textSecondary" forcedScheme="dark" style={styles.centeredText}>
          Image indisponible. Toucher pour réessayer.
        </ThemedText>
      </Pressable>
    );
  }

  if (isLoading || !url) {
    return (
      <View
        testID="message-image-loading"
        style={[styles.placeholder, { aspectRatio, backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Chargement de l'image">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <Pressable ref={pressableRef} testID="message-image-pressable" onPress={() => onPress(url, pressableRef.current)}>
      <Image source={{ uri: url }} style={[styles.image, { aspectRatio }]} contentFit="cover" onError={() => setLoadFailed(true)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    maxWidth: 240,
    borderRadius: Radius.sm,
  },
  placeholder: {
    width: '100%',
    maxWidth: 240,
    minHeight: 120,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
});
