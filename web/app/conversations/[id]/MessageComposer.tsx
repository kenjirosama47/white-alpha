'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

import { MESSAGE_MAX_LENGTH } from '@/lib/validation';
import styles from './MessageComposer.module.css';

type MessageComposerProps = {
  disabled: boolean;
  onSend: (content: string) => void;
};

/**
 * Champ de saisie + bouton d'envoi circulaire (Phase 8.4). Aucun bouton
 * photo/vidéo dans cette sous-phase (voir Phase 8.5). `disabled` couvre à la
 * fois l'envoi en cours (double envoi bloqué) et l'état hors connexion.
 */
export function MessageComposer({ disabled, onSend }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
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

  return (
    <div className={styles.composer}>
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
        disabled={disabled || !value.trim()}
        className={styles.sendButton}
        aria-label="Envoyer le message">
        <span aria-hidden="true">➤</span>
      </button>
    </div>
  );
}
