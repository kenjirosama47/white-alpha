/**
 * @jest-environment node
 *
 * next/server (NextRequest/NextResponse) s'appuie sur les globals Web
 * standard (Request/Response/Headers) : natifs sous Node, absents de
 * l'environnement jsdom par défaut de ce projet — ce fichier a donc besoin
 * de l'environnement Node, contrairement au reste de la suite.
 */
import { NextRequest } from 'next/server';

import { getSessionAuthenticatorLevels, updateSession } from '@/lib/supabase/middleware';

import { proxy } from './proxy';

jest.mock('@/lib/supabase/middleware', () => ({
  updateSession: jest.fn(),
  getSessionAuthenticatorLevels: jest.fn(),
}));

// Évite de dépendre de web/.env.local (non chargé par next/jest pour les
// tests) : ce test ne vérifie jamais une vraie connectivité Supabase, juste
// la logique de redirection et la CSP.
jest.mock('@/lib/supabase/config', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
}));

const mockUpdateSession = updateSession as jest.Mock;
const mockGetSessionAuthenticatorLevels = getSessionAuthenticatorLevels as jest.Mock;

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'https://white-alpha.example'));
}

const AUTHENTICATED_USER = { id: 'u1', email: 'a@example.com' };
const NO_MFA_LEVELS = { currentLevel: 'aal1', nextLevel: 'aal1' };
const MFA_PENDING_LEVELS = { currentLevel: 'aal1', nextLevel: 'aal2' };
const MFA_VERIFIED_LEVELS = { currentLevel: 'aal2', nextLevel: 'aal2' };

function mockSession(user: typeof AUTHENTICATED_USER | null, hadExpiredSession = false) {
  mockUpdateSession.mockResolvedValue({ response: new Response(), user, hadExpiredSession, supabase: {} });
}

