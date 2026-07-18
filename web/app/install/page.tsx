import type { Metadata } from 'next';

import { Button } from '@/components/Button';
import { InstallIOSGuide } from '@/components/InstallIOSGuide';
import { PageShell } from '@/components/PageShell';
import { ANDROID_APK_DOWNLOAD_URL, ANDROID_APK_META } from '@/lib/downloads';
import { INSTALL_ANDROID_COPY, INSTALL_ANDROID_WEB_COPY, INSTALL_IOS_COPY } from '@/lib/copy';

export const metadata: Metadata = {
  title: 'Installer White Alpha',
};

export default function InstallPage() {
  return (
    <PageShell>
      <h1>Installer White Alpha</h1>

      <section id="android">
        <h2>Android</h2>
        {ANDROID_APK_DOWNLOAD_URL ? (
          <>
            <Button href={ANDROID_APK_DOWNLOAD_URL} variant="primary">
              {INSTALL_ANDROID_COPY.buttonLabel}
            </Button>
            <dl>
              {ANDROID_APK_META.version && (
                <>
                  <dt>Version</dt>
                  <dd>{ANDROID_APK_META.version}</dd>
                </>
              )}
              {ANDROID_APK_META.sizeBytes && (
                <>
                  <dt>Taille</dt>
                  <dd>{(ANDROID_APK_META.sizeBytes / (1024 * 1024)).toFixed(1)} Mo</dd>
                </>
              )}
              {ANDROID_APK_META.sha256 && (
                <>
                  <dt>SHA-256</dt>
                  <dd style={{ wordBreak: 'break-all' }}>{ANDROID_APK_META.sha256}</dd>
                </>
              )}
            </dl>
            <p>
              Android affichera un avertissement pour une application installée hors du Play Store : c’est normal et
              attendu pour une distribution privée. Autorise l’installation depuis cette source pour White Alpha
              uniquement.
            </p>
          </>
        ) : (
          <p>Téléchargement Android bientôt disponible.</p>
        )}
        <p>
          Sur Android, White Alpha peut aussi être installée comme application Web depuis ce navigateur —{' '}
          {INSTALL_ANDROID_WEB_COPY.buttonLabel.toLowerCase()} via le menu du navigateur (« Installer l’application »
          ou « Ajouter à l’écran d’accueil »).
        </p>
      </section>

      <section id="iphone">
        <h2>iPhone / iPad</h2>
        <p>{INSTALL_IOS_COPY.buttonLabel}</p>
        <InstallIOSGuide />
      </section>
    </PageShell>
  );
}
