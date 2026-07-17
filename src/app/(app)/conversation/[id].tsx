import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { AttachmentComposerPreview } from '@/components/attachment-composer-preview';
import { AvatarImage } from '@/components/avatar-image';
import { Button } from '@/components/button';
import { DateSeparator } from '@/components/date-separator';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { MessageBubble } from '@/components/message-bubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useMediaUpload } from '@/hooks/use-media-upload';
import { useMessageDeletion } from '@/hooks/use-message-deletion';
import { useMessages } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';
import { isSameLocalDay, formatDateSeparator } from '@/utils/datetime';

export default function ConversationScreen() {
  const { id, otherDisplayName, otherAvatarUrl } = useLocalSearchParams<{
    id: string;
    otherUsername?: string;
    otherDisplayName?: string;
    otherAvatarUrl?: string;
  }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const {
    messages,
    isLoading,
    isLoadingMore,
    error,
    sendError,
    isSending,
    loadMore,
    send,
    removeMessageLocally,
    retryInitialLoad,
  } = useMessages(id);
  const { getDeletionState, deleteMessage, retryDeletion } = useMessageDeletion(removeMessageLocally);
  const {
    pickedMedia,
    isUploading: isUploadingMedia,
    uploadProgress,
    error: mediaError,
    pickImage,
    pickVideo,
    cancel: cancelMedia,
    cancelUpload,
    send: sendMedia,
  } = useMediaUpload(id);
  const [draft, setDraft] = useState('');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // FlatList inverted : données du plus récent au plus ancien pour que la
  // vue reste naturellement collée en bas, sur le dernier message.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  async function handleSend() {
    const content = draft;
    if (!content.trim() || isSending) return;
    const success = await send(content);
    // Le champ n'est vidé qu'après un envoi réussi : en cas d'erreur,
    // l'utilisateur ne doit pas perdre ce qu'il a écrit.
    if (success) {
      setDraft('');
    }
  }

  // Sélectionner/annuler un média ne touche jamais au brouillon texte : il
  // reste disponible pour un envoi séparé, avant ou après la photo/vidéo.
  // L'envoi d'un message texte n'est jamais bloqué pendant la préparation
  // d'un média (hooks indépendants), et une seule pièce jointe à la fois
  // peut être en cours de préparation/upload (une seule instance de
  // useMediaUpload par écran de conversation).
  async function handleSendMedia() {
    await sendMedia();
  }

  return (
    <ThemedView style={styles.container}>
      {/* edges sans 'bottom' : l'inset bas (barre de navigation Android en
          edge-to-edge) est géré explicitement sur la zone de rédaction
          ci-dessous, pas ici, pour éviter un double espacement quand le
          clavier est ouvert. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedView style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
            <ThemedText type="link" themeColor="textSecondary">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedView style={styles.headerIdentity}>
            <AvatarImage avatarUrl={otherAvatarUrl || null} displayName={otherDisplayName ?? '?'} size={36} />
            <ThemedText type="label" numberOfLines={1} style={styles.headerTitle}>
              {otherDisplayName ?? 'Discussion'}
            </ThemedText>
          </ThemedView>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

        {/* L'en-tête reste au-dessus, hors du KeyboardAvoidingView, donc
            jamais déplacé par le clavier. Seuls la liste et le composer se
            partagent l'espace restant et remontent au-dessus du clavier.
            keyboardVerticalOffset=0 : rien d'autre ne chevauche cette zone. */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          {isLoading ? (
            <AppLoadingState accessibilityLabel="Chargement des messages" />
          ) : error ? (
            <AppErrorState description={error} onRetry={retryInitialLoad} />
          ) : messages.length === 0 ? (
            <AppEmptyState title="Aucun message pour le moment" description="Écris le premier !" />
          ) : (
            <FlatList
              style={styles.messageList}
              data={invertedMessages}
              keyExtractor={(item) => item.id}
              inverted
              renderItem={({ item, index }) => {
                const isOwnMessage = item.senderId === session?.user.id;
                const olderNeighbor = invertedMessages[index + 1];
                const showDateSeparator = !olderNeighbor || !isSameLocalDay(item.createdAt, olderNeighbor.createdAt);
                return (
                  // entering : apparition légère au montage de CETTE ligne
                  // uniquement (clé stable par message.id) — un message déjà
                  // affiché ne se ré-anime jamais en scrollant/paginant,
                  // seul un message réellement nouveau (ou nouvellement
                  // chargé) déclenche l'animation.
                  <Animated.View entering={FadeIn.duration(200)}>
                    {showDateSeparator && <DateSeparator label={formatDateSeparator(item.createdAt)} />}
                    <MessageBubble
                      message={item}
                      isOwnMessage={isOwnMessage}
                      onImagePress={setViewerUrl}
                      deletionState={isOwnMessage ? getDeletionState(item.id) : null}
                      onDelete={() => deleteMessage(item)}
                      onRetryDelete={() => retryDeletion(item)}
                    />
                  </Animated.View>
                );
              }}
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                isLoadingMore ? (
                  <ThemedView style={styles.loadingMore}>
                    <ActivityIndicator size="small" />
                  </ThemedView>
                ) : null
              }
              // Liste inversée : paddingTop est le padding visuellement en
              // bas (proche du composer), paddingBottom celui visuellement
              // en haut (proche de l'en-tête).
              contentContainerStyle={styles.listContent}
            />
          )}

          {sendError && (
            <ThemedText type="bodySmall" themeColor="danger" style={styles.errorPadding} accessibilityRole="alert">
              {sendError}
            </ThemedText>
          )}
          {mediaError && !pickedMedia && (
            <ThemedText type="bodySmall" themeColor="danger" style={styles.errorPadding} accessibilityRole="alert">
              {mediaError}
            </ThemedText>
          )}
          {pickedMedia && (
            <AttachmentComposerPreview
              media={pickedMedia}
              isUploading={isUploadingMedia}
              uploadProgress={uploadProgress}
              error={mediaError}
              onCancel={cancelMedia}
              onCancelUpload={cancelUpload}
              onSend={handleSendMedia}
            />
          )}
          <ThemedView
            style={[
              styles.inputRow,
              { borderTopColor: theme.border },
              // Espace la barre de navigation Android (edge-to-edge) quand
              // le clavier est fermé ; jamais en position absolute.
              { paddingBottom: Math.max(insets.bottom, Spacing.two) },
            ]}>
            <ThemedView style={styles.mediaButtons}>
              <Button
                label="Photo"
                onPress={pickImage}
                disabled={!!pickedMedia || isUploadingMedia}
                variant="secondary"
                size="small"
                accessibilityLabel="Ajouter une photo"
              />
              <Button
                label="Vidéo"
                onPress={pickVideo}
                disabled={!!pickedMedia || isUploadingMedia}
                variant="secondary"
                size="small"
                accessibilityLabel="Ajouter une vidéo"
              />
            </ThemedView>
            <TextInput
              placeholder="Écrire un message..."
              placeholderTextColor={theme.textSecondary}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={MESSAGE_MAX_LENGTH}
              editable={!isSending}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              accessibilityLabel="Message"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Button
              label="Envoyer"
              onPress={handleSend}
              disabled={!draft.trim()}
              loading={isSending}
              size="small"
              accessibilityLabel="Envoyer le message"
            />
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <ImageViewerModal url={viewerUrl} onClose={() => setViewerUrl(null)} />
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
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  headerTitle: {
    flexShrink: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  listContent: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  loadingMore: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  errorPadding: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 120,
    minHeight: TouchTarget.min,
  },
});
