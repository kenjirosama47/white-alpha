import { useCallback, useEffect, useState } from 'react';

import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type NotificationPreferences,
} from '@/services/notification-preferences';

type UseNotificationPreferencesResult = {
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  refresh: () => void;
  /** Sauvegarde optimiste : applique le changement localement, puis confirme côté serveur (revert en cas d'échec). */
  update: (next: NotificationPreferences) => Promise<boolean>;
};

/** Préférences de notification de l'utilisateur connecté (écran Profil → Notifications). Même structure chargement/erreur que use-my-profile.ts. */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMyNotificationPreferences()
      .then((result) => {
        setPreferences(result);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    load();
  }, [load]);

  const update = useCallback(async (next: NotificationPreferences) => {
    const previous = preferences;
    setPreferences(next);
    setIsSaving(true);
    setError(null);
    try {
      const confirmed = await updateMyNotificationPreferences(next);
      setPreferences(confirmed);
      return true;
    } catch (err) {
      setPreferences(previous);
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [preferences]);

  return { preferences, isLoading, isSaving, error, refresh, update };
}
