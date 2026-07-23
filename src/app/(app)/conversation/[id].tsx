import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppEmptyState } from '@/components/app-empty-state';
import { AppErrorState } from '@/components/app-error-state';
import { AppearanceBackground } from '@/components/appearance-background';
import { AppLoadingState } from '@/components/app-loading-state';
import { AttachmentComposerPreview } from '@/components/attachment-composer-preview';
import { AttachmentMenu } from '@/components/attachment-menu';
import { AvatarImage } from '@/components/avatar-image';
import { Button } from '@/components/button';
import { DateSeparator } from '@/components/date-separator';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { MessageBubble } from '@/components/message-bubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isWolfAvatarId } from '@/constants/avatars';
import { MaxContentWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { clearConversation } from '@/services/conversations';
import { useMediaUpload } from '@/hooks/use-media-upload';
import { useMessageDeletion } from '@/hooks/use-message-deletion';
import { useMessages } from '@/hooks/use-messages';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';
import { isSameLocalDay, formatDateSeparator } from '@/utils/datetime';

/**
 * Correctif A1 (build 21) : extrait en fonction pure et exportée pour être
 * testable directement (RNTL v14 ne permet plus d'inspecter les props
 * internes de `KeyboardAvoidingView`). `undefined` sur Android : seul
 * `android:windowSoftInputMode="adjustResize"` (AndroidManifest.xml, déjà
 * correct) gère le clavier — `behavior="height"` combiné à `adjustResize`
 * provoquait un double redimensionnement qui masquait le trombone à
 * l'ouverture du clavier (voir commentaire au-dessus du KeyboardAvoidingView
 * ci-dessous).
 */
export function getConversationKeyboardAvoidingBehavior(platformOS: string): 'padding' | undefined {
  return platformOS === 'ios' ? 'padding' : undefined;
}

export default function ConversationScreen() {
  const { id, otherDisplayName, otherAvatarUrl, otherAvatarPreset } = useLocalSearchParams<{
    id: string;
    otherUsername?: string;
    otherDisplayName?: string;
    otherAvatarUrl?: string;
    otherAvatarPreset?: string;
  }>();
  // Les route params ne connaissent que des chaînes : une valeur absente ou
  // corrompue retombe silencieusement sur `undefined` (AvatarImage bascule
  // alors sur l'initiale), jamais une valeur inventée.
  const otherWolfPreset = otherAvatarPreset && isWolfAvatarId(otherAvatarPreset) ? otherAvatarPreset : undefined;
  // Palette sombre imposée indépendamment du thème système (Anomalie 2,
  // build 16) : l'environnement de discussion reste toujours sombre, choix
  // de direction visuelle délibéré, distinct du reste de l'app (qui continue
  // de suivre le thème système). Ne touche ni Realtime, ni les messages, ni
  // les uploads, ni Supabase.
  const theme = useTheme('dark');
  const reduceMotion = useReducedMotion();
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
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [isClearingConversation, setIsClearingConversation] = useState(false);
  const [clearConversationError, setClearConversationError] = useState<string | null>(null);
  // Élément (vignette pressée) sur lequel restaurer le focus d'accessibilité
  // à la fermeture de la visionneuse — une ref, jamais un state : sa valeur
  // n'a besoin d'aucun re-rendu, seulement d'être lue au moment de fermer.
  const imageViewerTriggerRef = useRef<View | null>(null);

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

  /** Confirmation explicite avant toute suppression, jamais déclenchée deux fois pendant qu'une suppression est déjà en cours (voir handleConfirmClearConversation). */
  function handleClearConversationPress() {
    if (isClearingConversation) return;
    Alert.alert(
      'Effacer toute la conversation ?',
      'Tous les messages et médias de cette conversation seront définitivement supprimés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer définitivement', style: 'destructive', onPress: handleConfirmClearConversation },
      ],
    );
  }

  /** Effacement réel côté serveur (voir services/conversations.ts). `isClearingConversation` empêche tout double appel (double tap sur le bouton destructif). */
  async function handleConfirmClearConversation() {
    if (isClearingConversation) return;
    setIsClearingConversation(true);
    setClearConversationError(null);
    try {
      await clearConversation(id);
      router.back();
    } catch (err) {
      setClearConversationError(
        err instanceof Error ? err.message : 'Impossible d’effacer la conversation pour le moment.',
      );
      setIsClearingConversation(false);
    }
  }

  return (
    <AppearanceBackground slot="conversation" forcedScheme="dark" style={styles.container} testID="conversation-appearance-background">
      {/* edges sans 'bottom' : l'inset bas (barre de navigation Android en
          edge-to-edge) est géré explicitement sur la zone de rédaction
          ci-dessous, pas ici, pour éviter un double espacement quand le
          clavier est ouvert. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedView forcedScheme="dark" style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
            <ThemedText type="link" themeColor="textSecondary" forcedScheme="dark">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedView forcedScheme="dark" style={styles.headerIdentity}>
            <AvatarImage
              avatarUrl={otherAvatarUrl || null}
              wolfPreset={otherWolfPreset}
              displayName={otherDisplayName ?? '?'}
              size={36}
              forcedScheme="dark"
            />
            <ThemedText type="label" numberOfLines={1} forcedScheme="dark" style={styles.headerTitle}>
              {otherDisplayName ?? 'Discussion'}
            </ThemedText>
          </ThemedView>
          <Pressable
            onPress={handleClearConversationPress}
            disabled={isClearingConversation}
            hitSlop={8}
            style={styles.headerSpacer}
            accessibilityRole="button"
            accessibilityLabel="Effacer la conversation"
            accessibilityState={{ disabled: isClearingConversation }}>
            <MaterialCommunityIcons testID="clear-conversation-icon" name="brush" size={22} color={theme.text} allowFontScaling={false} />
          </Pressable>
        </ThemedView>
        {clearConversationError && (
          <ThemedText
            type="bodySmall"
            themeColor="danger"
            forcedScheme="dark"
            style={styles.errorPadding}
            accessibilityRole="alert">
            {clearConversationError}
          </ThemedText>
        )}

        {/* L'en-tête reste au-dessus, hors du KeyboardAvoidingView, donc
            jamais déplacé par le clavier. Seuls la liste et le composer se
            partagent l'espace restant et remontent au-dessus du clavier.
            keyboardVerticalOffset=0 : rien d'autre ne chevauche cette zone.
            Correctif A1 (build 21) : `behavior="height"` sur Android était
            cumulé à `android:windowSoftInputMode="adjustResize"` (déjà
            correct dans AndroidManifest.xml, non modifié) — les deux
            mécanismes redimensionnaient la zone en même temps, écrasant le
            composeur au point de masquer le trombone à l'ouverture du
            clavier (test réel, appareil physique, police système agrandie).
            `undefined` sur Android : seul `adjustResize` gère le clavier,
            comme documenté officiellement pour ce cas précis. */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={getConversationKeyboardAvoidingBehavior(Platform.OS)}
          keyboardVerticalOffset={0}>
          {isLoading ? (
            <AppLoadingState accessibilityLabel="Chargement des messages" forcedScheme="dark" />
          ) : error ? (
            <AppErrorState description={error} onRetry={retryInitialLoad} forcedScheme="dark" />
          ) : messages.length === 0 ? (
            <AppEmptyState title="Aucun message pour le moment" description="Écris le premier !" forcedScheme="dark" />
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
                  <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(200)}>
                    {showDateSeparator && <DateSeparator label={formatDateSeparator(item.createdAt)} />}
                    <MessageBubble
                      message={item}
                      isOwnMessage={isOwnMessage}
                      onImagePress={(pressedUrl, triggerNode) => {
                        imageViewerTriggerRef.current = triggerNode;
                        setViewerUrl(pressedUrl);
                      }}
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
                  <ThemedView forcedScheme="dark" style={styles.loadingMore}>
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
            <ThemedText
              type="bodySmall"
              themeColor="danger"
              forcedScheme="dark"
              style={styles.errorPadding}
              accessibilityRole="alert">
              {sendError}
            </ThemedText>
          )}
          {mediaError && !pickedMedia && (
            <ThemedText
              type="bodySmall"
              themeColor="danger"
              forcedScheme="dark"
              style={styles.errorPadding}
              accessibilityRole="alert">
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
              onReplace={() => {
                cancelMedia();
                setAttachmentMenuVisible(true);
              }}
            />
          )}
          {/* Composeur « carte sombre » (Anomalie 2, build 16) : élevé sur le
              fond noir profond de l'écran (surfaceHigh + bordure discrète),
              bouton d'envoi circulaire vert forêt, boutons pièce jointe
              sobres (variante ghost, sans encadré). marginBottom (plutôt
              qu'un paddingBottom interne) espace la carte de la barre de
              navigation Android (edge-to-edge) sans l'étirer. */}
          <ThemedView
            forcedScheme="dark"
            style={[
              styles.inputRow,
              { borderColor: theme.border, backgroundColor: theme.surfaceHigh },
              { marginBottom: Math.max(insets.bottom, Spacing.two) },
            ]}>
            <Pressable
              onPress={() => setAttachmentMenuVisible(true)}
              disabled={!!pickedMedia || isUploadingMedia}
              hitSlop={8}
              style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une pièce jointe"
              accessibilityState={{ disabled: !!pickedMedia || isUploadingMedia }}>
              <MaterialCommunityIcons testID="attachment-icon" name="paperclip" size={24} color={theme.text} allowFontScaling={false} />
            </Pressable>
            <AttachmentMenu
              visible={attachmentMenuVisible}
              onClose={() => setAttachmentMenuVisible(false)}
              onPickImage={pickImage}
              onPickVideo={pickVideo}
            />
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
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
            />
            <Button
              label="➤"
              onPress={handleSend}
              disabled={!draft.trim()}
              loading={isSending}
              accessibilityLabel="Envoyer le message"
              forcedScheme="dark"
              style={styles.sendButton}
            />
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <ImageViewerModal url={viewerUrl} onClose={() => setViewerUrl(null)} triggerRef={imageViewerTriggerRef} />
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
    // Correctif A2 (build 20) : hauteur plancher stable, indépendante du
    // contenu — avant le passage aux icônes vectorielles à taille fixe
    // (volet 1), un glyphe emoji agrandi par la taille de police système
    // étirait cette barre bien au-delà de sa hauteur voulue.
    minHeight: TouchTarget.comfortable + Spacing.two * 2,
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
    width: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    // Correctif A1 (build 20) : hauteur plancher stable — même raison que
    // `header` ci-dessus. Le trombone reste garanti visible/cliquable au
    // lieu d'être écrasé par une ligne qui rétrécirait sous sa taille
    // minimale voulue.
    minHeight: TouchTarget.min + Spacing.two * 2,
  },
  attachmentButton: {
    width: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 120,
    minHeight: TouchTarget.min,
  },
  sendButton: {
    width: TouchTarget.comfortable,
    height: TouchTarget.comfortable,
    minHeight: TouchTarget.comfortable,
    borderRadius: Radius.pill,
    paddingHorizontal: 0,
  },
});
