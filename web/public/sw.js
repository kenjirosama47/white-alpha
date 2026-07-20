// Service Worker minimal White Alpha (Phase 8.2, fondation).
//
// Règle absolue : ce fichier ne doit JAMAIS mettre en cache une réponse
// contenant des données privées (messages, conversations, profils,
// réponses Supabase authentifiées, médias utilisateurs, URLs signées). Toute
// modification de ce fichier doit être relue avec cette règle en tête avant
// tout déploiement.
//
// Bump ce numéro à chaque changement de stratégie de cache : la fonction
// `activate` supprime automatiquement tous les caches d'une version
// précédente, jamais un cache ne persiste silencieusement entre deux
// versions.
const CACHE_VERSION = 'v1';
const STATIC_CACHE_NAME = `white-alpha-static-${CACHE_VERSION}`;

// Pages/assets statiques et publics uniquement — jamais une route
// authentifiée ou intermédiaire d'authentification, jamais une réponse
// Supabase. Préchargées à l'installation du Service Worker pour un premier
// chargement hors connexion correct.
const PRECACHE_URLS = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

// Préfixes/chemins jamais mis en cache, quelle que soit la stratégie
// ci-dessous — zone authentifiée (Phase 8.3 : /membre, /profil,
// /installation-privee ; Phase 8.4 : /conversations, messages privés),
// étapes d'authentification sensibles (/verification-mfa,
// /reset-password, /auth/callback — lien à usage unique) et formulaires
// d'identifiants.
const NEVER_CACHE_PATH_PREFIXES = [
  '/membre',
  '/profil',
  '/installation-privee',
  '/conversations',
  '/verification-mfa',
  '/reset-password',
  '/login',
  '/inscription',
  '/forgot-password',
  '/auth/callback',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('white-alpha-') && name !== STATIC_CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Jamais true pour une origine différente (ex. Supabase), une route authentifiée, ou une URL signée (paramètres token/signature typiques). */
function isCacheableRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (NEVER_CACHE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  if (url.searchParams.has('token') || url.searchParams.has('Signature') || url.searchParams.has('X-Amz-Signature')) {
    return false;
  }
  return true;
}

/** Statique versionné/immuable (assets Next.js hashés, icônes, avatars locaux) : cache d'abord, jamais périmé (le hash change si le contenu change). */
function isImmutableStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/avatars/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isCacheableRequest(url)) {
    // Jamais d'interception : requête réseau normale, sans jamais toucher
    // au cache (zone authentifiée, API Supabase, URL signée).
    return;
  }

  if (isImmutableStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => cacheResponse(request, response))),
    );
    return;
  }

  if (request.mode === 'navigate') {
    // Stratégie réseau prioritaire pour les pages : toujours la version la
    // plus fraîche si le réseau répond, jamais une page authentifiée
    // périmée. Le repli hors connexion n'affiche jamais rien de privé.
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Tout le reste (pages publiques non-navigation, CSS, polices) : réseau
  // prioritaire avec repli cache si hors connexion, jamais l'inverse.
  event.respondWith(
    fetch(request)
      .then((response) => cacheResponse(request, response))
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});

function cacheResponse(request, response) {
  if (response.ok) {
    const responseClone = response.clone();
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, responseClone));
  }
  return response;
}
