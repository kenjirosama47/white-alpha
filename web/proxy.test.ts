/**
 * @jest-environment node
 *
 * next/server (NextRequest/NextResponse) s'appuie sur les globals Web
 * standard (Request/Response/Headers) : natifs sous Node, absents de
 * l'environnement jsdom par défaut de ce projet — ce fichier a donc besoin
 * de l'environnement Node, contrairement au reste de la suite.
 */
import { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

import { proxy } from './proxy';

jest.mock('@/lib/supabase/middleware', () => ({
  updateSession: jest.fn(),
}));

// Évite de dépendre de web/.env.local (non chargé par next/jest pour les
// tests) : ce test ne vérifie jamais une vraie connectivité Supabase, juste
// la logique de redirection et la CSP.
jest.mock('@/lib/supabase/config', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
}));

const mockUpdateSession = updateSession as jest.Mock;

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'https://white-alpha.example'));
}

describe('proxy.ts — protection de routes (Phase 8.2)', () => {
  beforeEach(() => {
    mockUpdateSession.mockReset();
  });

  it('redirige vers /login une route protégée (/app) sans utilisateur authentifié', async () => {
    const request = makeRequest('/app');
    mockUpdateSession.mockResolvedValue({ response: new Response(), user: null });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('redirige vers /login une sous-route protégée (/app/quelque-chose) sans utilisateur', async () => {
    const request = makeRequest('/app/quelque-chose');
    mockUpdateSession.mockResolvedValue({ response: new Response(), user: null });

    const response = await proxy(request);

    expect(response.headers.get('location')).toContain('/login');
  });

  it('laisse passer /app avec un utilisateur authentifié (pas de redirection)', async () => {
    const request = makeRequest('/app');
    mockUpdateSession.mockResolvedValue({
      response: new Response(),
      user: { id: 'u1', email: 'a@example.com' },
    });

    const response = await proxy(request);

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirige un utilisateur déjà authentifié loin de /login vers /app', async () => {
    const request = makeRequest('/login');
    mockUpdateSession.mockResolvedValue({
      response: new Response(),
      user: { id: 'u1', email: 'a@example.com' },
    });

    const response = await proxy(request);

    expect(response.headers.get('location')).toContain('/app');
  });

  it("n'exige pas d'authentification pour une page publique (/install)", async () => {
    const request = makeRequest('/install');
    mockUpdateSession.mockResolvedValue({ response: new Response(), user: null });

    const response = await proxy(request);

    expect(response.status).not.toBe(307);
  });

  it('pose une Content-Security-Policy avec un nonce sur chaque réponse', async () => {
    const request = makeRequest('/');
    mockUpdateSession.mockResolvedValue({ response: new Response(), user: null });

    const response = await proxy(request);
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
    mockUpdateSession.mockImplementation(async () => ({ response: new Response(), user: null }));

    const response1 = await proxy(makeRequest('/'));
    const nonce1 = response1.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];

    const response2 = await proxy(makeRequest('/'));
    const nonce2 = response2.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonce1).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });
});
