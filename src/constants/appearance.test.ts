import { Colors } from '@/constants/theme';
import { APPEARANCE_LIMITS, DEFAULT_APPEARANCE_PREFERENCES, isValidHexColor } from '@/constants/appearance';

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
