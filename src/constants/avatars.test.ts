import {
  DEFAULT_WOLF_AVATAR_ID,
  WOLF_AVATAR_CATALOG,
  getWolfAvatarLabel,
  isWolfAvatarId,
  resolveWolfAvatarSource,
} from '@/constants/avatars';

describe('Catalogue des avatars loups (Phase 7.1 — architecture uniquement)', () => {
  it('expose exactement les 9 identifiants officiels demandés', () => {
    expect(WOLF_AVATAR_CATALOG.map((entry) => entry.id)).toEqual([
      'wolf_white_calm',
      'wolf_grey',
      'wolf_black',
      'wolf_brown',
      'wolf_snow',
      'wolf_green_eye',
      'wolf_young',
      'wolf_guardian',
      'wolf_alpha',
    ]);
  });

  it('DEFAULT_WOLF_AVATAR_ID fait partie du catalogue', () => {
    expect(WOLF_AVATAR_CATALOG.some((entry) => entry.id === DEFAULT_WOLF_AVATAR_ID)).toBe(true);
  });

  it("isWolfAvatarId reconnaît un identifiant valide et rejette une valeur arbitraire", () => {
    expect(isWolfAvatarId('wolf_alpha')).toBe(true);
    expect(isWolfAvatarId('loup-inconnu')).toBe(false);
  });

  it('getWolfAvatarLabel renvoie le libellé attendu', () => {
    expect(getWolfAvatarLabel('wolf_green_eye')).toBe('Loup au regard vert');
  });

  it("resolveWolfAvatarSource renvoie null tant qu'aucune image définitive n'est fournie (Phase 7.1)", () => {
    for (const entry of WOLF_AVATAR_CATALOG) {
      expect(resolveWolfAvatarSource(entry.id)).toBeNull();
    }
  });

  it('resolveWolfAvatarSource renvoie null pour un identifiant absent (null/undefined)', () => {
    expect(resolveWolfAvatarSource(null)).toBeNull();
    expect(resolveWolfAvatarSource(undefined)).toBeNull();
  });
});
