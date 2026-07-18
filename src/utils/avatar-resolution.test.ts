import { isValidAvatarUrl, resolveAvatarDisplay } from '@/utils/avatar-resolution';

describe('isValidAvatarUrl', () => {
  it('accepte une URL https valide', () => {
    expect(isValidAvatarUrl('https://example.supabase.co/storage/v1/object/public/avatars/x.png')).toBe(true);
  });

  it('accepte une URL http valide', () => {
    expect(isValidAvatarUrl('http://example.com/a.png')).toBe(true);
  });

  it('rejette null/undefined', () => {
    expect(isValidAvatarUrl(null)).toBe(false);
    expect(isValidAvatarUrl(undefined)).toBe(false);
  });

  it('rejette une chaîne vide ou blanche', () => {
    expect(isValidAvatarUrl('')).toBe(false);
    expect(isValidAvatarUrl('   ')).toBe(false);
  });

  it('rejette les littéraux "null"/"undefined" (insensible à la casse)', () => {
    expect(isValidAvatarUrl('null')).toBe(false);
    expect(isValidAvatarUrl('undefined')).toBe(false);
    expect(isValidAvatarUrl('NULL')).toBe(false);
  });

  it('rejette une URL invalide (non parseable, ou schéma non http(s))', () => {
    expect(isValidAvatarUrl('pas-une-url')).toBe(false);
    expect(isValidAvatarUrl('ftp://example.com/a.png')).toBe(false);
  });
});

describe('resolveAvatarDisplay', () => {
  it('priorise une avatarUrl valide sur avatarPreset', () => {
    const result = resolveAvatarDisplay('https://example.com/photo.png', 'wolf_grey');
    expect(result.kind).toBe('photo');
  });

  it('retombe sur avatarPreset quand avatarUrl est vide', () => {
    const result = resolveAvatarDisplay('', 'wolf_grey');
    expect(result.kind).toBe('wolf');
  });

  it('retombe sur avatarPreset quand avatarUrl contient le littéral "null"', () => {
    const result = resolveAvatarDisplay('null', 'wolf_grey');
    expect(result.kind).toBe('wolf');
  });

  it('retombe sur avatarPreset quand avatarUrl contient le littéral "undefined"', () => {
    const result = resolveAvatarDisplay('undefined', 'wolf_grey');
    expect(result.kind).toBe('wolf');
  });

  it('retombe sur avatarPreset quand avatarUrl est une URL malformée (ni vide, ni "null"/"undefined")', () => {
    const result = resolveAvatarDisplay('pas-une-url-valide', 'wolf_grey');
    expect(result.kind).toBe('wolf');
  });

  it("retombe sur avatarPreset quand avatarUrl est absent", () => {
    const result = resolveAvatarDisplay(null, 'wolf_grey');
    expect(result.kind).toBe('wolf');
  });

  it("utilise l'initiale uniquement sans avatarUrl et sans avatarPreset", () => {
    const result = resolveAvatarDisplay(null, null);
    expect(result.kind).toBe('initial');
  });

  it("utilise l'initiale si avatarPreset ne correspond à aucun avatar loup connu", () => {
    // @ts-expect-error valeur volontairement invalide (défense en profondeur)
    const result = resolveAvatarDisplay(null, 'not_a_real_wolf');
    expect(result.kind).toBe('initial');
  });
});
