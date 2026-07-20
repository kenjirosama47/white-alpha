'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

import { MESSAGE_MAX_LENGTH } from '@/lib/validation';

import { AttachmentMenu } from './AttachmentMenu';
import { AttachmentPreview } from './AttachmentPreview';
import styles from './MessageComposer.module.css';
import { useAttachmentUpload } from './useAttachmentUpload';

type MessageComposerProps = {
  conversationId: string;
  disabled: boolean;
  onSend: (content: string) => void;
};

/**
 * Champ de saisie + trombone (Phase 8.5.3) + bouton d'envoi circulaire.
 * `disabled` couvre l'envoi de texte en cours (via `onSend`) et l'état hors
 * connexion — l'état d'envoi d'une pièce jointe est géré séparément par
 * `useAttachmentUpload` (jamais les deux flux d'envoi simultanément, un seul
 * bouton Envoyer arbitre lequel des deux s'applique selon qu'une pièce
 * jointe est sélectionnée ou non).
 */
export function MessageComposer({ conversationId, disabled, onSend }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Callback (jamais un `useEffect` dérivant `phase`) : appelé directement
  // par useAttachmentUpload au moment précis du succès, pour vider le champ
  // texte du composeur parent — le reste de l'état de la pièce jointe
  // (aperçu, URL locale) est remis à zéro séparément par ce hook, sur un
  // léger délai purement visuel ("Envoyé").
  const { attachment, phase, progressPercent, errorMessage, selectImage, selectVideo, cancel, send, retry } = useAttachmentUpload(
    conversationId,
    () => {
      setValue('');
      textareaRef.current?.focus();
    },
  );

  const isAttachmentBusy = phase === 'preparing' || phase === 'uploading' || phase === 'processing';

  function submit() {
    if (disabled || isAttachmentBusy) return;
    const trimmed = value.trim();

    if (attachment) {
      send(trimmed);
      return;
    }

    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const canSubmit = attachment ? !isAttachmentBusy : value.trim().length > 0;

  return (
    <div className={styles.composerWrapper}>
      {attachment && (
        <AttachmentPreview
          attachment={attachment}
          phase={phase}
          progressPercent={progressPercent}
          errorMessage={errorMessage}
          onCancel={cancel}
          onRetry={() => retry(value.trim())}
        />
      )}

      <div className={styles.composer}>
        <AttachmentMenu disabled={disabled || isAttachmentBusy} onSelectImage={selectImage} onSelectVideo={selectVideo} />

        <label htmlFor="message-input" className={styles.visuallyHidden}>
          Message
        </label>
        <textarea
          id="message-input"
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrire un message…"
          maxLength={MESSAGE_MAX_LENGTH}
          rows={1}
          disabled={disabled}
          className={styles.input}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !canSubmit}
          className={styles.sendButton}
          aria-label="Envoyer le message">
          <span aria-hidden="true">➤</span>
        </button>
      </div>
    </div>
  );
}
