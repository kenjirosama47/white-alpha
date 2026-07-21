import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APPEARANCE_LIMITS,
  APPEARANCE_SCHEMA_VERSION,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  isValidHexColor,
} from '@/constants/appearance';
import { isWolfAvatarId } from '@/constants/avatars';
import { logDebugEvent } from '@/lib/logger';
import type { AppearancePreferences, BackgroundConfig, BackgroundSlot, ThemeMode } from '@/types/appearance';

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
const BACKGROUND_SLOTS: readonly BackgroundSlot[] = ['home', 'conversation', 'profile'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeThemeMode(value: unknown): ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
    ? (value as ThemeMode)
    : DEFAULT_APPEARANCE_PREFERENCES.themeMode;
}

function sanitizeColor(value: unknown, fallback: string): string {
  return isValidHexColor(value) ? value : fallback;
}

function sanitizeLevel(value: unknown, limits: { min: number; max: number }, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, limits.min, limits.max) : fallback;
}

/**
 * `localUri` doit toujours rester un chemin de fichier LOCAL : jamais une
 * URL `http(s)` (ce serait le signe qu'une valeur distante — ou pire, une
 * URL signée — s'est glissée ici, voir contrainte Phase 10.1, section 8 :
 * aucune URL signée ni jeton n'est jamais stocké dans ces préférences).
 */
function sanitizeBackgroundConfig(value: unknown, fallback: BackgroundConfig): BackgroundConfig {
  if (typeof value !== 'object' || value === null) return fallback;
  const candidate = value as Record<string, unknown>;

  if (candidate.kind === 'default') return { kind: 'default' };

  if (
    candidate.kind === 'catalog' &&
    typeof candidate.decorationId === 'string' &&
    candidate.decorationId.length > 0
  ) {
    return { kind: 'catalog', decorationId: candidate.decorationId };
  }

  if (
    candidate.kind === 'personal' &&
    typeof candidate.localUri === 'string' &&
    candidate.localUri.length > 0 &&
    !/^https?:\/\//i.test(candidate.localUri)
  ) {
    return { kind: 'personal', localUri: candidate.localUri };
  }

  return fallback;
}

function sanitizeBackgrounds(value: unknown): Record<BackgroundSlot, BackgroundConfig> {
  const candidate = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = {} as Record<BackgroundSlot, BackgroundConfig>;
  for (const slot of BACKGROUND_SLOTS) {
    result[slot] = sanitizeBackgroundConfig(candidate[slot], DEFAULT_APPEARANCE_PREFERENCES.backgrounds[slot]);
  }
  return result;
}

function sanitizeAvatarPreset(value: unknown): AppearancePreferences['avatarPreset'] {
  return typeof value === 'string' && isWolfAvatarId(value) ? value : DEFAULT_APPEARANCE_PREFERENCES.avatarPreset;
}

/**
 * Revalide entièrement une valeur lue depuis le stockage : chaque champ
 * invalide ou hors bornes retombe individuellement sur sa valeur par
 * défaut (jamais un rejet global de l'objet) — même principe défensif que
 * `isWolfAvatarId`/repli sur `DEFAULT_WOLF_AVATAR_ID` déjà utilisé dans
 * `services/profiles.ts`. Aucun champ inconnu n'est jamais reporté tel
 * quel : protection contre une valeur corrompue ou une forme de schéma non
 * prévue par la migration.
 */
export function sanitizeAppearancePreferences(value: unknown): AppearancePreferences {
  const candidate = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    themeMode: sanitizeThemeMode(candidate.themeMode),
    accentColor: sanitizeColor(candidate.accentColor, DEFAULT_APPEARANCE_PREFERENCES.accentColor),
    buttonColor: sanitizeColor(candidate.buttonColor, DEFAULT_APPEARANCE_PREFERENCES.buttonColor),
    bubbleSentColor: sanitizeColor(candidate.bubbleSentColor, DEFAULT_APPEARANCE_PREFERENCES.bubbleSentColor),
    bubbleReceivedColor: sanitizeColor(
      candidate.bubbleReceivedColor,
      DEFAULT_APPEARANCE_PREFERENCES.bubbleReceivedColor,
    ),
    cardOpacity: sanitizeLevel(
      candidate.cardOpacity,
      APPEARANCE_LIMITS.cardOpacity,
      DEFAULT_APPEARANCE_PREFERENCES.cardOpacity,
    ),
    blurLevel: sanitizeLevel(candidate.blurLevel, APPEARANCE_LIMITS.blurLevel, DEFAULT_APPEARANCE_PREFERENCES.blurLevel),
    darkenLevel: sanitizeLevel(
      candidate.darkenLevel,
      APPEARANCE_LIMITS.darkenLevel,
      DEFAULT_APPEARANCE_PREFERENCES.darkenLevel,
    ),
    textScale: sanitizeLevel(candidate.textScale, APPEARANCE_LIMITS.textScale, DEFAULT_APPEARANCE_PREFERENCES.textScale),
    backgrounds: sanitizeBackgrounds(candidate.backgrounds),
    avatarPreset: sanitizeAvatarPreset(candidate.avatarPreset),
  };
}

