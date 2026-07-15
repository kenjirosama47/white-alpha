import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { fetchMessageById, fetchMessages, MESSAGES_PAGE_SIZE, sendMessage as sendMessageService } from '@/services/messages';
import type { Message } from '@/types/chat';

type RealtimeMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type UseMessagesResult = {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  sendError: string | null;
  isSending: boolean;
  loadMore: () => void;
  /** Retourne `true` si l'envoi a réussi, `false` sinon (le contenu doit alors être conservé par l'appelant). */
  send: (content: string) => Promise<boolean>;
};

/**
 * Historique paginé + réception temps réel d'une conversation, filtrée
 * strictement par `conversationId` (aucun abonnement global). Le channel est
 * nettoyé automatiquement au démontage ou si `conversationId` change.
 */
export function useMessages(conversationId: string): UseMessagesResult {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Ref plutôt que le seul état `isSending` : setState est asynchrone/batché
  // et n'empêcherait pas un double-tap arrivant avant le premier re-render.
  const isSendingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);

  // Miroir de `messages` dans un ref : les refs ne doivent pas être écrites
  // pendant le rendu (React Compiler), donc synchronisation via effet.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    fetchMessages(conversationId)
      .then((initial) => {
        if (cancelled) return;
        setMessages(initial);
        setHasMore(initial.length === MESSAGES_PAGE_SIZE);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          if (messagesRef.current.some((message) => message.id === row.id)) {
            return;
          }
          // La charge utile Realtime ne contient jamais la pièce jointe
          // éventuelle (elle vit dans message_attachments, une autre table) :
          // on recharge le message complet plutôt que de mapper `row`
          // directement, pour que les messages photo s'affichent aussi bien
          // côté expéditeur que côté destinataire.
          fetchMessageById(row.id)
            .then((message) => {
              if (!message) return;
              setMessages((current) => {
                if (current.some((existing) => existing.id === message.id)) return current;
                return [...current, message];
              });
            })
            .catch(() => {
              // Message ignoré : il réapparaîtra au prochain chargement/pagination.
            });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || messagesRef.current.length === 0) return;
    setIsLoadingMore(true);
    fetchMessages(conversationId, messagesRef.current[0].createdAt)
      .then((older) => {
        setMessages((current) => [...older, ...current]);
        setHasMore(older.length === MESSAGES_PAGE_SIZE);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [conversationId, hasMore, isLoadingMore]);

  const send = useCallback(
    async (content: string) => {
      if (isSendingRef.current || !session?.user.id) return false;
      isSendingRef.current = true;
      setIsSending(true);
      setSendError(null);
      try {
        // sender_id vient exclusivement de auth.uid() côté serveur (RPC
        // create_text_message) : session.user.id ne sert ici qu'à vérifier
        // qu'un utilisateur est bien connecté avant d'appeler la RPC.
        await sendMessageService(conversationId, content);
        return true;
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Erreur inconnue.');
        return false;
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [conversationId, session],
  );

  return { messages, isLoading, isLoadingMore, hasMore, error, sendError, isSending, loadMore, send };
}
