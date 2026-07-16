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
  const isVideoMessage = message.attachment?.mediaType === 'video';
  const [confirming, setConfirming] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);

  const isDeleting = deletionState?.status === 'deleting';
  // Masqué dès qu'une suppression est en cours de confirmation, en cours, ou
  // en échec (le bloc sous la bulle affiche alors déjà Confirmer/Suppression…/
  // Réessayer) : évite deux affordances de suppression actives en même temps
  // pour la même vidéo, et referme proprement le point d'entrée pendant que
  // la bulle est sur le point d'être retirée de la liste.
  const showVideoMenuButton = isOwnMessage && !confirming && !isDeleting && deletionState?.status !== 'error';

  function handleConfirm() {
    setConfirming(false);
    onDelete?.();
  }

  function handleOpenDeleteFromVideoMenu() {
    setVideoMenuOpen(false);
    setConfirming(true);
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
            <View style={styles.videoWrapper}>
              <MessageVideo
                storagePath={message.attachment.storagePath}
                width={message.attachment.width}
                height={message.attachment.height}
                durationMs={message.attachment.durationMs}
              />
              {showVideoMenuButton && (
                <View style={styles.videoMenuAnchor} pointerEvents="box-none">
                  {/* Point d'entrée dédié : le lien « Supprimer » sous la bulle
                      ne suffit pas pour une vidéo (le rendu natif Android de
                      VideoView peut le recouvrir, voir surfaceType dans
                      message-video.tsx). Ce bouton reste hors de la zone du
                      lecteur, jamais capté par ses contrôles. */}
                  <Pressable
                    onPress={() => setVideoMenuOpen((open) => !open)}
                    hitSlop={10}
                    accessibilityLabel="Options du message vidéo"
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.videoMenuButton, pressed && styles.pressed]}>
                    <ThemedText type="smallBold" style={styles.videoMenuIcon}>
                      ⋮
                    </ThemedText>
                  </Pressable>
                  {videoMenuOpen && (
                    <>
                      <Pressable
                        style={styles.videoMenuBackdrop}
                        onPress={() => setVideoMenuOpen(false)}
                        accessibilityLabel="Fermer le menu"
                      />
                      <View style={styles.videoMenuDropdown}>
                        <Pressable
                          onPress={handleOpenDeleteFromVideoMenu}
                          hitSlop={8}
                          style={({ pressed }) => [styles.videoMenuItem, pressed && styles.pressed]}>
                          <ThemedText type="small" style={styles.confirmLabel}>
                            Supprimer
                          </ThemedText>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
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
            ) : !isVideoMessage ? (
              // Pour une vidéo, le déclencheur est le menu ⋮ au-dessus (voir
              // videoMenuAnchor) : le lien texte ici serait sous la même
              // zone potentiellement recouverte par le lecteur natif.
              <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Supprimer
                </ThemedText>
              </Pressable>
            ) : null}
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
  videoWrapper: {
    position: 'relative',
    // Sans ça, ce View (enfant direct d'un View flex-column) s'étire par
    // défaut sur toute la largeur de la bulle : le bouton ⋮ ancré à `right`
    // se retrouverait hors de la vidéo réelle (max 240px) au lieu de son
    // coin supérieur droit visible.
    alignSelf: 'flex-start',
  },
  videoMenuAnchor: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    // Au-dessus du lecteur vidéo natif : zIndex/elevation sont une défense
    // supplémentaire, le vrai correctif étant surfaceType="textureView" dans
    // message-video.tsx (sans lui, une SurfaceView Android ignore l'ordre
    // d'empilement React Native quel que soit zIndex/elevation ici).
    zIndex: 20,
    elevation: 20,
  },
  videoMenuButton: {
    minWidth: 32,
    minHeight: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000B3',
  },
  videoMenuIcon: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 18,
  },
  videoMenuBackdrop: {
    position: 'absolute',
    // Couvre toute la bulle (pas seulement la vidéo) pour fermer le menu au
    // toucher n'importe où ailleurs, y compris sur la vidéo elle-même.
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 20,
    elevation: 20,
  },
  videoMenuDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 120,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.half,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 21,
    elevation: 21,
  },
  videoMenuItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
