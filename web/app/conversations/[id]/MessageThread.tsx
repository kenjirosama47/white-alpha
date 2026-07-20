'use client';

import { useEffect, useRef } from 'react';

import { OfflineBanner } from '@/components/OfflineBanner';
import type { ConversationHeader, MessageRow } from '@/lib/conversations-types';

import { MessageComposer } from './MessageComposer';
import { MessageImage } from './MessageImage';
import styles from './MessageThread.module.css';
import { MessageVideo } from './MessageVideo';
import { useMessages } from './useMessages';

type MessageThreadProps = {
  conversationId: string;
  header: ConversationHeader;
  initialMessages: MessageRow[];
  currentUserId: string;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Aujourd'hui";
  if (isSameDay(date, yesterday)) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Corps de l'écran de discussion (Phase 8.4) : historique + composeur.
 * L'en-tête (avatar, nom, bouton retour) est rendu par `page.tsx`
 * (Server Component, aucune interactivité nécessaire) — jamais dupliqué ici.
 */
export function MessageThread({ conversationId, header, initialMessages, currentUserId }: MessageThreadProps) {
  const { messages, isLoadingMore, hasMore, loadMore, isSending, isOnline, send, retry, sendError } = useMessages(
    conversationId,
    initialMessages,
    currentUserId,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(messages.length);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitially = useRef(false);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (!hasScrolledInitially.current) {
      container.scrollTop = container.scrollHeight;
      hasScrolledInitially.current = true;
      previousCountRef.current = messages.length;
      return;
    }

    // Défilement automatique uniquement pour un message ajouté À LA FIN
    // (envoi propre ou réception) — jamais pour un chargement d'historique
    // en haut, qui ne doit jamais provoquer de saut brutal.
    const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
    if (last && messages.length > previousCountRef.current) {
      const isOwn = last.senderId === currentUserId;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (isOwn || distanceFromBottom < 200) {
        container.scrollTop = container.scrollHeight;
      }
      if (!isOwn && liveRegionRef.current) {
        liveRegionRef.current.textContent = `Nouveau message de ${header.displayName}.`;
      }
    }
    previousCountRef.current = messages.length;
  }, [messages, currentUserId, header.displayName]);

  // Calculé en une seule passe fonctionnelle (jamais une variable externe
  // réassignée pendant le rendu, react-hooks/immutability) : chaque entrée
  // sait déjà si un séparateur de date doit précéder son message.
  const entriesWithSeparators = messages.reduce<{ message: (typeof messages)[number]; showSeparator: boolean }[]>(
    (accumulator, message) => {
      const dateKey = new Date(message.createdAt).toDateString();
      const previousDateKey = accumulator.length > 0 ? new Date(accumulator[accumulator.length - 1]!.message.createdAt).toDateString() : null;
      accumulator.push({ message, showSeparator: dateKey !== previousDateKey });
      return accumulator;
    },
    [],
  );

  return (
    <div className={styles.thread}>
      <OfflineBanner />

      <div ref={liveRegionRef} aria-live="polite" className={styles.visuallyHidden} />

      <div ref={scrollRef} className={styles.messageList} role="log" aria-label={`Messages avec ${header.displayName}`}>
        {hasMore && (
          <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Chargement…' : 'Charger les messages précédents'}
          </button>
        )}

        {messages.length === 0 && (
          <p className={styles.emptyState}>Aucun message pour l’instant. Dites bonjour !</p>
        )}

        {entriesWithSeparators.map(({ message, showSeparator }) => {
          const isOwn = message.senderId === currentUserId;

          return (
            <div key={message.id}>
              {showSeparator && (
                <div className={styles.dateSeparator} role="separator">
                  {formatDateSeparator(message.createdAt)}
                </div>
              )}
              <div className={isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther}>
                <div className={isOwn ? styles.bubbleOwn : styles.bubbleOther}>
                  {message.attachment &&
                    (message.attachment.mediaType === 'image' ? (
                      <MessageImage
                        attachmentId={message.attachment.id}
                        width={message.attachment.width}
                        height={message.attachment.height}
                      />
                    ) : (
                      <MessageVideo
                        attachmentId={message.attachment.id}
                        width={message.attachment.width}
                        height={message.attachment.height}
                      />
                    ))}
                  {message.content.length > 0 && <p className={styles.bubbleText}>{message.content}</p>}
                  <div className={styles.bubbleMeta}>
                    <span className={styles.bubbleTime}>{formatTime(message.createdAt)}</span>
                    {message.status === 'pending' && <span className={styles.bubbleStatus}>Envoi…</span>}
                    {message.status === 'failed' && (
                      <button type="button" className={styles.retryButton} onClick={() => retry(message.id)}>
                        Réessayer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sendError && (
        <p role="alert" className={styles.sendError}>
          {sendError}
        </p>
      )}

      <MessageComposer conversationId={conversationId} disabled={isSending || !isOnline} onSend={send} />
    </div>
  );
}
