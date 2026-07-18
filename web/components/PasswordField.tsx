'use client';

import { useId, useState } from 'react';

import formStyles from '@/styles/form.module.css';

type PasswordFieldProps = {
  label: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
};

/**
 * Champ mot de passe partagé pour tous les formulaires White Alpha Web
 * (Phase 8.3) — calqué sur `PasswordField` mobile (`src/components/password-field.tsx`) :
 * masqué par défaut, bouton afficher/masquer accessible, jamais
 * d'autocorrection/autocapitalisation.
 */
export function PasswordField({ label, name, autoComplete, required = true, disabled, minLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className={formStyles.field}>
      <label htmlFor={id} className={formStyles.label}>
        {label}
      </label>
      <div className={formStyles.passwordRow}>
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          required={required}
          disabled={disabled}
          minLength={minLength}
          className={formStyles.input}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className={formStyles.toggleVisibility}
          aria-pressed={visible}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
          {visible ? 'Masquer' : 'Afficher'}
        </button>
      </div>
    </div>
  );
}
