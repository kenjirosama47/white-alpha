'use client';

import { useOnlineStatus } from '@/lib/use-online-status';
import { OFFLINE_COPY } from '@/lib/copy';
import styles from './OfflineBanner.module.css';

/** Bannière hors connexion (Phase 8.4) — lecture seule de l'état déjà en mémoire, jamais de nouvelle donnée chargée ni mise en cache pendant la coupure. */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className={styles.banner} role="status">
      {OFFLINE_COPY.offlineTitle}
    </div>
  );
}