describe('proxy.ts — protection de routes (Phase 8.3)', () => {
  beforeEach(() => {
    mockUpdateSession.mockReset();
    mockGetSessionAuthenticatorLevels.mockReset();
    mockGetSessionAuthenticatorLevels.mockResolvedValue(NO_MFA_LEVELS);
  });

  describe.each(['/membre', '/profil', '/installation-privee', '/conversations'])('route protégée %s', (path) => {
    it('redirige vers /login sans utilisateur authentifié', async () => {
      mockSession(null);

      const response = await proxy(makeRequest(path));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
      expect(response.headers.get('location')).toContain(`next=${encodeURIComponent(path)}`);
    });

    it('redirige vers /login une sous-route sans utilisateur', async () => {
      mockSession(null);

      const response = await proxy(makeRequest(`${path}/quelque-chose`));

      expect(response.headers.get('location')).toContain('/login');
    });

    it('laisse passer avec un utilisateur authentifié et sans MFA en attente', async () => {
      mockSession(AUTHENTICATED_USER);

      const response = await proxy(makeRequest(path));

      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
    });

    it('laisse passer avec un utilisateur déjà vérifié AAL2', async () => {
      mockSession(AUTHENTICATED_USER);
      mockGetSessionAuthenticatorLevels.mockResolvedValue(MFA_VERIFIED_LEVELS);

      const response = await proxy(makeRequest(path));

      expect(response.status).not.toBe(307);
    });

    it('redirige vers /verification-mfa si un facteur vérifié existe mais que la session est encore AAL1', async () => {
      mockSession(AUTHENTICATED_USER);
      mockGetSessionAuthenticatorLevels.mockResolvedValue(MFA_PENDING_LEVELS);

      const response = await proxy(makeRequest(path));

      expect(response.headers.get('location')).toContain('/verification-mfa');
      expect(response.headers.get('location')).toContain(`next=${encodeURIComponent(path)}`);
    });

    it('pose Cache-Control: no-store', async () => {
      mockSession(AUTHENTICATED_USER);

      const response = await proxy(makeRequest(path));

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe.each(['/reset-password', '/auth/callback'])(
    'route publique non authentifiée %s (Phase 8.4 — anomalie whitealpha:// corrigée)',
    (path) => {
      it('pose Cache-Control: no-store même sans session (jamais mis en cache, jamais de lien de récupération conservé)', async () => {
        mockSession(null);

        const response = await proxy(makeRequest(path));

        expect(response.headers.get('Cache-Control')).toBe('no-store');
      });
    },
  );

  it('distingue une session expirée (message dédié) d’un visiteur jamais connecté', async () => {
    mockSession(null, true);

    const response = await proxy(makeRequest('/membre'));

    expect(response.headers.get('location')).toContain('reason=expired');
  });

  it('ne signale jamais "expired" pour un visiteur jamais connecté', async () => {
    mockSession(null, false);

    const response = await proxy(makeRequest('/membre'));

    expect(response.headers.get('location')).not.toContain('reason=expired');
  });

  describe('/verification-mfa', () => {
    it('exige une authentification (redirige vers /login sans utilisateur)', async () => {
      mockSession(null);

      const response = await proxy(makeRequest('/verification-mfa'));

      expect(response.headers.get('location')).toContain('/login');
    });

    it('laisse passer un utilisateur AAL1 avec vérification en attente', async () => {
      mockSession(AUTHENTICATED_USER);
      mockGetSessionAuthenticatorLevels.mockResolvedValue(MFA_PENDING_LEVELS);

      const response = await proxy(makeRequest('/verification-mfa'));

      expect(response.status).not.toBe(307);
    });

    it('redirige ailleurs si aucune vérification n’est nécessaire (jamais affiché inutilement)', async () => {
      mockSession(AUTHENTICATED_USER);
      mockGetSessionAuthenticatorLevels.mockResolvedValue(NO_MFA_LEVELS);

      const response = await proxy(makeRequest('/verification-mfa?next=%2Fprofil'));

      expect(response.headers.get('location')).toContain('/profil');
    });

    it('redirige vers /membre par défaut si next est absent ou externe', async () => {
      mockSession(AUTHENTICATED_USER);
      mockGetSessionAuthenticatorLevels.mockResolvedValue(MFA_VERIFIED_LEVELS);

      const response = await proxy(makeRequest('/verification-mfa?next=https://evil.example'));

      expect(response.headers.get('location')).toContain('/membre');
      expect(response.headers.get('location')).not.toContain('evil.example');
    });
  });

  it.each(['/login', '/inscription', '/forgot-password'])(
    'redirige un utilisateur déjà authentifié loin de %s vers /membre',
    async (path) => {
      mockSession(AUTHENTICATED_USER);

      const response = await proxy(makeRequest(path));

      expect(response.headers.get('location')).toContain('/membre');
    },
  );

  it(
    'exception Phase 8.4 : /forgot-password?reason=link_expired reste accessible même pour un utilisateur déjà authentifié — ' +
      'jamais /membre en repli silencieux pendant un parcours de récupération de mot de passe',
    async () => {
      mockSession(AUTHENTICATED_USER);

      const response = await proxy(makeRequest('/forgot-password?reason=link_expired'));

      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('un utilisateur déjà authentifié visitant /forgot-password SANS reason=link_expired est bien redirigé vers /membre comme avant (exception non générale)', async () => {
    mockSession(AUTHENTICATED_USER);

    const response = await proxy(makeRequest('/forgot-password'));

    expect(response.headers.get('location')).toContain('/membre');
  });

  it("n'exige pas d'authentification pour une page publique (/install)", async () => {
    mockSession(null);

    const response = await proxy(makeRequest('/install'));

    expect(response.status).not.toBe(307);
  });

  it("n'appelle jamais getSessionAuthenticatorLevels pour une page publique", async () => {
    mockSession(null);

    await proxy(makeRequest('/install'));

    expect(mockGetSessionAuthenticatorLevels).not.toHaveBeenCalled();
  });

  it('pose une Content-Security-Policy avec un nonce sur chaque réponse', async () => {
    mockSession(null);

    const response = await proxy(makeRequest('/'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('génère un nonce différent à chaque requête (jamais une valeur statique/réutilisée)', async () => {
    // Une nouvelle Response par appel : `updateSession` renverrait en réalité
    // une NextResponse distincte à chaque requête HTTP réelle — partager la
    // même instance de mock entre deux appels ferait muter deux fois le même
    // objet d'en-têtes et fausserait la comparaison ci-dessous.
    mockUpdateSession.mockImplementation(async () => ({
      response: new Response(),
      user: null,
      hadExpiredSession: false,
      supabase: {},
    }));

    const response1 = await proxy(makeRequest('/'));
    const nonce1 = response1.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];

    const response2 = await proxy(makeRequest('/'));
    const nonce2 = response2.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonce1).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it(
    "ajoute 'unsafe-eval' hors production (requis par React/Turbopack HMR pour eval() en développement — " +
      "NODE_ENV vaut 'test' sous Jest, jamais 'production' ; le vrai build de production est vérifié " +
      "séparément, hors Jest, car `next/jest` fige NODE_ENV au moment de la transformation)",
    async () => {
      mockSession(null);

      const response = await proxy(makeRequest('/'));
      const csp = response.headers.get('Content-Security-Policy');

      expect(csp).toContain("'unsafe-eval'");
    },
  );

  it("media-src (Phase 8.5.4) : 'self' et l'origine Supabase uniquement, jamais * ni blob:/data: ni domaine externe", async () => {
    mockSession(null);

    const response = await proxy(makeRequest('/'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toContain("media-src 'self' https://example.supabase.co");
    expect(csp).not.toMatch(/media-src[^;]*\*/);
    expect(csp).not.toMatch(/media-src[^;]*blob:/);
    expect(csp).not.toMatch(/media-src[^;]*data:/);
  });

  it('les autres directives CSP restent inchangées après l’ajout de media-src (Phase 8.5.4)', async () => {
    mockSession(null);

    const response = await proxy(makeRequest('/'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("strict-dynamic");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: https://example.supabase.co");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});
