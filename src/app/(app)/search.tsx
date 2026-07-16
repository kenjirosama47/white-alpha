import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { ProfileSearchResult } from '@/components/profile-search-result';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserSearch } from '@/hooks/use-user-search';
import { getOrCreateConversation } from '@/services/conversations';
import { SEARCH_MIN_LENGTH, type PublicProfile } from '@/types/chat';

export default function SearchScreen() {
  const theme = useTheme();
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
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle">Rechercher</ThemedText>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

        <TextInput
          placeholder="Rechercher par pseudo ou nom..."
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoFocus
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {tooShort && (
          <ThemedText type="small" themeColor="textSecondary">
            Tape au moins {SEARCH_MIN_LENGTH} caractères pour lancer la recherche.
          </ThemedText>
        )}

        {openError && (
          <ThemedText type="small" style={styles.error}>
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
          <AppEmptyState title="Aucun utilisateur trouvé" />
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
  headerSpacer: {
    width: 50,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D14343',
  },
  listContent: {
    gap: Spacing.one,
  },
});
