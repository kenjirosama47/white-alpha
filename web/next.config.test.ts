import nextConfig from './next.config';

/**
 * Garde-fous statiques pour le correctif Phase 8.5.5 (`proxyClientMaxBodySize`)
 * — voir le rapport de sous-phase pour la cause exacte (Next.js tronque à
 * 10 Mo par défaut le corps de toute requête passant par proxy.ts avant
 * qu'elle n'atteigne la route, corrompant un envoi vidéo légitime).
 */
describe('next.config.ts (Phase 8.5.5, correctif proxyClientMaxBodySize)', () => {
  it("proxyClientMaxBodySize vaut '60mb' — laisse passer MAX_VIDEO_SIZE_BYTES (50 Mo) plus la surcharge multipart", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe('60mb');
  });

  it('aucune autre configuration Next.js existante n’a été supprimée', () => {
    expect(nextConfig.reactStrictMode).toBe(true);
    expect(nextConfig.typescript?.ignoreBuildErrors).toBe(false);
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('headers() pose toujours les en-têtes de sécurité statiques existants (Phase 8.2, inchangés)', async () => {
    const result = await nextConfig.headers!();

    expect(result[0]?.source).toBe('/:path*');
    const keys = result[0]?.headers.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining(['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']),
    );
  });
});
