import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import '@/styles/globals.css';

/**
 * `robots: { index: false, follow: false }` — noindex/nofollow au niveau
 * HTML (en plus de `app/robots.ts`, qui couvre le crawl via robots.txt) :
 * White Alpha Web n'est jamais destinée au référencement public (Phase 8.2).
 * `apple-mobile-web-app-*` : compatibilité Safari iOS pour l'installation
 * "Ajouter à l'écran d'accueil" (le `manifest.webmanifest` seul ne suffit
 * pas sur Safari, contrairement à Chrome/Android).
 */
export const metadata: Metadata = {
  title: 'White Alpha — La meute privée',
  description: 'Une messagerie privée réservée aux membres autorisés.',
  robots: { index: false, follow: false, nocache: true },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'White Alpha',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D0F0C',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
