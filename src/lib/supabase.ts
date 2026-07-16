import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { secureStorageAdapter } from '@/lib/secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Variables Supabase manquantes : renseigne EXPO_PUBLIC_SUPABASE_URL et ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans le fichier .env',
  );
}

/** Exportées pour l'upload TUS (Phase 4B), qui a besoin du hostname Storage direct et de la clé publishable — jamais d'un jeton secret. */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey;

/**
 * Calculée explicitement plutôt que laissée au défaut implicite de
 * supabase-js (`sb-<ref>-auth-token`, dérivé du même hostname) : la migration
 * locale Phase 5.S1 (`secure-session-storage.ts`) a besoin de connaître cette
 * clé de façon déterministe, sans dépendre d'un détail interne du SDK.
 */
export const SESSION_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

// Sur natif (Android/iOS) : SecureStore, chiffré (Android Keystore / iOS
// Keychain) — jamais AsyncStorage en clair (Phase 5.S1). Sur web, storage
// `undefined` : supabase-js utilise son propre stockage web par défaut
// (déjà protégé contre l'absence de `window` lors du rendu statique/SSR),
// SecureStore n'est jamais importé ni appelé côté web.
const storage = Platform.OS === 'web' ? undefined : secureStorageAdapter;

// Doit correspondre au scheme natif ("scheme" dans app.json) et à une URL
// autorisée dans Supabase Auth > URL Configuration > Redirect URLs.
export const AUTH_CALLBACK_URL = 'whitealpha://auth/callback';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    storageKey: SESSION_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Pas de `lock`/`processLock` : dans cette version de @supabase/auth-js,
    // le client coordonne déjà les rafraîchissements en interne et le
    // serveur résout les races entre appels concurrents — l'option est
    // explicitement documentée comme dépréciée et sans effet (voir
    // node_modules/@supabase/auth-js/.../lib/locks.js).
  },
});
