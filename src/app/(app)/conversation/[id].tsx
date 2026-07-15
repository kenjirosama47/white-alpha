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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachmentComposerPreview } from '@/components/attachment-composer-preview';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { MessageBubble } from '@/components/message-bubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useMediaUpload } from '@/hooks/use-media-upload';
import { useMessages } from '@/hooks/use-messages';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';

export default function ConversationScreen() {
  const { id, otherDisplayName } = useLocalSearchParams<{
    id: string;
    otherUsername?: string;
    otherDisplayName?: string;
  }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { messages, isLoading, isLoadingMore, error, sendError, isSending, loadMore, send } =
    useMessages(id);
  const {
    pickedImage,
    isUploading: isSendingImage,
    error: imageError,
    pick: pickImage,
    cancel: cancelImage,
    send: sendImage,
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

  // Sélectionner/annuler une photo ne touche jamais au brouillon texte : il
  // reste disponible pour un envoi séparé, avant ou après la photo.
  async function handleSendImage() {
    await sendImage();
  }

  return (
    <ThemedView style={styles.container}>
      {/* edges sans 'bottom' : l'inset bas (barre de navigation Android en
          edge-to-edge) est géré explicitement sur la zone de rédaction
          ci-dessous, pas ici, pour éviter un double espacement quand le
          clavier est ouvert. */}
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

        {/* L'en-tête reste au-dessus, hors du KeyboardAvoidingView, donc
            jamais déplacé par le clavier. Seuls la liste et le composer se
            partagent l'espace restant et remontent au-dessus du clavier.
            keyboardVerticalOffset=0 : rien d'autre ne chevauche cette zone. */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
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
              style={styles.messageList}
              data={invertedMessages}
              keyExtractor={(item) => item.id}
              inverted
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  isOwnMessage={item.senderId === session?.user.id}
                  onImagePress={setViewerUrl}
                />
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
              // Liste inversée : paddingTop est le padding visuellement en
              // bas (proche du composer), paddingBottom celui visuellement
              // en haut (proche de l'en-tête).
              contentContainerStyle={styles.listContent}
            />
          )}

          {sendError && (
            <ThemedText type="small" style={styles.error}>
              {sendError}
            </ThemedText>
          )}
          {imageError && !pickedImage && (
            <ThemedText type="small" style={styles.error}>
              {imageError}
            </ThemedText>
          )}
          {pickedImage && (
            <AttachmentComposerPreview
              image={pickedImage}
              isUploading={isSendingImage}
              error={imageError}
              onCancel={cancelImage}
              onSend={handleSendImage}
            />
          )}
          <ThemedView
            style={[
              styles.inputRow,
              // Espace la barre de navigation Android (edge-to-edge) quand
              // le clavier est fermé ; jamais en position absolute.
              { paddingBottom: Math.max(insets.bottom, Spacing.two) },
            ]}>
            <Pressable
              onPress={pickImage}
              disabled={!!pickedImage || isSendingImage}
              hitSlop={8}
              style={({ pressed }) => [
                styles.photoButton,
                { borderColor: theme.backgroundSelected },
                (pressed || !!pickedImage || isSendingImage) && styles.pressed,
              ]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Photo
              </ThemedText>
            </Pressable>
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
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  keyboardAvoiding: {
    flex: 1,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  photoButton: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
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
