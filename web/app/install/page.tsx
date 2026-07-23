import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';
import { ANDROID_APK_DOWNLOAD_URL, ANDROID_APK_META } from '@/lib/downloads';

import { InstallPageClient } from './InstallPageClient';

export const metadata: Metadata = {
  title: 'Installer White Alpha',
  robots: { index: false, follow: false },
};

/**
 * Page publique (Phase 8.7) : ne révèle aucune donnée privée (aucun
 * message, profil, ni information de compte) — seulement des instructions
 * d'installation génériques, jamais protégée par `proxy.ts` (voir sa liste
 * `PROTECTED_PREFIXES`, qui ne contient pas `/install`). Les vraies zones
 * privées (`/membre`, `/profil`, `/conversations`) restent protégées côté
 * serveur, indépendamment de cette page.
 */
export default function InstallPage() {
  return (
    <PageShell>
      <h1>Installer White Alpha</h1>
      <p>Choisis ton appareil pour installer White Alpha comme une application.</p>
      <InstallPageClient androidApkUrl={ANDROID_APK_DOWNLOAD_URL} androidApkMeta={ANDROID_APK_META} />
    </PageShell>
  );
}
