'use client';

import { useEffect, useRef } from 'react';

import formStyles from '@/styles/form.module.css';

/**
 * Message d'erreur de formulaire partagé (Phase 8.3) : reçoit le focus dès
 * qu'il apparaît, pour qu'un lecteur d'écran ou une navigation clavier ne
 * manque jamais une erreur de soumission — jamais laissé silencieux en haut
 * de page hors du flux de focus.
 */
export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;

  return (
    <p ref={ref} role="alert" tabIndex={-1} className={formStyles.error}>
      {message}
    </p>
  );
}
