import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { ProfileSearchResult } from '@/components/profile-search-result';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SEARCH_COPY } from '@/constants/copy';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useUserSearch } from '@/hooks/use-user-search';
import { getOrCreateConversation } from '@/services/conversations';
import { SEARCH_MIN_LENGTH, type PublicProfile } from '@/types/chat';

export default function SearchScreen() {
  const { query, setQuery, results, isSearching, error } = useUserSearch();
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const trimmedLength = query.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < SEARCH_MIN_LENGTH;

  async function handleSelect(profile: PublicProfile) {
    if (openingUserId) return;
    setOpenError(null);
    setOpeningUserId(profile.id);
    try {
      const conversationId = await getOrCreateConversation(profile.id);
      router.replace({
        pathname: '/conversation/[id]',
        params: {
          id: conversationId,
          otherUsername: profile.username,
          otherDisplayName: profile.displayName,
          otherAvatarUrl: profile.avatarUrl ?? '',
          otherAvatarPreset: profile.avatarPreset,
        },
      });
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setOpeningUserId(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Rechercher" />

        <TextField
          placeholder="Rechercher par pseudo ou nom..."
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Rechercher un membre"
          rightAccessory={
            query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche">
                <ThemedText type="label" themeColor="textSecondary">
                  ✕
                </ThemedText>
              </Pressable>
            ) : undefined
          }
        />

        {tooShort && (
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Tape au moins {SEARCH_MIN_LENGTH} caractères pour lancer la recherche.
          </ThemedText>
        )}

        {openError && (
          <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
            {openError}
          </ThemedText>
        )}

        {isSearching ? (
          <AppLoadingState accessibilityLabel="Recherche en cours" />
        ) : error ? (
          <AppErrorState description={error} />
        ) : trimmedLength === 0 ? (
          <AppEmptyState title="Rechercher un utilisateur" description="Tape un pseudo ou un nom pour commencer." />
        ) : trimmedLength >= SEARCH_MIN_LENGTH && results.length === 0 ? (
          <AppEmptyState title={SEARCH_COPY.noResultsTitle} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ProfileSearchResult
                profile={item}
                onPress={() => handleSelect(item)}
                disabled={openingUserId === item.id}
              />
            )}
            keyboardShouldPersistTaps="handled"
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
  listContent: {
    flexGrow: 1,
  },
});
