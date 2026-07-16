import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { ConversationListItem } from '@/components/conversation-list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useConversations } from '@/hooks/use-conversations';
import type { ConversationSummary } from '@/types/chat';

export default function ConversationsScreen() {
  const { signOut } = useAuth();
  const { conversations, isLoading, isRefreshing, error, refresh } = useConversations();

  function openConversation(conversation: ConversationSummary) {
    router.push({
      pathname: '/conversation/[id]',
      params: {
        id: conversation.conversationId,
        otherUsername: conversation.otherParticipant.username,
        otherDisplayName: conversation.otherParticipant.displayName,
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle">Conversations</ThemedText>
          <Pressable onPress={signOut} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              Déconnexion
            </ThemedText>
          </Pressable>
        </ThemedView>

        <Pressable
          onPress={() => router.push('/search')}
          style={({ pressed }) => [styles.buttonPrimary, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
            Nouvelle discussion
          </ThemedText>
        </Pressable>

        {isLoading ? (
          <AppLoadingState accessibilityLabel="Chargement des conversations" />
        ) : error ? (
          <AppErrorState description={error} onRetry={refresh} />
        ) : conversations.length === 0 ? (
          <AppEmptyState title="Aucune conversation" description="Recherchez un utilisateur pour commencer à discuter." />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.conversationId}
            renderItem={({ item }) => (
              <ConversationListItem conversation={item} onPress={() => openConversation(item)} />
            )}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
            contentContainerStyle={styles.listContent}
          />
        )}
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
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  buttonPrimary: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonPrimaryLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  listContent: {
    gap: Spacing.one,
  },
});
