import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { getConversationForNotification } from '@/services/conversations';

type NotificationData = { conversationId?: unknown };

function extractConversationId(data: unknown): string | null {
  const conversationId = (data as NotificationData | undefined)?.conversationId;
  return typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null;
}

/**
 * Ouvre la conversation correspondante lorsqu'une notification est touchée.
 * Ne fait jamais confiance aux données de la notification au-delà de
 * l'identifiant de conversation qu'elle transporte : revalide la session et
 * l'appartenance à la conversation avant d'ouvrir quoi que ce soit, en
 * rechargeant systématiquement les données depuis Supabase
 * (get_conversation_for_notification). Un accès perdu (conversation
 * supprimée, utilisateur retiré, notification ancienne) ramène proprement à
 * l'écran Conversations plutôt que d'afficher une erreur.
 */
export function useNotificationResponseNavigation(): void {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const conversationId = extractConversationId(response.notification.request.content.data);
      if (!conversationId) return;

      if (!isAuthenticated) {
        // Session absente ou expirée : rien à ouvrir, le flux
        // d'authentification normal reprend la main.
        return;
      }

      getConversationForNotification(conversationId)
        .then((conversation) => {
          if (!conversation) {
            router.replace('/');
            return;
          }
          router.push({
            pathname: '/conversation/[id]',
            params: {
              id: conversation.conversationId,
              otherUsername: conversation.username,
              otherDisplayName: conversation.displayName,
              otherAvatarUrl: conversation.avatarUrl ?? '',
              otherAvatarPreset: conversation.avatarPreset,
            },
          });
        })
        .catch(() => router.replace('/'));
    });

    return () => subscription.remove();
  }, [isAuthenticated]);
}
