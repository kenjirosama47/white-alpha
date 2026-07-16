import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MessageImage } from '@/components/message-image';
import { MessageVideo } from '@/components/message-video';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MessageDeletionState } from '@/hooks/use-message-deletion';
import type { Message } from '@/types/chat';
import { formatTime } from '@/utils/datetime';

type MessageBubbleProps = {
  message: Message;
  isOwnMessage: boolean;
  onImagePress?: (url: string) => void;
  /** Uniquement pour ses propres messages : état de suppression et actions associées. */
  deletionState?: MessageDeletionState | null;
  onDelete?: () => void;
  onRetryDelete?: () => void;
};

export function MessageBubble({
  message,
  isOwnMessage,
  onImagePress,
  deletionState = null,
  onDelete,
  onRetryDelete,
}: MessageBubbleProps) {
  const theme = useTheme();
  const hasText = message.content.trim().length > 0;
  const [confirming, setConfirming] = useState(false);

  const isDeleting = deletionState?.status === 'deleting';

  function handleConfirm() {
    setConfirming(false);
    onDelete?.();
  }

  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : styles.rowReceived]}>
      <View style={styles.column}>
        <View
          style={[
            styles.bubble,
            isOwnMessage ? styles.bubbleOwn : { backgroundColor: theme.backgroundElement },
          ]}>
          {message.attachment?.mediaType === 'image' && (
            <MessageImage
              storagePath={message.attachment.storagePath}
              width={message.attachment.width}
              height={message.attachment.height}
              onPress={(url) => onImagePress?.(url)}
            />
          )}
          {message.attachment?.mediaType === 'video' && (
            <MessageVideo
              storagePath={message.attachment.storagePath}
              width={message.attachment.width}
              height={message.attachment.height}
              durationMs={message.attachment.durationMs}
            />
          )}
          {hasText && (
            <ThemedText type="default" style={isOwnMessage ? styles.textOwn : undefined}>
              {message.content}
            </ThemedText>
          )}
          <ThemedText
            type="small"
            themeColor={isOwnMessage ? undefined : 'textSecondary'}
            style={[styles.time, isOwnMessage && styles.textOwn]}>
            {formatTime(message.createdAt)}
          </ThemedText>
        </View>

        {isOwnMessage && (
          <View style={styles.deleteRow}>
            {deletionState?.status === 'error' ? (
              <>
                <ThemedText type="small" style={styles.errorText}>
                  {deletionState.error}
                </ThemedText>
                <Pressable onPress={onRetryDelete} hitSlop={8}>
                  <ThemedText type="small" style={styles.retryLabel}>
                    Réessayer
                  </ThemedText>
                </Pressable>
              </>
            ) : isDeleting ? (
              <ThemedText type="small" themeColor="textSecondary">
                Suppression…
              </ThemedText>
            ) : confirming ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Supprimer ce message ?
                </ThemedText>
                <Pressable onPress={handleConfirm} hitSlop={8}>
                  <ThemedText type="small" style={styles.confirmLabel}>
                    Confirmer
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => setConfirming(false)} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Annuler
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Supprimer
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
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
  column: {
    maxWidth: '80%',
    gap: Spacing.half,
  },
  bubble: {
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
  deleteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  confirmLabel: {
    color: '#D14343',
  },
  retryLabel: {
    color: '#208AEF',
  },
  errorText: {
    color: '#D14343',
  },
});
