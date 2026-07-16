import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { supabase } from '@/lib/supabase';
import { fetchMessageById, fetchMessages, MESSAGES_PAGE_SIZE, sendMessage as sendMessageService } from '@/services/messages';
import type { Message } from '@/types/chat';

/**
 * Fusionne les messages déjà affichés avec une page fraîchement récupérée
 * (ex. resynchronisation après reconnexion), sans jamais réinitialiser toute
 * la conversation : les messages déjà présents sont conservés, seuls ceux
 * manquants sont ajoutés. Dédoublonnage par id, tri chronologique stable.
 */
function mergeMessages(existing: Message[], fresh: Message[]): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of fresh) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

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
  /** Retire immédiatement un message de l'état local (suppression optimiste côté auteur, avant même la confirmation Realtime). */
  removeMessageLocally: (messageId: string) => void;
  /** Relance le chargement initial après une erreur (bouton « Réessayer »). Sans effet pendant le chargement. */
  retryInitialLoad: () => void;
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
  // Incrémenté par `retryInitialLoad` pour relancer l'effet de chargement
  // initial ci-dessous sans dupliquer sa logique.
  const [reloadToken, setReloadToken] = useState(0);
  const { justReconnected } = useNetworkStatus();

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
  }, [conversationId, reloadToken]);

  // Appelée depuis un gestionnaire d'événement (bouton « Réessayer »), jamais
  // depuis un effet : la remise à zéro synchrone de l'état y est sûre (même
  // principe que `refresh()` dans use-signed-attachment-url.ts).
  const retryInitialLoad = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  // Resynchronisation silencieuse après un retour de connexion : le canal
  // Realtime (ci-dessous) se reconnecte déjà seul (comportement natif de
  // supabase-js, aucune re-souscription manuelle nécessaire — un seul canal
  // par conversation, jamais recréé ici), mais les événements survenus
  // pendant la coupure ne sont jamais rejoués. On récupère donc la page la
  // plus récente et on la FUSIONNE (voir `mergeMessages`) : les messages déjà
  // affichés restent en place, seuls ceux manquants s'ajoutent — jamais de
  // réinitialisation ni de doublon (dédoublonnage par id).
  useEffect(() => {
    if (!justReconnected) return;
    fetchMessages(conversationId)
      .then((fresh) => {
        setMessages((current) => mergeMessages(current, fresh));
      })
      .catch(() => {
        // Échec silencieux : une resynchronisation en arrière-plan ne doit
        // jamais remplacer l'état déjà affiché ni interrompre l'utilisateur.
      });
  }, [justReconnected, conversationId]);

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
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // REPLICA IDENTITY FULL sur messages (Phase 5.4) : la ligne OLD
          // contient toutes les colonnes, dont id, malgré une suppression.
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) return;
          setMessages((current) => current.filter((message) => message.id !== deletedId));
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

  const removeMessageLocally = useCallback((messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, []);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    sendError,
    isSending,
    loadMore,
    send,
    removeMessageLocally,
    retryInitialLoad,
  };
}