/**
 * Chaîne de migration par version d'origine détectée (`schemaVersion` lu
 * tel quel, avant toute revalidation) : chaque étape convertit un schéma
 * antérieur vers le suivant. Vide pour l'instant (version 1 = version
 * actuelle) — prévue pour accueillir les futures Phases 10.x sans jamais
 * perdre les préférences déjà enregistrées par un utilisateur.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

function migrateAppearancePreferences(raw: Record<string, unknown>): Record<string, unknown> {
  let migrated = raw;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  while (version < APPEARANCE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      // Aucun chemin de migration connu depuis cette version (schéma futur
      // inconnu, ou version corrompue) : abandonne la migration ici, la
      // revalidation ci-dessous applique les valeurs par défaut champ par
      // champ plutôt que de propager une forme non fiable.
      logDebugEvent(`[White Alpha][appearance] Migration inconnue depuis la version ${version}.`);
      return migrated;
    }
    migrated = step(migrated);
    version += 1;
  }

  return migrated;
}

/**
 * Préférences d'apparence de l'appareil courant. Ne lève jamais d'erreur :
 * un stockage illisible, une valeur JSON corrompue ou un schéma inconnu
 * retombent silencieusement sur `DEFAULT_APPEARANCE_PREFERENCES` (mêmes
 * garanties « aucune régression visuelle » que si l'utilisateur n'avait
 * jamais personnalisé quoi que ce soit).
 */
export async function getAppearancePreferences(): Promise<AppearancePreferences> {
  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
  } catch {
    logDebugEvent('[White Alpha][appearance] Stockage local indisponible (lecture).');
    return DEFAULT_APPEARANCE_PREFERENCES;
  }

  if (!stored) {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    logDebugEvent('[White Alpha][appearance] Préférences stockées illisibles (JSON invalide).');
    return DEFAULT_APPEARANCE_PREFERENCES;
  }

  const raw = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const migrated = migrateAppearancePreferences(raw);
  return sanitizeAppearancePreferences(migrated);
}

/**
 * Enregistre l'intégralité des préférences (jamais une écriture partielle :
 * les appelants passent toujours l'objet complet, voir le futur
 * `AppearanceProvider` Phase 10.2). Revalidées avant écriture, pour ne
 * jamais persister une valeur hors bornes même si l'appelant en amont a un
 * bug.
 */
export async function saveAppearancePreferences(preferences: AppearancePreferences): Promise<void> {
  const sanitized = sanitizeAppearancePreferences(preferences);
  try {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    logDebugEvent('[White Alpha][appearance] Stockage local indisponible (ecriture).');
    throw new Error("Impossible d'enregistrer les preferences d'apparence.");
  }
}

/**
 * Réinitialise aux valeurs par défaut en supprimant l'entrée locale
 * (plutôt que d'y réécrire les valeurs par défaut) : un futur changement
 * des valeurs par défaut s'appliquera immédiatement à un compte déjà
 * réinitialisé. Best-effort : un échec de suppression n'empêche jamais
 * l'appelant de continuer avec les valeurs par défaut en mémoire.
 */
export async function resetAppearancePreferences(): Promise<AppearancePreferences> {
  try {
    await AsyncStorage.removeItem(APPEARANCE_STORAGE_KEY);
  } catch {
    logDebugEvent('[White Alpha][appearance] Stockage local indisponible (reinitialisation).');
  }
  return DEFAULT_APPEARANCE_PREFERENCES;
}
