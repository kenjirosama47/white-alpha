'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { DisplayMessage, MessageRow } from '@/lib/conversations-types';
import { MESSAGES_PAGE_SIZE } from '@/lib/conversations-types';
import { createClient } from '@/lib/supabase/client';
import { useOnlineStatus } from '@/lib/use-online-status';
import { normalizeMessageContent, validateMessageContent } from '@/lib/validation';

import { getRealtimeCredentialsAction, sendMessageAction } from './actions';

type RealtimeMessagePayload = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
};

function toMessageRow(row: RealtimeMessagePayload): MessageRow {
  const messageType = row.message_type === 'image' || row.message_type === 'video' ? row.message_type : 'text';
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    messageType,
    createdAt: row.created_at,
  };
}

function byCreatedAt(a: DisplayMessage, b: DisplayMessage): number {
  return a.createdAt.localeCompare(b.createdAt);
}

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

type UseMessagesResult = {
  messages: DisplayMessage[];
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isSending: boolean;
  isOnline: boolean;
  send: (content: string) => void;
  retry: (tempId: string) => void;
  sendError: string | null;
  /** Vide uniquement l'état en mémoire de cette conversation — jamais les messages Supabase. Architecture Phase 9 (bouton corbeille), pas encore exposée dans l'UI. */
  clearLocalState: () => void;
};

/**
 * Historique paginé (chargé côté serveur pour la première page, voir
 * `page.tsx`) + réception temps réel + envoi optimiste, filtrés strictement
 * par `conversationId` (aucun abonnement global — voir section Realtime du
 * rapport). Le canal est nettoyé au démontage ou si `conversationId`
 * change.
 */
