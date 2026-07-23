'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { InstallAndroidGuide } from '@/components/InstallAndroidGuide';
import { InstallIOSGuide } from '@/components/InstallIOSGuide';
import { INSTALL_ANDROID_COPY } from '@/lib/copy';
import { detectPlatform, isChromeOnIOS, isInAppBrowser, type DetectedPlatform } from '@/lib/device-detection';

import styles from './page.module.css';

type AndroidApkMeta = {
  version: string | null;
  sizeBytes: number | null;
  sha256: string | null;
};

type InstallPageClientProps = {
  androidApkUrl: string | null;
  androidApkMeta: AndroidApkMeta;
};

/**
 * Détection appareil/navigateur (Phase 8.7) — uniquement pour mettre en
 * avant la bonne carte et avertir d'un contexte défavorable (navigateur
 * intégré, Chrome sur iOS) : n'affecte jamais la protection réelle des
 * routes (`proxy.ts`, côté serveur), purement une aide à la navigation.
 */
export function InstallPageClient({ androidApkUrl, androidApkMeta }: InstallPageClientProps) {
  const [platform, setPlatform] = useState<DetectedPlatform | null>(null);
  const [browserWarning, setBrowserWarning] = useState<string | null>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const detectedPlatform = detectPlatform(userAgent, navigator.maxTouchPoints);

    let warning: string | null = null;
    if (isInAppBrowser(userAgent)) {
      warning =
        'Tu ouvres ce lien depuis une application (réseau social, messagerie) : ouvre-le dans ton navigateur habituel pour pouvoir installer White Alpha.';
    } else if (detectedPlatform === 'ios' && isChromeOnIOS(userAgent)) {
      warning = "Sur iPhone/iPad, seul Safari permet d'ajouter White Alpha à l'écran d'accueil — ouvre ce lien dans Safari.";
    }

    // Toujours dans un microtask, jamais de setState synchrone au corps de
    // l'effet (même règle que InstallIOSGuide/InstallAndroidGuide). Le statut
    // "déjà installée" est délégué à chaque guide (InstallAndroidGuide /
    // InstallIOSGuide, qui vérifient déjà tous les deux le mode standalone) :
    // jamais dupliqué ici, pour éviter d'afficher le même message 3 fois.
    queueMicrotask(() => {
      setPlatform(detectedPlatform);
      setBrowserWarning(warning);
    });
  }, []);

  return (
    <>
      {browserWarning && (
        <p role="alert" className={styles.warning}>
          {browserWarning}
        </p>
      )}

      <div className={styles.cards}>
        <section
          className={platform === 'android' ? `${styles.card} ${styles.recommended}` : styles.card}
          aria-labelledby="install-android-heading"
        >
          {platform === 'android' && <p className={styles.badge}>Recommandé pour ton appareil</p>}
          <h2 id="install-android-heading">Installer sur Android</h2>
          <InstallAndroidGuide />

          {androidApkUrl && (
            <>
              <p>Ou télécharge directement l’APK officiel signé :</p>
              <Button href={androidApkUrl} variant="secondary">
                {INSTALL_ANDROID_COPY.buttonLabel}
              </Button>
              <dl className={styles.meta}>
                {androidApkMeta.version && (
                  <>
                    <dt>Version</dt>
                    <dd>{androidApkMeta.version}</dd>
                  </>
                )}
                {androidApkMeta.sizeBytes && (
                  <>
                    <dt>Taille</dt>
                    <dd>{(androidApkMeta.sizeBytes / (1024 * 1024)).toFixed(1)} Mo</dd>
                  </>
                )}
                {androidApkMeta.sha256 && (
                  <>
                    <dt>SHA-256</dt>
                    <dd style={{ wordBreak: 'break-all' }}>{androidApkMeta.sha256}</dd>
                  </>
                )}
              </dl>
            </>
          )}
        </section>

        <section
          className={platform === 'ios' ? `${styles.card} ${styles.recommended}` : styles.card}
          aria-labelledby="install-ios-heading"
        >
          {platform === 'ios' && <p className={styles.badge}>Recommandé pour ton appareil</p>}
          <h2 id="install-ios-heading">Installer sur iPhone / iPad</h2>
          <InstallIOSGuide />
        </section>
      </div>

      <Link href="/login" className={styles.continueLink}>
        Continuer dans le navigateur
      </Link>
    </>
  );
}
