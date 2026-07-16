import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type AvatarImageProps = {
  avatarUrl: string | null;
  /** Utilisé pour l'initiale de repli quand il n'y a pas encore d'avatar. */
  displayName: string;
  size?: number;
};

/** Avatar circulaire : image si `avatarUrl` est défini, sinon l'initiale du nom affiché (comportement historique, conservé comme repli). */
export function AvatarImage({ avatarUrl, displayName, size = 44 }: AvatarImageProps) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (!avatarUrl) {
    return (
      <ThemedView type="backgroundElement" style={[styles.placeholder, dimensionStyle]}>
        <ThemedText type="smallBold">{displayName.charAt(0).toUpperCase()}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <Image
      source={{ uri: avatarUrl }}
      style={dimensionStyle}
      contentFit="cover"
      accessibilityLabel={`Photo de profil de ${displayName}`}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
