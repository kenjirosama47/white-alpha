'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import styles from './AttachmentMenu.module.css';

type AttachmentMenuProps = {
  disabled: boolean;
  onSelectImage: (file: File) => void;
  onSelectVideo: (file: File) => void;
};

/**
 * Bouton trombone + menu accessible (Photo/Vidéo) — Phase 8.5.3. Remplace
 * les anciens boutons séparés photo/vidéo (jamais présents côté Web avant
 * cette phase). Patron ARIA "menu button" : navigation clavier (flèches),
 * fermeture au clic extérieur et à `Échap` (avec retour du focus sur le
 * déclencheur), `aria-haspopup`/`aria-expanded` sur le bouton.
 *
 * `accept` sur les champs fichier est un filtre UX uniquement (le système
 * d'exploitation peut toujours l'ignorer) : la validation qui fait autorité
 * reste `media-client-validation.ts` (immédiate) puis la route serveur
 * Phase 8.5.2 (seule autorité réelle).
 */
export function AttachmentMenu({ disabled, onSelectImage, onSelectVideo }: AttachmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoItemRef = useRef<HTMLButtonElement>(null);
  const videoItemRef = useRef<HTMLButtonElement>(null);

  function close(returnFocusToTrigger: boolean) {
    setIsOpen(false);
    if (returnFocusToTrigger) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Focus initial sur le premier item à l'ouverture, pour une navigation
    // clavier immédiate (flèches) sans étape intermédiaire.
    photoItemRef.current?.focus();

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      (document.activeElement === photoItemRef.current ? videoItemRef : photoItemRef).current?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      (document.activeElement === videoItemRef.current ? photoItemRef : videoItemRef).current?.focus();
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Ajouter une pièce jointe"
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}>
        <span aria-hidden="true">📎</span>
      </button>

      {isOpen && (
        <div ref={menuRef} role="menu" aria-label="Type de pièce jointe" className={styles.menu} onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            role="menuitem"
            ref={photoItemRef}
            className={styles.menuItem}
            onClick={() => {
              close(true);
              photoInputRef.current?.click();
            }}>
            Photo
          </button>
          <button
            type="button"
            role="menuitem"
            ref={videoItemRef}
            className={styles.menuItem}
            onClick={() => {
              close(true);
              videoInputRef.current?.click();
            }}>
            Vidéo
          </button>
        </div>
      )}

      <label htmlFor="attachment-photo-input" className={styles.visuallyHidden}>
        Choisir une photo
      </label>
      <input
        id="attachment-photo-input"
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.visuallyHidden}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Vide toujours la valeur après lecture : sans ça, sélectionner
          // deux fois le même fichier d'affilée ne redéclencherait jamais
          // `onChange` (comportement natif du navigateur pour un input file
          // dont la valeur ne change pas).
          event.target.value = '';
          if (file) onSelectImage(file);
        }}
      />

      <label htmlFor="attachment-video-input" className={styles.visuallyHidden}>
        Choisir une vidéo
      </label>
      <input
        id="attachment-video-input"
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className={styles.visuallyHidden}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onSelectVideo(file);
        }}
      />
    </div>
  );
}
