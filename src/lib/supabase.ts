import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Variables Supabase manquantes : renseigne EXPO_PUBLIC_SUPABASE_URL et ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans le fichier .env',
  );
}

// AsyncStorage accède à `window`, absent lors du rendu statique/SSR web.
// Sur web, on laisse supabase-js utiliser son storage par défaut
// (déjà protégé contre l'absence de `window`).
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
