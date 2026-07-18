import type { MetadataRoute } from 'next';

/**
 * Génère /manifest.webmanifest (convention App Router Next.js). Icônes
 * générées depuis le logo officiel via `npm run icons:generate` (voir
 * scripts/generate-icons.mjs) — jamais un placeholder générique.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'White Alpha',
    short_name: 'White Alpha',
    description: 'White Alpha — messagerie privée réservée aux membres autorisés.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0D0F0C',
    theme_color: '#0D0F0C',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
