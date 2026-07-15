import { Pressable, StyleSheet } from 'react-native';

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
      <ThemedView type="backgroundElement" style={styles.avatar}>
        <ThemedText type="smallBold">{otherParticipant.displayName.charAt(0).toUpperCase()}</ThemedText>
      </ThemedView>

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
