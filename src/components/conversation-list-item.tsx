import { Pressable, StyleSheet } from 'react-native';

import { AvatarImage } from '@/components/avatar-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TouchTarget } from '@/constants/theme';
import type { ConversationSummary } from '@/types/chat';
import { formatTime } from '@/utils/datetime';

type ConversationListItemProps = {
  conversation: ConversationSummary;
  onPress: () => void;
};

/** Ligne de la liste des conversations (Phase 7.4) : avatar, nom, dernier message tronqué, heure, retour tactile discret. */
export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const { otherParticipant, lastMessageContent, lastMessageCreatedAt } = conversation;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la conversation avec ${otherParticipant.displayName}`}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <AvatarImage
        avatarUrl={otherParticipant.avatarUrl}
        wolfPreset={otherParticipant.avatarPreset}
        displayName={otherParticipant.displayName}
        size={TouchTarget.comfortable}
      />

      <ThemedView style={styles.content}>
        <ThemedText type="label" numberOfLines={1}>
          {otherParticipant.displayName}
        </ThemedText>
        <ThemedText type="bodySmall" themeColor="textSecondary" numberOfLines={1}>
          {lastMessageContent ?? 'Aucun message pour le moment'}
        </ThemedText>
      </ThemedView>

      {lastMessageCreatedAt && (
        <ThemedText type="caption" themeColor="textSecondary">
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
    minHeight: TouchTarget.comfortable + Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
});
