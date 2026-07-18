import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useSignedAttachmentUrl } from '@/hooks/use-signed-attachment-url';
import { useTheme } from '@/hooks/use-theme';
import { restoreAccessibilityFocus } from '@/utils/accessibility-focus';
import { formatDuration } from '@/utils/format';

type MessageVideoProps = {
  storagePath: string;
  width: number | null;
  height: number | null;
  durationMs: number;
};

const FALLBACK_ASPECT_RATIO = 16 / 9;

/**
 * Vidéo d'une pièce jointe dans une bulle de message. Fond neutre + icône
 * lecture tant que l'utilisateur n'a pas touché (aucune miniature générée,
 * aucune lecture automatique) ; le lecteur natif n'est chargé qu'à ce
 * moment-là (`player.replaceAsync`), contrôles natifs, plein écran autorisé,
 * PiP et lecture en arrière-plan désactivés.
 */
export function MessageVideo({ storagePath, width, height, durationMs }: MessageVideoProps) {
  // Palette sombre imposée (Anomalie 2, build 16) — voir message-bubble.tsx.
  const theme = useTheme('dark');
  const { url, isLoading, error: urlError, refresh } = useSignedAttachmentUrl(storagePath);
  const [hasStarted, setHasStarted] = useState(false);
  const aspectRatio = width && height ? width / height : FALLBACK_ASPECT_RATIO;
  // Restauration du focus d'accessibilité après le plein écran natif (Phase
  // 7.6) : avant la lecture, l'élément visible est le bouton ▶ ; une fois la
  // lecture démarrée, ce bouton est démonté et remplacé par `VideoView`
  // elle-même — c'est donc elle qui reçoit le focus à la sortie du plein
  // écran (seul élément encore réellement monté à ce moment-là, au même
  // endroit visuel que le bouton initial). Si le message est supprimé
  // pendant que le plein écran est ouvert, cette ref redevient null avant
  // l'appel : `restoreAccessibilityFocus` ne fait alors rien, sans jamais
  // planter.
  const videoViewRef = useRef<VideoView>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.staysActiveInBackground = false;
  });

  const { status, error: playerError } = useEvent(player, 'statusChange', { status: player.status });

  // `useVideoPlayer` release déjà le lecteur automatiquement au démontage
  // (voir sa documentation). Un appel explicite à `player.pause()` ici serait
  // exécuté APRÈS ce nettoyage automatique (les cleanups s'exécutent dans
  // l'ordre de déclaration des effets, et useVideoPlayer/useReleasingSharedObject
  // est déclaré avant ce composant) : côté natif Android, `release()` planifie
  // `player.release()` sur le lecteur ExoPlayer sous-jacent
  // (VideoPlayer.kt#close, GlobalScope.launch(Dispatchers.Main)) ; appeler
  // ensuite `.pause()` sur ce lecteur déjà (ou en cours de) libéré fait
  // planter l'app (crash natif Android, jamais rattrapable côté JS) — c'est
  // précisément ce qui provoquait la fermeture de White Alpha après une
  // suppression de vidéo (Phase 5.4). Rien à faire ici : ne jamais appeler de
  // méthode sur `player` depuis un cleanup, laisser useVideoPlayer gérer seul
  // tout le cycle de vie du lecteur.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handlePlayPress() {
    if (!url) return;
    setHasStarted(true);
    await player.replaceAsync(url);
    // Le composant (donc le lecteur) peut avoir été démonté pendant cet
    // await (ex. suppression du message pendant le chargement) : `player` ne
    // doit alors plus être touché, pour la même raison que ci-dessus.
    if (!mountedRef.current) return;
    player.play();
  }

  function retry() {
    setHasStarted(false);
    refresh();
  }

  if (urlError || status === 'error') {
    const message = `${playerError?.message ? 'Lecture impossible.' : 'Vidéo indisponible.'} Toucher pour réessayer.`;
    return (
      <Pressable
        onPress={retry}
        style={[styles.placeholder, { aspectRatio, backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel={message}>
        <ThemedText type="small" themeColor="textSecondary" forcedScheme="dark" style={styles.centeredText}>
          {message}
        </ThemedText>
      </Pressable>
    );
  }

  if (isLoading) {
    return (
      <View
        style={[styles.placeholder, { aspectRatio, backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Chargement de la vidéo">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!hasStarted) {
    return (
      <Pressable
        onPress={handlePlayPress}
        style={[styles.placeholder, { aspectRatio, backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel={`Lire la vidéo, durée ${formatDuration(durationMs)}`}>
        <View style={styles.playButton}>
          <ThemedText type="smallBold" forcedScheme="dark" style={styles.playIcon}>
            ▶
          </ThemedText>
        </View>
        <ThemedText type="small" forcedScheme="dark" style={styles.duration}>
          {formatDuration(durationMs)}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.videoContainer, { aspectRatio }]}>
      <VideoView
        ref={videoViewRef}
        style={styles.video}
        player={player}
        nativeControls
        allowsPictureInPicture={false}
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
        onFullscreenExit={() => restoreAccessibilityFocus(videoViewRef.current)}
        // Par défaut ('surfaceView'), Android rend la vidéo sur une couche de
        // composition séparée qui ignore l'ordre d'empilement React Native et
        // peut recouvrir des vues sœurs (ex. le menu Supprimer) même quand
        // celles-ci sont placées après elle dans l'arbre — c'est le
        // comportement documenté par expo-video lui-même pour ce prop
        // ("overlapping video views"). 'textureView' fait participer la
        // vidéo à l'empilement normal des vues Android.
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      />
      {status === 'loading' && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    maxWidth: 240,
    minHeight: 120,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
    gap: Spacing.two,
  },
  // Bouton lecture/badge durée : « chrome » superposé à une vignette vidéo
  // par nature imprévisible (pas de couleur de fond fixe), au même titre que
  // le menu ⋮ des vidéos dans message-bubble.tsx et le fond du visualiseur
  // plein écran — noir/blanc conservés volontairement, non issus du thème.
  playButton: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    borderRadius: TouchTarget.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000B3',
  },
  playIcon: {
    color: '#ffffff',
    fontSize: 16,
  },
  duration: {
    color: '#ffffff',
    backgroundColor: '#000000B3',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  centeredText: {
    textAlign: 'center',
  },
  videoContainer: {
    width: '100%',
    maxWidth: 240,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000040',
  },
});
