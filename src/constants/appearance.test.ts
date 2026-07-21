import { Colors } from '@/constants/theme';
import {
  APPEARANCE_COLOR_PRESETS,
  APPEARANCE_LIMITS,
  BACKGROUND_SLOT_OPTIONS,
  DEFAULT_APPEARANCE_PREFERENCES,
  isValidHexColor,
  TEXT_SCALE_STEPS,
  THEME_MODE_OPTIONS,
} from '@/constants/appearance';

describe('DEFAULT_APPEARANCE_PREFERENCES (Phase 10.1)', () => {
  it("reprend l'apparence actuelle a l'identique (aucune regression visuelle par defaut)", () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.themeMode).toBe('system');
    expect(DEFAULT_APPEARANCE_PREFERENCES.accentColor).toBe(Colors.dark.accent);
    expect(DEFAULT_APPEARANCE_PREFERENCES.bubbleSentColor).toBe(Colors.dark.accent);
    expect(DEFAULT_APPEARANCE_PREFERENCES.bubbleReceivedColor).toBe(Colors.dark.surfaceHigh);
    expect(DEFAULT_APPEARANCE_PREFERENCES.textScale).toBe(1);
    expect(DEFAULT_APPEARANCE_PREFERENCES.blurLevel).toBe(0);
    expect(DEFAULT_APPEARANCE_PREFERENCES.darkenLevel).toBe(0);
  });

  it('ne definit aucun fond personnalise par defaut sur les 3 sections', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.backgrounds).toEqual({
      home: { kind: 'default' },
      conversation: { kind: 'default' },
      profile: { kind: 'default' },
    });
  });

  it('toutes ses valeurs numeriques respectent deja leurs propres bornes', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.cardOpacity).toBeGreaterThanOrEqual(APPEARANCE_LIMITS.cardOpacity.min);
    expect(DEFAULT_APPEARANCE_PREFERENCES.cardOpacity).toBeLessThanOrEqual(APPEARANCE_LIMITS.cardOpacity.max);
    expect(DEFAULT_APPEARANCE_PREFERENCES.blurLevel).toBeGreaterThanOrEqual(APPEARANCE_LIMITS.blurLevel.min);
    expect(DEFAULT_APPEARANCE_PREFERENCES.darkenLevel).toBeLessThanOrEqual(APPEARANCE_LIMITS.darkenLevel.max);
    expect(DEFAULT_APPEARANCE_PREFERENCES.textScale).toBeGreaterThanOrEqual(APPEARANCE_LIMITS.textScale.min);
  });
});

describe('isValidHexColor', () => {
  it('accepte un hexadecimal #RRGGBB', () => {
    expect(isValidHexColor('#2F6B45')).toBe(true);
  });

  it('rejette une valeur qui n’est pas une chaine, une couleur nommee ou un format court', () => {
    expect(isValidHexColor(123)).toBe(false);
    expect(isValidHexColor('green')).toBe(false);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
  });
});

describe('APPEARANCE_COLOR_PRESETS (Phase 10.3)', () => {
  it('ne contient que des couleurs hexadecimales valides', () => {
    for (const preset of APPEARANCE_COLOR_PRESETS) {
      expect(isValidHexColor(preset.hex)).toBe(true);
    }
  });

  it('a des identifiants et des couleurs tous uniques (aucun doublon)', () => {
    const ids = APPEARANCE_COLOR_PRESETS.map((preset) => preset.id);
    const hexes = APPEARANCE_COLOR_PRESETS.map((preset) => preset.hex.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('inclut la couleur par defaut actuelle (aucune regression : le preset "forest" reste selectionnable)', () => {
    expect(APPEARANCE_COLOR_PRESETS.some((preset) => preset.hex === DEFAULT_APPEARANCE_PREFERENCES.accentColor)).toBe(
      true,
    );
  });
});

describe('TEXT_SCALE_STEPS (Phase 10.3)', () => {
  it('est strictement croissant et borne exactement par APPEARANCE_LIMITS.textScale', () => {
    const values = TEXT_SCALE_STEPS.map((step) => step.value);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    expect(values[0]).toBe(APPEARANCE_LIMITS.textScale.min);
    expect(values[values.length - 1]).toBe(APPEARANCE_LIMITS.textScale.max);
  });

  it('inclut la valeur par defaut (1, taille inchangee)', () => {
    expect(TEXT_SCALE_STEPS.some((step) => step.value === DEFAULT_APPEARANCE_PREFERENCES.textScale)).toBe(true);
  });
});

describe('THEME_MODE_OPTIONS (Phase 10.3)', () => {
  it('propose exactement system/light/dark, sans doublon', () => {
    expect(THEME_MODE_OPTIONS.map((option) => option.value).sort()).toEqual(['dark', 'light', 'system']);
  });

  it('inclut la valeur par defaut ("system")', () => {
    expect(THEME_MODE_OPTIONS.some((option) => option.value === DEFAULT_APPEARANCE_PREFERENCES.themeMode)).toBe(true);
  });
});

describe('BACKGROUND_SLOT_OPTIONS (Phase 10.4)', () => {
  it('propose exactement les 3 sections definies dans backgrounds, sans doublon', () => {
    expect(BACKGROUND_SLOT_OPTIONS.map((option) => option.value).sort()).toEqual(
      Object.keys(DEFAULT_APPEARANCE_PREFERENCES.backgrounds).sort(),
    );
  });
});
