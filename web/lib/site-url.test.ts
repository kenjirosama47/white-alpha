import { getAuthCallbackUrl } from './site-url';

describe('lib/site-url (Phase 8.4 — anomalie whitealpha:// corrigée)', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it('avec NEXT_PUBLIC_SITE_URL défini (dev local) : renvoie une URL Web absolue http://localhost:3000/auth/callback', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    expect(getAuthCallbackUrl()).toBe('http://localhost:3000/auth/callback');
  });

  it('avec NEXT_PUBLIC_SITE_URL défini sur un domaine de production : renvoie l’URL Web absolue correspondante', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://white-alpha.example';

    expect(getAuthCallbackUrl()).toBe('https://white-alpha.example/auth/callback');
  });

  it('ne renvoie jamais le schéma mobile whitealpha:// (jamais de constante mobile réutilisée côté Web)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    expect(getAuthCallbackUrl()).not.toContain('whitealpha://');
  });

  it('sans NEXT_PUBLIC_SITE_URL (variable absente) : ne renvoie jamais le schéma mobile, même en repli', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getAuthCallbackUrl()).not.toContain('whitealpha://');
  });
});
