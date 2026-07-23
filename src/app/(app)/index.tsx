import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppearanceBackground } from '@/components/appearance-background';
import { AppLoadingState } from '@/components/app-loading-state';
import { AvatarImage } from '@/components/avatar-image';
import { Button } from '@/components/button';
import { ConversationListItem } from '@/components/conversation-list-item';
import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EMPTY_CONVERSATIONS_COPY } from '@/constants/copy';
import { MaxContentWidth, Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfileContext } from '@/contexts/my-profile-context';
import { useConversations } from '@/hooks/use-conversations';
import { useTheme } from '@/hooks/use-theme';
import type { ConversationSummary } from '@/types/chat';

export default function ConversationsScreen() {
  const theme = useTheme();
  const { conversations, isLoading, isRefreshing, error, refresh } = useConversations();
  const { profile: myProfile } = useMyProfileContext();

  function openConversation(conversation: ConversationSummary) {
    router.push({
      pathname: '/conversation/[id]',
      params: {
        id: conversation.conversationId,
        otherUsername: conversation.otherParticipant.username,
        otherDisplayName: conversation.otherParticipant.displayName,
        otherAvatarUrl: conversation.otherParticipant.avatarUrl ?? '',
        otherAvatarPreset: conversation.otherParticipant.avatarPreset,
      },
    });
  }

  return (
    <AppearanceBackground slot="home" style={styles.container} testID="home-appearance-background">
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Conversations</ThemedText>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ouvrir mon profil">
            <AvatarImage
              avatarUrl={myProfile?.avatarUrl ?? null}
              wolfPreset={myProfile?.avatarPreset}
              displayName={myProfile?.displayName ?? '?'}
              size={TouchTarget.comfortable}
            />
          </Pressable>
        </ThemedView>

        <Button label="Nouvelle discussion" onPress={() => router.push('/search')} />

        {isLoading ? (
          <AppLoadingState accessibilityLabel="Chargement des conversations" />
        ) : error ? (
          <AppErrorState description={error} onRetry={refresh} />
        ) : conversations.length === 0 ? (
          <AppEmptyState
            title={EMPTY_CONVERSATIONS_COPY.title}
            description={EMPTY_CONVERSATIONS_COPY.description}
            actionLabel={EMPTY_CONVERSATIONS_COPY.actionLabel}
            onAction={() => router.push('/search')}
          />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.conversationId}
            renderItem={({ item }) => <ConversationListItem conversation={item} onPress={() => openConversation(item)} />}
            ItemSeparatorComponent={Divider}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={theme.textSecondary} />}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    </AppearanceBackground>
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
  listContent: {
    flexGrow: 1,
  },
});
