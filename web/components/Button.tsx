import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';

type CommonProps = {
  variant?: Variant;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
  disabled?: boolean;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

/** Bouton unique White Alpha Web, calqué sur `Button` mobile (Phase 7.1) : mêmes variantes, même sémantique. */
export function Button(props: ButtonProps) {
  const { variant = 'primary', children } = props;
  const className = `${styles.button} ${styles[variant]}`;

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={className} aria-disabled={props.disabled}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as ButtonAsButton;
  return (
    <button {...buttonProps} className={className}>
      {children}
    </button>
  );
}
