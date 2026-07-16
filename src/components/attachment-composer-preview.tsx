import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { PickedMedia } from '@/services/media';
import { formatDuration, formatFileSize } from '@/utils/format';

type AttachmentComposerPreviewProps = {
  media: PickedMedia;
  isUploading: boolean;
  /** Pourcentage 0-100 pendant l'upload d'une vidéo ; `null` sinon (photo, ou pas encore démarré). */
  uploadProgress: number | null;
  error: string | null;
  onCancel: () => void;
  onCancelUpload: () => void;
  onSend: () => void;
};

/** Aperçu du média sélectionné (photo ou vidéo) avant envoi, avec Annuler/Envoyer, progression et annulation d'upload. */
export function AttachmentComposerPreview({
  media,
  isUploading,
  uploadProgress,
  error,
  onCancel,
  onCancelUpload,
  onSend,
}: AttachmentComposerPreviewProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <View style={styles.row}>
        {media.kind === 'image' ? (
          <Image source={{ uri: media.data.uri }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={styles.videoThumbnail}>
            <ThemedText type="smallBold" style={styles.videoIcon}>
              ▶
            </ThemedText>
          </View>
        )}
        <View style={styles.actions}>
          {media.kind === 'video' && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDuration(media.data.durationMs ?? 0)}
              {media.data.sizeBytes != null ? ` · ${formatFileSize(media.data.sizeBytes)}` : ''}
            </ThemedText>
          )}
          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
          <View style={styles.buttonsRow}>
            <Pressable
              onPress={onCancel}
              disabled={isUploading}
              hitSlop={8}
              style={({ pressed }) => [styles.button, (pressed || isUploading) && styles.pressed]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Annuler
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onSend}
              disabled={isUploading}
              style={({ pressed }) => [styles.button, styles.sendButton, (pressed || isUploading) && styles.pressed]}>
              {isUploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={styles.sendButtonLabel}>
                  {/* Un message d'erreur affiché signale une tentative précédente
                      échouée : ce même bouton relance l'envoi (reprise pour une
                      vidéo, nouveau chemin Storage pour une photo), sans jamais
                      redemander le fichier. */}
                  {error ? 'Réessayer' : 'Envoyer'}
                </ThemedText>
              )}
            </Pressable>
            {isUploading && media.kind === 'video' && (
              <Pressable onPress={onCancelUpload} hitSlop={8} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.cancelUploadLabel}>
                  Annuler l’envoi
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </View>
      {/* Reste affichée après un échec reprenable (uploadProgress non réinitialisé
          dans ce cas, voir use-media-upload.ts) : la reprise repartira visiblement
          d'où l'envoi s'est arrêté, pas de 0. */}
      {media.kind === 'video' && uploadProgress != null && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  videoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000029',
  },
  videoIcon: {
    fontSize: 20,
  },
  actions: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  sendButton: {
    backgroundColor: '#208AEF',
  },
  sendButtonLabel: {
    color: '#ffffff',
  },
  cancelUploadLabel: {
    color: '#D14343',
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    color: '#D14343',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00000014',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#208AEF',
  },
});
