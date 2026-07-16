import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSignedAttachmentUrl } from '@/hooks/use-signed-attachment-url';
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
  const { url, isLoading, error: urlError, refresh } = useSignedAttachmentUrl(storagePath);
  const [hasStarted, setHasStarted] = useState(false);
  const aspectRatio = width && height ? width / height : FALLBACK_ASPECT_RATIO;

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
    return (
      <Pressable onPress={retry} style={[styles.placeholder, { aspectRatio }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          {playerError?.message ? 'Lecture impossible.' : "Vidéo indisponible."} Toucher pour réessayer.
        </ThemedText>
      </Pressable>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.placeholder, { aspectRatio }]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!hasStarted) {
    return (
      <Pressable onPress={handlePlayPress} style={[styles.placeholder, { aspectRatio }]}>
        <View style={styles.playButton}>
          <ThemedText type="smallBold" style={styles.playIcon}>
            ▶
          </ThemedText>
        </View>
        <ThemedText type="small" style={styles.duration}>
          {formatDuration(durationMs)}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.videoContainer, { aspectRatio }]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls
        allowsPictureInPicture={false}
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
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
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000014',
    padding: Spacing.two,
    gap: Spacing.two,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderRadius: Spacing.two,
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
