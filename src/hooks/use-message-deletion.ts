import { useCallback, useEffect, useRef, useState } from 'react';

import { removeAttachmentFileOrThrow } from '@/services/media';
import { deleteOwnMessage } from '@/services/messages';
import type { Message } from '@/types/chat';

export type MessageDeletionState = {
  status: 'deleting' | 'error';
  error: string | null;
};

type UseMessageDeletionResult = {
  /** `null` : aucune suppression en cours ni en échec pour ce message. */
  getDeletionState: (messageId: string) => MessageDeletionState | null;
  deleteMessage: (message: Message) => void;
  /** Relance l'étape qui a échoué. Ne retente jamais la suppression Storage si elle a déjà réussi. */
  retryDeletion: (message: Message) => void;
};

// Nouvelles tentatives automatiques de l'étape base après un fichier Storage
// déjà supprimé (voir runDeletion) : le message ne doit jamais rester
// affiché avec un média absent, donc on insiste avant de demander à
// l'utilisateur d'intervenir manuellement.
const AUTO_RETRY_DELAYS_MS = [2000, 4000, 8000];

/**
 * Orchestration de la suppression d'un message par son auteur : pour un
 * message texte, appelle uniquement la RPC `delete_own_message` ; pour une
 * photo/vidéo, supprime d'abord le fichier Storage, puis seulement la ligne
 * en base (jamais l'inverse — un message ne doit jamais pointer vers un
 * fichier absent). Si l'étape Storage échoue, la base n'est jamais touchée.
 * Si le fichier Storage a été supprimé mais que la suppression en base
 * échoue, de nouvelles tentatives automatiques sont faites sur cette seule
 * étape (le fichier n'est plus retenté), avant de proposer une reprise
 * manuelle. État suivi par message (plusieurs suppressions peuvent être en
 * échec simultanément).
 */
export function useMessageDeletion(onDeleted: (messageId: string) => void): UseMessageDeletionResult {
  const [states, setStates] = useState<Record<string, MessageDeletionState>>({});

  const storageRemovedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());
  const retryTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoRetryAttemptsRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Référence à l'objet lui-même (jamais réassigné, seulement muté via ses
    // propriétés ailleurs dans ce fichier) : au démontage, `timeouts` reflète
    // donc bien les délais programmés à ce moment-là, pas un instantané figé.
    const timeouts = retryTimeoutsRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const setState = useCallback((messageId: string, state: MessageDeletionState | null) => {
    setStates((current) => {
      if (state === null) {
        if (!(messageId in current)) return current;
        const next = { ...current };
        delete next[messageId];
        return next;
      }
      return { ...current, [messageId]: state };
    });
  }, []);

  // Indirection nécessaire pour l'auto-retry ci-dessous : `finishDeleteDbStep`
  // s'appelle elle-même via `setTimeout`, ce qui interdit une référence
  // directe à la const avant sa propre déclaration. Toujours à jour grâce à
  // l'effet juste après sa définition.
  const finishDeleteDbStepRef = useRef<(messageId: string) => Promise<void>>(async () => {});

  const finishDeleteDbStep = useCallback(
    async (messageId: string) => {
      try {
        // Idempotente côté serveur : que ce soit cette tentative ou une
        // précédente qui ait réellement supprimé la ligne, le résultat pour
        // l'utilisateur est le même — jamais de doublon ni d'erreur pour un
        // message déjà supprimé.
        await deleteOwnMessage(messageId);
        if (!mountedRef.current) return;
        storageRemovedRef.current.delete(messageId);
        autoRetryAttemptsRef.current[messageId] = 0;
        inFlightRef.current.delete(messageId);
        setState(messageId, null);
        onDeleted(messageId);
      } catch (err) {
        if (!mountedRef.current) return;
        const attempt = autoRetryAttemptsRef.current[messageId] ?? 0;
        if (attempt < AUTO_RETRY_DELAYS_MS.length) {
          autoRetryAttemptsRef.current[messageId] = attempt + 1;
          setState(messageId, { status: 'deleting', error: null });
          retryTimeoutsRef.current[messageId] = setTimeout(() => {
            void finishDeleteDbStepRef.current(messageId);
          }, AUTO_RETRY_DELAYS_MS[attempt]);
          return;
        }
        // Tentatives automatiques épuisées : le fichier Storage est déjà
        // supprimé (ou le message n'en a jamais eu), seule la suppression en
        // base reste à finaliser. `retryDeletion` relance uniquement cette
        // étape, jamais une nouvelle suppression Storage.
        inFlightRef.current.delete(messageId);
        setState(messageId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Impossible de supprimer le message pour le moment.',
        });
      }
    },
    [onDeleted, setState],
  );

  useEffect(() => {
    finishDeleteDbStepRef.current = finishDeleteDbStep;
  }, [finishDeleteDbStep]);

  const runDeletion = useCallback(
    async (message: Message) => {
      const messageId = message.id;
      if (inFlightRef.current.has(messageId)) return;
      inFlightRef.current.add(messageId);
      setState(messageId, { status: 'deleting', error: null });

      if (message.attachment && !storageRemovedRef.current.has(messageId)) {
        try {
          await removeAttachmentFileOrThrow(message.attachment.storagePath);
          storageRemovedRef.current.add(messageId);
        } catch (err) {
          if (!mountedRef.current) return;
          inFlightRef.current.delete(messageId);
          setState(messageId, {
            status: 'error',
            error: err instanceof Error ? err.message : "Impossible de supprimer le fichier pour le moment.",
          });
          return;
        }
      }

      autoRetryAttemptsRef.current[messageId] = 0;
      await finishDeleteDbStep(messageId);
    },
    [finishDeleteDbStep, setState],
  );

  const deleteMessage = useCallback(
    (message: Message) => {
      void runDeletion(message);
    },
    [runDeletion],
  );

  const retryDeletion = useCallback(
    (message: Message) => {
      const timeout = retryTimeoutsRef.current[message.id];
      if (timeout) {
        clearTimeout(timeout);
        delete retryTimeoutsRef.current[message.id];
      }
      void runDeletion(message);
    },
    [runDeletion],
  );

  const getDeletionState = useCallback((messageId: string) => states[messageId] ?? null, [states]);

  return { getDeletionState, deleteMessage, retryDeletion };
}
