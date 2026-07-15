import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { PublicProfile } from '@/types/chat';

type ProfileSearchResultProps = {
  profile: PublicProfile;
  onPress: () => void;
  disabled?: boolean;
};

export function ProfileSearchResult({ profile, onPress, disabled }: ProfileSearchResultProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.container, (pressed || disabled) && styles.pressed]}>
      <ThemedView type="backgroundElement" style={styles.avatar}>
        <ThemedText type="smallBold">{profile.displayName.charAt(0).toUpperCase()}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {profile.displayName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          @{profile.username}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
});
