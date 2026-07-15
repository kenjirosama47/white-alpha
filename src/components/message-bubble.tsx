import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Message } from '@/types/chat';
import { formatTime } from '@/utils/datetime';

type MessageBubbleProps = {
  message: Message;
  isOwnMessage: boolean;
};

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : styles.rowReceived]}>
      <View
        style={[
          styles.bubble,
          isOwnMessage ? styles.bubbleOwn : { backgroundColor: theme.backgroundElement },
        ]}>
        <ThemedText type="default" style={isOwnMessage ? styles.textOwn : undefined}>
          {message.content}
        </ThemedText>
        <ThemedText
          type="small"
          themeColor={isOwnMessage ? undefined : 'textSecondary'}
          style={[styles.time, isOwnMessage && styles.textOwn]}>
          {formatTime(message.createdAt)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    marginVertical: Spacing.half,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowReceived: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  bubbleOwn: {
    backgroundColor: '#208AEF',
  },
  bubbleReceived: {
    backgroundColor: '#F0F0F3',
  },
  textOwn: {
    color: '#ffffff',
  },
  time: {
    alignSelf: 'flex-end',
    fontSize: 11,
  },
});
