import Link from 'next/link';
import type { Metadata } from 'next';

import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { SITE_COPY } from '@/lib/copy';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: SITE_COPY.title,
};

/** Page d'accueil privée (Phase 8.2/8.3) : présentation, connexion, installation Android/iPhone. */
export default function HomePage() {
  return (
    <PageShell>
      <div className={styles.card}>
        <section className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statique local, next/image inutile ici */}
          <img src="/icons/icon-512.png" alt="Logo White Alpha" className={styles.logo} width={120} height={120} />
          <h1 className={styles.title}>{SITE_COPY.title}</h1>
          <p className={styles.subtitle}>{SITE_COPY.subtitle}</p>
        </section>

        <div className={styles.actions}>
          <Button href="/login" variant="primary">
            Se connecter
          </Button>
          <Button href="/install#android" variant="secondary">
            Télécharger White Alpha pour Android
          </Button>
          <Button href="/install#iphone" variant="secondary">
            Installer White Alpha sur iPhone
          </Button>
        </div>

        <nav className={styles.secondaryLinks}>
          <Link href="/inscription">Créer un compte</Link>
          <Link href="/install">Guide d’installation</Link>
          <Link href="/forgot-password">Mot de passe oublié</Link>
        </nav>
      </div>
    </PageShell>
  );
}
