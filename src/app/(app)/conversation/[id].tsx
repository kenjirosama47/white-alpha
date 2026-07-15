import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/message-bubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useMessages } from '@/hooks/use-messages';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';

export default function ConversationScreen() {
  const { id, otherDisplayName } = useLocalSearchParams<{
    id: string;
    otherUsername?: string;
    otherDisplayName?: string;
  }>();
  const theme = useTheme();
  const { session } = useAuth();
  const { messages, isLoading, isLoadingMore, error, sendError, isSending, loadMore, send } =
    useMessages(id);
  const [draft, setDraft] = useState('');

  // FlatList inverted : données du plus récent au plus ancien pour que la
  // vue reste naturellement collée en bas, sur le dernier message.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  async function handleSend() {
    const content = draft;
    if (!content.trim() || isSending) return;
    setDraft('');
    await send(content);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
            {otherDisplayName ?? 'Discussion'}
          </ThemedText>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

        {isLoading ? (
          <ThemedView style={styles.centered}>
            <ActivityIndicator />
          </ThemedView>
        ) : error ? (
          <ThemedView style={styles.centered}>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              {error}
            </ThemedText>
          </ThemedView>
        ) : messages.length === 0 ? (
          <ThemedView style={styles.centered}>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              Aucun message pour le moment. Écris le premier !
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            inverted
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwnMessage={item.senderId === session?.user.id} />
            )}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingMore ? (
                <ThemedView style={styles.loadingMore}>
                  <ActivityIndicator size="small" />
                </ThemedView>
              ) : null
            }
            contentContainerStyle={styles.listContent}
          />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {sendError && (
            <ThemedText type="small" style={styles.error}>
              {sendError}
            </ThemedText>
          )}
          <ThemedView style={styles.inputRow}>
            <TextInput
              placeholder="Écrire un message..."
              placeholderTextColor={theme.textSecondary}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={MESSAGE_MAX_LENGTH}
              editable={!isSending}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <Pressable
              onPress={handleSend}
              disabled={isSending || !draft.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                (pressed || isSending || !draft.trim()) && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={styles.sendButtonLabel}>
                {isSending ? '...' : 'Envoyer'}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: Spacing.two,
  },
  loadingMore: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  sendButtonLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    color: '#D14343',
    paddingHorizontal: Spacing.three,
  },
});
