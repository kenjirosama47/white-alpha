import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

describe('Colors (Design System Phase 7.1)', () => {
  it('light et dark exposent exactement le même ensemble de clés', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });

  it('toutes les valeurs sont des couleurs hexadécimales valides', () => {
    for (const [scheme, palette] of Object.entries(Colors)) {
      for (const [key, value] of Object.entries(palette)) {
        expect(HEX_COLOR_PATTERN.test(value)).toBe(true);
        // Message d'échec explicite si un futur token casse le format.
        if (!HEX_COLOR_PATTERN.test(value)) {
          throw new Error(`Colors.${scheme}.${key} = "${value}" n'est pas un hex #RRGGBB valide`);
        }
      }
    }
  });

  it("l'accent (vert forêt) est identique en clair et en sombre (identité de marque stable)", () => {
    expect(Colors.light.accent).toBe(Colors.dark.accent);
  });

  it("les alias hérités backgroundElement/backgroundSelected restent définis (non-régression écrans Phase 5/6)", () => {
    expect(Colors.light.backgroundElement).toBeDefined();
    expect(Colors.light.backgroundSelected).toBeDefined();
    expect(Colors.dark.backgroundElement).toBeDefined();
    expect(Colors.dark.backgroundSelected).toBeDefined();
  });
});

describe('Typography (Design System Phase 7.1)', () => {
  it('chaque variante a une taille de police strictement croissante avec sa hiérarchie (caption < label = bodySmall <= body < subtitle < title < display)', () => {
    expect(Typography.caption.fontSize).toBeLessThan(Typography.body.fontSize);
    expect(Typography.body.fontSize).toBeLessThan(Typography.subtitle.fontSize);
    expect(Typography.subtitle.fontSize).toBeLessThan(Typography.title.fontSize);
    expect(Typography.title.fontSize).toBeLessThan(Typography.display.fontSize);
  });

  it("aucune variante ne descend sous 12px (jamais de texte excessivement réduit)", () => {
    for (const variant of Object.values(Typography)) {
      expect(variant.fontSize).toBeGreaterThanOrEqual(12);
    }
  });

  it('chaque variante définit un maxFontSizeMultiplier (jamais de redimensionnement dynamique désactivé)', () => {
    for (const variant of Object.values(Typography)) {
      expect(variant.maxFontSizeMultiplier).toBeGreaterThan(1);
    }
  });
});

describe('Spacing et Radius (Design System Phase 7.1)', () => {
  it('le barème Spacing existant (Phase 5) reste inchangé', () => {
    expect(Spacing).toEqual({ half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 });
  });

  it('Radius expose sm < md < lg < pill', () => {
    expect(Radius.sm).toBeLessThan(Radius.md);
    expect(Radius.md).toBeLessThan(Radius.lg);
    expect(Radius.lg).toBeLessThan(Radius.pill);
  });
});