export function useMessages(conversationId: string, initialMessages: MessageRow[], currentUserId: string): UseMessagesResult {
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map((message) => ({ ...message, status: 'sent' as const })),
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length === MESSAGES_PAGE_SIZE);
  const [sendError, setSendError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const messagesRef = useRef<DisplayMessage[]>(messages);
  const isSendingRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const realtimeClientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const isRealtimeReadyRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Réhydratation à chaque changement de conversation : un nouveau
  // conversationId exige un nouveau channel filtré, jamais une réutilisation
  // d'un abonnement précédent (jamais d'abonnement global à tous les
  // messages, jamais de fuite d'une conversation vers une autre).
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const client = createClient();
    realtimeClientRef.current = client;
    isRealtimeReadyRef.current = false;

    getRealtimeCredentialsAction()
      .then((credentials) => {
        if (cancelled || !credentials) return;
        return client.auth.setSession({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
        });
      })
      .then(() => {
        if (cancelled) return;
        isRealtimeReadyRef.current = true;

        channel = client
          .channel(`messages:conversation:${conversationId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
            (payload) => {
              const row = toMessageRow(payload.new as RealtimeMessagePayload);
              setMessages((current) => {
                if (current.some((message) => message.status !== 'pending' && message.id === row.id)) {
                  return current;
                }
                const withoutPending = current.filter(
                  (message) => !(message.status === 'pending' && message.senderId === row.senderId && message.content === row.content),
                );
                return [...withoutPending, { ...row, status: 'sent' as const }].sort(byCreatedAt);
              });
            },
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
            (payload) => {
              // REPLICA IDENTITY FULL sur messages (voir migration Phase 5.4) : la ligne OLD contient id malgré la suppression.
              const deletedId = (payload.old as { id?: string } | null)?.id;
              if (!deletedId) return;
              setMessages((current) => current.filter((message) => message.id !== deletedId));
            },
          )
          .subscribe();
      })
      .catch(() => {
        // Échec d'hydratation Realtime (réseau, session expirée) : jamais
        // bloquant pour la lecture déjà chargée côté serveur — seule la
        // réception temps réel est indisponible tant que la reconnexion
        // n'aboutit pas.
      });

    return () => {
      cancelled = true;
      isRealtimeReadyRef.current = false;
      if (channel) client.removeChannel(channel);
    };
  }, [conversationId]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const oldestMessage = messagesRef.current[0];
    if (!oldestMessage) return;
    const client = realtimeClientRef.current;
    if (!client || !isRealtimeReadyRef.current) return;

    setIsLoadingMore(true);

    async function run(activeClient: NonNullable<typeof client>, before: string) {
      const { data, error } = await activeClient
        .from('messages')
        .select('id, conversation_id, sender_id, content, message_type, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE)
        .lt('created_at', before);

      if (error || !data) {
        setHasMore(false);
        return;
      }
      const older = (data as RealtimeMessagePayload[]).map(toMessageRow).reverse();
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        for (const message of older) {
          if (!byId.has(message.id)) byId.set(message.id, { ...message, status: 'sent' });
        }
        return Array.from(byId.values()).sort(byCreatedAt);
      });
      setHasMore(older.length === MESSAGES_PAGE_SIZE);
    }

    run(client, oldestMessage.createdAt)
      .catch(() => {
        // Échec réseau du SELECT lui-même (pas seulement `error` renvoyé par
        // Supabase) : le bouton redevient cliquable pour un nouvel essai
        // plutôt que de rester bloqué en silence.
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [conversationId, hasMore, isLoadingMore]);

  const submit = useCallback(
    (content: string, tempIdToReuse?: string) => {
      const normalized = normalizeMessageContent(content);
      const validation = validateMessageContent(normalized);
      if (!validation.ok) {
        setSendError(validation.error);
        return;
      }
      if (isSendingRef.current || !isOnline) return;

      isSendingRef.current = true;
      setIsSending(true);
      setSendError(null);

      const tempId = tempIdToReuse ?? nextTempId();
      const optimisticMessage: DisplayMessage = {
        id: tempId,
        conversationId,
        senderId: currentUserId,
        content: normalized,
        messageType: 'text',
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      setMessages((current) => {
        if (tempIdToReuse) {
          return current.map((message) => (message.id === tempId ? optimisticMessage : message));
        }
        return [...current, optimisticMessage].sort(byCreatedAt);
      });

      sendMessageAction(conversationId, normalized)
        .then((result) => {
          if ('error' in result) {
            setMessages((current) => current.map((message) => (message.id === tempId ? { ...message, status: 'failed' } : message)));
            setSendError(result.error);
            return;
          }
          setMessages((current) =>
            current.map((message) => (message.id === tempId ? { ...result.message, status: 'sent' as const } : message)).sort(byCreatedAt),
          );
        })
        .catch(() => {
          setMessages((current) => current.map((message) => (message.id === tempId ? { ...message, status: 'failed' } : message)));
          setSendError("Impossible d'envoyer le message pour le moment.");
        })
        .finally(() => {
          isSendingRef.current = false;
          setIsSending(false);
        });
    },
    [conversationId, isOnline, currentUserId],
  );

  const send = useCallback((content: string) => submit(content), [submit]);

  const retry = useCallback(
    (tempId: string) => {
      const failed = messagesRef.current.find((message) => message.id === tempId);
      if (!failed) return;
      submit(failed.content, tempId);
    },
    [submit],
  );

  /**
   * Architecture préparée pour le futur bouton corbeille (Phase 9, jamais
   * affiché dans cette sous-phase) : vide uniquement l'état en mémoire de
   * CETTE conversation (jamais les messages Supabase, jamais les autres
   * conversations). Il n'existe aujourd'hui ni brouillon local persistant
   * (le champ de saisie garde son état dans `MessageComposer`, jamais
   * sauvegardé ailleurs) ni fichier temporaire (aucun média en Phase 8.4) —
   * cette fonction ne couvre donc que ce qui existe réellement maintenant,
   * prête à être étendue sans changer sa signature le jour où ces deux
   * éléments existeront.
   */
  const clearLocalState = useCallback(() => {
    setMessages([]);
    setHasMore(false);
    setSendError(null);
  }, []);

  return { messages, isLoadingMore, hasMore, loadMore, isSending, isOnline, send, retry, sendError, clearLocalState };
}
