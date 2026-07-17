import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logDebugEvent } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

/**
 * Journal des événements push : jamais de token complet, jamais de contenu —
 * une catégorie fixe uniquement (même discipline que logAuthStorageEvent).
 * Désactivé en Release (voir logDebugEvent).
 */
function logPushEvent(category: string): void {
  logDebugEvent(`[White Alpha][push] ${category}`);
}

/** Ne journalise jamais un token complet, seulement un préfixe court à des fins de corrélation. */
function redactToken(token: string): string {
  return `${token.slice(0, 12)}…(${token.length})`;
}

const LAST_TOKEN_STORAGE_KEY = 'white-alpha-last-push-token';
export const MESSAGES_CHANNEL_ID = 'messages';

/**
 * Détermine si les notifications s'affichent pendant que l'app est au
 * premier plan. Appelée une seule fois au chargement du module (natif
 * uniquement) — même principe que `ScreenCapture.preventScreenCaptureAsync`
 * appelé par défaut au démarrage dans `src/app/_layout.tsx`.
 */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * (Re)crée le canal Android "messages" avec la visibilité d'écran verrouillé
 * demandée. Un canal existant ne peut pas changer de visibilité une fois créé
 * (limite documentée d'expo-notifications) : on le supprime puis le recrée à
 * chaque changement de préférence. Contenu déjà générique par conception
 * (voir notify-new-message) : cette préférence ne fait qu'anticiper une
 * éventuelle évolution future du contenu affiché.
 */
export async function ensureAndroidNotificationChannelAsync(lockScreenPreview: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.deleteNotificationChannelAsync(MESSAGES_CHANNEL_ID);
  } catch {
    // Canal inexistant au premier appel : ignoré.
  }
  try {
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: lockScreenPreview
        ? Notifications.AndroidNotificationVisibility.PUBLIC
        : Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch {
    logPushEvent('Configuration du canal Android impossible.');
  }
}

/**
 * Demande la permission de notification si nécessaire. Ne bloque jamais la
 * messagerie : un refus retourne simplement `false`, sans lever d'erreur.
 */
async function requestPushPermissionAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    logPushEvent('Vérification/demande de permission impossible.');
    return false;
  }
}

async function rememberLastToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_TOKEN_STORAGE_KEY, token);
  } catch {
    logPushEvent('Impossible de mémoriser le token localement.');
  }
}

async function readLastToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_TOKEN_STORAGE_KEY);
  } catch {
    logPushEvent('Impossible de lire le token mémorisé localement.');
    return null;
  }
}

async function forgetLastToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_TOKEN_STORAGE_KEY);
  } catch {
    logPushEvent('Impossible de supprimer le token mémorisé localement.');
  }
}

/**
 * Enregistre (ou réactive) le token push de cet appareil pour l'utilisateur
 * actuellement connecté. Appelée après une connexion réussie et au démarrage
 * si une session existe déjà. Best-effort à chaque étape : un refus de
 * permission, une absence de connectivité ou un échec réseau n'empêchent
 * jamais l'utilisation normale de la messagerie (exigence explicite).
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (Platform.OS === 'web') return;

  const granted = await requestPushPermissionAsync();
  if (!granted) {
    logPushEvent('Permission de notification refusée ou non accordée.');
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    logPushEvent('projectId EAS introuvable, enregistrement du token annulé.');
    return;
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    logPushEvent('Impossible d\'obtenir le token push Expo.');
    return;
  }

  try {
    const { error } = await supabase.rpc('register_push_device', {
      p_expo_push_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_device_name: Device.deviceName ?? null,
      p_app_version: Constants.expoConfig?.version ?? null,
    });
    if (error) {
      logPushEvent('Échec de l\'enregistrement du token côté serveur.');
      return;
    }
    await rememberLastToken(token);
    logPushEvent(`Token enregistré (${redactToken(token)}).`);
  } catch {
    logPushEvent('Échec réseau pendant l\'enregistrement du token.');
  }
}

/**
 * Désactive uniquement le token de l'appareil courant (jamais les autres
 * appareils du même utilisateur). Appelée à la déconnexion, avant le
 * nettoyage de la session. Best-effort : un échec réseau ne bloque jamais la
 * déconnexion elle-même.
 */
export async function deactivateCurrentDevicePushTokenAsync(): Promise<void> {
  const token = await readLastToken();
  if (!token) return;

  try {
    await supabase.rpc('deactivate_push_device', { p_expo_push_token: token });
    logPushEvent('Token désactivé à la déconnexion.');
  } catch {
    logPushEvent('Échec de la désactivation du token à la déconnexion.');
  } finally {
    await forgetLastToken();
  }
}
