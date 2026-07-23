import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  /** Retire le média actuel et rouvre immédiatement le menu trombone (Photo/Vidéo). Sans effet pendant un upload en cours. */
  onReplace: () => void;
};

/** Aperçu du média sélectionné (photo ou vidéo) avant envoi, avec Annuler/Remplacer/Envoyer, progression et annulation d'upload. */
export function AttachmentComposerPreview({
  media,
  isUploading,
  uploadProgress,
  error,
  onCancel,
  onCancelUpload,
  onSend,
  onReplace,
}: AttachmentComposerPreviewProps) {
  // Palette sombre imposée (Anomalie 2, build 16) — voir message-bubble.tsx.
  const theme = useTheme('dark');

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
      <View style={styles.row}>
        {media.kind === 'image' ? (
          <Image source={{ uri: media.data.uri }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={[styles.videoThumbnail, { backgroundColor: theme.surface }]}>
            <ThemedText type="label" forcedScheme="dark" style={styles.videoIcon}>
              ▶
            </ThemedText>
          </View>
        )}
        <View style={styles.actions}>
          {media.kind === 'video' && (
            <ThemedText type="caption" themeColor="textSecondary" forcedScheme="dark">
              {formatDuration(media.data.durationMs ?? 0)}
              {media.data.sizeBytes != null ? ` · ${formatFileSize(media.data.sizeBytes)}` : ''}
            </ThemedText>
          )}
          {error && (
            <ThemedText type="caption" themeColor="danger" forcedScheme="dark">
              {error}
            </ThemedText>
          )}
          <View style={styles.buttonsRow}>
            <Button label="Annuler" onPress={onCancel} disabled={isUploading} variant="secondary" size="small" forcedScheme="dark" />
            <Button
              label="Remplacer"
              onPress={onReplace}
              disabled={isUploading}
              variant="secondary"
              size="small"
              forcedScheme="dark"
            />
            {/* Un message d'erreur affiché signale une tentative précédente
                échouée : ce même bouton relance l'envoi (reprise pour une
                vidéo, nouveau chemin Storage pour une photo), sans jamais
                redemander le fichier. */}
            <Button
              label={error ? 'Réessayer' : 'Envoyer'}
              onPress={onSend}
              loading={isUploading}
              size="small"
              forcedScheme="dark"
            />
            {isUploading && media.kind === 'video' && (
              <Pressable onPress={onCancelUpload} hitSlop={8} style={({ pressed }) => [styles.cancelUpload, pressed && styles.pressed]}>
                <ThemedText type="label" themeColor="danger" forcedScheme="dark">
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
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { width: `${uploadProgress}%`, backgroundColor: theme.accent }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
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
    borderRadius: Radius.sm,
  },
  videoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    gap: Spacing.two,
  },
  cancelUpload: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
