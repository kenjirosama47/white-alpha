'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EMPTY_CONVERSATIONS_COPY } from '@/lib/copy';
import type { ConversationSummary } from '@/lib/conversations-types';
import { useOnlineStatus } from '@/lib/use-online-status';

import { listConversationsAction } from './actions';
import styles from './ConversationList.module.css';

function formatPreviewTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Liste des conversations (Phase 8.4) : chargement/erreur/vide côté client
 * (jamais uniquement au premier rendu serveur) pour permettre un vrai bouton
 * « Réessayer » et une resynchronisation silencieuse au retour de connexion
 * — même politique que `useConversations` (mobile). Pas de Realtime ici :
 * la RPC `list_my_conversations` n'est pas paginée, un rechargement complet
 * est sûr et suffisant (même choix que mobile).
 */
export function ConversationList() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    listConversationsAction()
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setConversations(result.conversations);
      })
      .catch(() => {
        // Le fetch de l'action serveur elle-même a échoué (réseau), pas
        // seulement son résultat applicatif — sans ce filet, l'écran reste
        // vide sans aucun retour ni bouton Réessayer (constaté en test manuel).
        setError('Impossible de charger les conversations pour le moment.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    // queueMicrotask : jamais de setState synchrone dans le corps d'un effet
    // (react-hooks/set-state-in-effect) — `load()` appelle `setIsLoading`
    // dès sa première ligne, même politique que `use-conversations.ts`
    // (mobile).
    queueMicrotask(() => load());
  }, [load]);

  // Détection de la transition hors-ligne → en-ligne via une ref (jamais un
  // état déclenchant un re-rendu supplémentaire juste pour ce suivi) :
  // resynchronisation silencieuse au retour de connexion, jamais au
  // montage initial (déjà couvert par l'effet ci-dessus).
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (isOnline && !wasOnline) {
      queueMicrotask(() => load());
    }
  }, [isOnline, load]);

  if (isLoading && conversations === null) {
    return (
      <p role="status" className={styles.stateMessage}>
        Chargement des conversations…
      </p>
    );
  }

  if (error && conversations === null) {
    return (
      <div className={styles.stateMessage}>
        <p role="alert">{error}</p>
        <Button type="button" variant="secondary" onClick={load}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (conversations && conversations.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>{EMPTY_CONVERSATIONS_COPY.title}</p>
        <p className={styles.emptyDescription}>{EMPTY_CONVERSATIONS_COPY.description}</p>
        <Button href="/conversations/nouvelle" variant="primary">
          {EMPTY_CONVERSATIONS_COPY.actionLabel}
        </Button>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {(conversations ?? []).map((conversation) => (
        <li key={conversation.conversationId}>
          <Link href={`/conversations/${conversation.conversationId}`} className={styles.item}>
            <Avatar
              avatarUrl={conversation.otherParticipant.avatarUrl}
              avatarPreset={conversation.otherParticipant.avatarPreset}
              displayName={conversation.otherParticipant.displayName}
              size={48}
            />
            <div className={styles.itemBody}>
              <div className={styles.itemHeaderRow}>
                <span className={styles.itemName}>{conversation.otherParticipant.displayName}</span>
                <span className={styles.itemTime}>{formatPreviewTime(conversation.lastMessageCreatedAt)}</span>
              </div>
              <p className={styles.itemPreview}>{conversation.lastMessageContent ?? 'Aucun message pour l’instant.'}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
