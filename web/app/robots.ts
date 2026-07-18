import type { MetadataRoute } from 'next';

/**
 * White Alpha Web est une application privée : jamais de référencement
 * public (voir aussi `robots` dans les métadonnées de chaque page,
 * `app/layout.tsx`, qui pose noindex/nofollow au niveau HTML — les deux
 * mécanismes sont complémentaires, aucun des deux ne suffit seul).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
