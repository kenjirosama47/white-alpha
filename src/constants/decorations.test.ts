import {
  DECORATION_CATALOG,
  DECORATION_CATEGORIES,
  getDecorationLabel,
  getDecorationsByCategory,
  isDecorationId,
  resolveDecorationSource,
} from '@/constants/decorations';

describe('Catégories de décorations (Phase 10.4)', () => {
  it('expose exactement les 8 catégories demandées, dans cet ordre', () => {
    expect(DECORATION_CATEGORIES.map((category) => category.id)).toEqual([
      'white_alpha',
      'wolves',
      'nature',
      'mountains',
      'forest',
      'night_sky',
      'dark_abstract',
      'minimal',
    ]);
  });

  it('a des identifiants et des libellés tous uniques', () => {
    const ids = DECORATION_CATEGORIES.map((category) => category.id);
    const labels = DECORATION_CATEGORIES.map((category) => category.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('Catalogue des décorations (Phase 10.4)', () => {
  it('chaque entrée référence une catégorie existante', () => {
    const categoryIds = new Set(DECORATION_CATEGORIES.map((category) => category.id));
    for (const entry of DECORATION_CATALOG) {
      expect(categoryIds.has(entry.categoryId)).toBe(true);
    }
  });

  it('a des identifiants tous uniques', () => {
    const ids = DECORATION_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('propose au moins 3 fonds par catégorie (plusieurs miniatures par catégorie)', () => {
    for (const category of DECORATION_CATEGORIES) {
      expect(getDecorationsByCategory(category.id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('getDecorationsByCategory renvoie un tableau vide pour une catégorie inconnue, jamais une erreur', () => {
    // @ts-expect-error — valeur volontairement hors du type, pour vérifier le comportement défensif à l'exécution.
    expect(getDecorationsByCategory('categorie-inconnue')).toEqual([]);
  });

  it('isDecorationId reconnaît un identifiant valide et rejette une valeur arbitraire', () => {
    expect(isDecorationId('night_sky_moon')).toBe(true);
    expect(isDecorationId('fond-inconnu')).toBe(false);
  });

  it('getDecorationLabel renvoie le libellé attendu', () => {
    expect(getDecorationLabel('night_sky_moon')).toBe('Pleine lune');
  });

  it('resolveDecorationSource renvoie une source non nulle pour les 24 identifiants du catalogue', () => {
    for (const entry of DECORATION_CATALOG) {
      expect(resolveDecorationSource(entry.id)).not.toBeNull();
    }
  });

  it('resolveDecorationSource renvoie null pour un identifiant absent, null, undefined ou hors catalogue (fallback, jamais une erreur)', () => {
    expect(resolveDecorationSource(null)).toBeNull();
    expect(resolveDecorationSource(undefined)).toBeNull();
    expect(resolveDecorationSource('fond-inconnu')).toBeNull();
  });
});
