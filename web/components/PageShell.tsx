import type { ReactNode } from 'react';

import styles from './PageShell.module.css';

/** Conteneur de page centré, largeur maximale 800px — équivalent web de `MaxContentWidth` (mobile, `constants/theme.ts`). */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
