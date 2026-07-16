import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Journal générique pour les événements de stockage de session : jamais de
 * jeton, de session complète, de mot de passe ni de détail interne — une
 * catégorie fixe uniquement (Phase 5.S1, section 9).
 */
export function logAuthStorageEvent(category: string): void {
  console.log(`[White Alpha][auth-storage] ${category}`);
}

const MIGRATION_MARKER_SUFFIX = '-migrated-v1';

/**
 * Adaptateur `SupportedStorage` pour Supabase Auth, adossé à `expo-secure-store`
 * (Android Keystore / iOS Keychain) — jamais AsyncStorage en clair sur natif.
 * Aucune valeur n'est jamais journalisée ; chaque échec est explicitement
 * capturé, catégorisé et propagé (jamais ignoré silencieusement, jamais de
 * repli automatique vers un stockage non chiffré).
 */
export const secureStorageAdapter: SupportedStorage = {
  async getItem(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      logAuthStorageEvent('Stockage sécurisé indisponible (lecture).');
      throw new Error('Impossible de lire la session sécurisée.');
    }
  },
  async setItem(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      logAuthStorageEvent('Stockage sécurisé indisponible (écriture).');
      throw new Error("Impossible d'enregistrer la session en sécurité.");
    }
  },
  async removeItem(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      logAuthStorageEvent('Stockage sécurisé indisponible (suppression).');
      throw new Error('Impossible de supprimer la session sécurisée.');
    }
  },
};

/**
 * Supprime la session stockée de façon sécurisée, sans jamais lever d'erreur
 * (best-effort) — utilisée pour les nettoyages forcés (session illisible,
 * déconnexion après échec réseau) où un échec de suppression ne doit jamais
 * bloquer le flux appelant.
 */
export async function clearStoredSession(storageKey: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(storageKey);
  } catch {
    logAuthStorageEvent('Stockage sécurisé indisponible (nettoyage forcé).');
  }
}

/**
 * Migration locale unique, à usage unique par appareil : déplace une
 * éventuelle session déjà persistée par une version antérieure de l'app
 * (AsyncStorage, en clair) vers SecureStore (chiffré). Ne s'exécute jamais
 * sur Web. Ne parcourt jamais l'ensemble d'AsyncStorage : cherche
 * exclusivement la clé Supabase connue (`storageKey`).
 *
 * Flux (Phase 5.S1, section 5) : lit l'ancienne valeur -> vérifie qu'elle
 * ressemble à une session Supabase valide -> écrit dans SecureStore -> relit
 * pour confirmer l'écriture -> supprime l'ancienne valeur AsyncStorage
 * uniquement après cette confirmation -> pose un marqueur versionné pour ne
 * jamais rejouer la migration. En cas d'échec à n'importe quelle étape,
 * l'ancienne valeur AsyncStorage n'est jamais supprimée et aucun marqueur
 * n'est posé (nouvelle tentative au prochain démarrage, jamais de boucle au
 * sein d'un même démarrage).
 */
export async function migrateLegacySessionToSecureStore(storageKey: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const migrationMarkerKey = `${storageKey}${MIGRATION_MARKER_SUFFIX}`;

  try {
    const alreadyMigrated = await SecureStore.getItemAsync(migrationMarkerKey);
    if (alreadyMigrated === 'true') return;
  } catch {
    logAuthStorageEvent('Stockage sécurisé indisponible (vérification de migration).');
    return;
  }

  let legacyValue: string | null;
  try {
    legacyValue = await AsyncStorage.getItem(storageKey);
  } catch {
    logAuthStorageEvent('Ancien stockage illisible pendant la migration.');
    return;
  }

  if (!legacyValue) {
    // Rien à migrer (nouvelle installation, ou ancienne clé déjà absente) :
    // pose le marqueur pour ne jamais revérifier inutilement au démarrage suivant.
    try {
      await SecureStore.setItemAsync(migrationMarkerKey, 'true');
    } catch {
      logAuthStorageEvent('Stockage sécurisé indisponible (marqueur de migration).');
    }
    return;
  }

  if (!looksLikeSupabaseSession(legacyValue)) {
    // Valeur présente mais qui ne ressemble pas à une session Supabase valide
    // (format inattendu) : ne la déplace jamais vers SecureStore telle quelle,
    // nettoie l'ancienne entrée et considère la migration terminée.
    try {
      await AsyncStorage.removeItem(storageKey);
      await SecureStore.setItemAsync(migrationMarkerKey, 'true');
    } catch {
      logAuthStorageEvent('Nettoyage impossible pour une ancienne valeur invalide.');
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(storageKey, legacyValue);
    const readBack = await SecureStore.getItemAsync(storageKey);
    if (readBack !== legacyValue) {
      throw new Error('secure-store-readback-mismatch');
    }

    await AsyncStorage.removeItem(storageKey);
    await SecureStore.setItemAsync(migrationMarkerKey, 'true');
    logAuthStorageEvent('Migration de session vers le stockage sécurisé réussie.');
  } catch {
    // Échec à une étape quelconque : l'ancienne valeur AsyncStorage N'EST PAS
    // supprimée, aucun marqueur n'est posé — nouvelle tentative au prochain
    // démarrage de l'app. Jamais de contenu sensible dans le log.
    logAuthStorageEvent('Migration de session vers le stockage sécurisé échouée.');
  }
}

/** Vérification de forme minimale, jamais de validation cryptographique — seulement de quoi éviter de migrer une valeur clairement invalide. */
function looksLikeSupabaseSession(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).access_token === 'string' &&
      typeof (parsed as Record<string, unknown>).refresh_token === 'string'
    );
  } catch {
    return false;
  }
}
