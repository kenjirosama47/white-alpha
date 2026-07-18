import type { NextConfig } from 'next';

/**
 * Configuration Next.js — White Alpha Web (Phase 8.2, fondation).
 *
 * La CSP (avec nonce par requête) est posée dans `middleware.ts`, pas ici :
 * elle nécessite une valeur aléatoire différente à chaque requête, ce que
 * `headers()` ci-dessous (statique, calculé une fois au build) ne permet pas.
 * Les en-têtes ci-dessous sont ceux qui n'ont pas besoin d'être dynamiques.
 */
const securityHeaders = [
  // Historique (X-Frame-Options) conservé en complément de frame-ancestors
  // (CSP, middleware.ts) pour les navigateurs qui ignoreraient encore la CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Aucune fonctionnalité navigateur sensible n'est utilisée dans cette
    // fondation (pas de caméra/micro/géolocalisation) : tout est désactivé
    // explicitement plutôt que laissé au défaut du navigateur.
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Robustesse : une erreur TypeScript ne doit jamais être masquée par un
  // build qui continue silencieusement. (Next 16 ne propose plus de bloc
  // `eslint` dédié dans next.config — `npm run lint` reste une étape
  // séparée et obligatoire de la validation, voir package.json.)
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
