import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

type NetworkStatus = {
  isOffline: boolean;
  /** `true` pendant quelques secondes juste après un retour de connexion (pour afficher « Connexion rétablie »), puis retombe à `false`. */
  justReconnected: boolean;
};

const RECONNECTED_BANNER_DURATION_MS = 3000;

/**
 * État de connexion réseau global, basé sur `@react-native-community/netinfo`
 * (fonctionne sur Android et sur Web). `isConnected` peut valoir `null`
 * pendant que NetInfo détermine encore l'état initial : traité comme
 * « connecté » (optimiste), seul un `false` explicite déclenche le mode
 * hors ligne — évite un faux bandeau au tout premier rendu.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let wasOffline = false;
    let reconnectedTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      setIsOffline(offline);

      if (wasOffline && !offline) {
        setJustReconnected(true);
        if (reconnectedTimeout) clearTimeout(reconnectedTimeout);
        reconnectedTimeout = setTimeout(() => setJustReconnected(false), RECONNECTED_BANNER_DURATION_MS);
      }
      wasOffline = offline;
    });

    return () => {
      unsubscribe();
      if (reconnectedTimeout) clearTimeout(reconnectedTimeout);
    };
  }, []);

  return { isOffline, justReconnected };
}
