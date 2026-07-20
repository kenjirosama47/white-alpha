import { getAvatarPublicUrl, isValidAvatarUrl, resolveAvatarDisplay, wolfAvatarSrc } from './avatars';

describe('isValidAvatarUrl (Phase 8.4)', () => {
  it('accepte une URL http(s) valide', () => {
    expect(isValidAvatarUrl('https://example.supabase.co/storage/v1/object/public/avatars/a.jpg')).toBe(true);
    expect(isValidAvatarUrl('http://example.com/a.jpg')).toBe(true);
  });

  it.each([null, undefined, '', '   ', 'null', 'undefined', 'NULL', 'not-a-url', 'ftp://example.com/a.jpg'])(
    'refuse %p',
    (value) => {
      expect(isValidAvatarUrl(value)).toBe(false);
    },
  );
});

describe('resolveAvatarDisplay (Phase 8.4, résolution centrale)', () => {
  it('avatar_url valide prioritaire, même avec un avatar_preset renseigné', () => {
    const result = resolveAvatarDisplay('https://example.com/photo.jpg', 'wolf_alpha');
    expect(result).toEqual({ kind: 'photo', uri: 'https://example.com/photo.jpg' });
  });

  it('avatar_preset utilisé si avatar_url absent/invalide', () => {
    const result = resolveAvatarDisplay(null, 'wolf_alpha');
    expect(result).toEqual({ kind: 'wolf', src: wolfAvatarSrc('wolf_alpha') });
  });

  it('avatar_preset invalide/inconnu : repli sur initiale, jamais une image cassée', () => {
    const result = resolveAvatarDisplay(null, 'wolf_inexistant');
    expect(result).toEqual({ kind: 'initial' });
  });

  it('initiale de secours si ni avatar_url ni avatar_preset valides', () => {
    expect(resolveAvatarDisplay(null, null)).toEqual({ kind: 'initial' });
    expect(resolveAvatarDisplay('not-a-url', undefined)).toEqual({ kind: 'initial' });
  });
});

describe('getAvatarPublicUrl (Phase 8.4)', () => {
  it('construit une URL publique stable sans appel réseau ni signature', () => {
    const url = getAvatarPublicUrl('https://example.supabase.co', 'user-id/photo.jpg');
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/avatars/user-id/photo.jpg');
  });
});
