import { Pressable, StyleSheet } from 'react-native';

import { AvatarImage } from '@/components/avatar-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ConversationSummary } from '@/types/chat';
import { formatTime } from '@/utils/datetime';

type ConversationListItemProps = {
  conversation: ConversationSummary;
  onPress: () => void;
};

export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const theme = useTheme();
  const { otherParticipant, lastMessageContent, lastMessageCreatedAt } = conversation;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <AvatarImage avatarUrl={otherParticipant.avatarUrl} displayName={otherParticipant.displayName} size={44} />

      <ThemedView style={styles.content}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {otherParticipant.displayName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {lastMessageContent ?? 'Aucun message pour le moment'}
        </ThemedText>
      </ThemedView>

      {lastMessageCreatedAt && (
        <ThemedText type="small" themeColor="textSecondary" style={{ color: theme.textSecondary }}>
          {formatTime(lastMessageCreatedAt)}
        </ThemedText>
      )}
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
