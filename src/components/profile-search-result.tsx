import { Pressable, StyleSheet } from 'react-native';

import { AvatarImage } from '@/components/avatar-image';
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
      <AvatarImage avatarUrl={profile.avatarUrl} displayName={profile.displayName} size={44} />

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
  content: {
    flex: 1,
    gap: Spacing.half,
  },
});
