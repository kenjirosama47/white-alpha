import { supabase } from '@/lib/supabase';
import { friendlyRpcError } from '@/utils/errors';

export type NotificationPreferences = {
  notificationsEnabled: boolean;
  lockScreenPreview: boolean;
  soundEnabled: boolean;
};

type PreferencesRow = {
  notifications_enabled: boolean;
  lock_screen_preview: boolean;
  sound_enabled: boolean;
};

function mapPreferencesRow(row: PreferencesRow): NotificationPreferences {
  return {
    notificationsEnabled: row.notifications_enabled,
    lockScreenPreview: row.lock_screen_preview,
    soundEnabled: row.sound_enabled,
  };
}

/** Lit les préférences de l'utilisateur connecté (crée une ligne par défaut si nécessaire, voir get_my_notification_preferences). */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('get_my_notification_preferences');

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de charger les préférences de notification.'));
  }

  const row = (Array.isArray(data) ? data[0] : data) as PreferencesRow | undefined;
  if (!row) {
    throw new Error('Impossible de charger les préférences de notification.');
  }

  return mapPreferencesRow(row);
}

/** Met à jour les préférences de l'utilisateur connecté uniquement (jamais celles d'un autre compte). */
export async function updateMyNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('update_my_notification_preferences', {
    p_notifications_enabled: preferences.notificationsEnabled,
    p_lock_screen_preview: preferences.lockScreenPreview,
    p_sound_enabled: preferences.soundEnabled,
  });

  if (error) {
    throw new Error(friendlyRpcError(error, 'Impossible de mettre à jour les préférences de notification.'));
  }

  const row = (Array.isArray(data) ? data[0] : data) as PreferencesRow | undefined;
  if (!row) {
    throw new Error('Impossible de mettre à jour les préférences de notification.');
  }

  return mapPreferencesRow(row);
}
