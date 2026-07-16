import appJson from '../../app.json';

// Vérification statique de app.json (Phase 5.S1, section 7) : garde-fou de
// non-régression, indépendant de toute inspection manuelle du manifeste
// généré (faite séparément lors des validations de build).
describe('app.json — configuration Android', () => {
  it('android.allowBackup est explicitement désactivé', () => {
    expect(appJson.expo.android.allowBackup).toBe(false);
  });

  it('le plugin expo-secure-store est enregistré', () => {
    expect(appJson.expo.plugins).toContain('expo-secure-store');
  });

  it('le package reste inchangé', () => {
    expect(appJson.expo.android.package).toBe('com.kenjiro.whitealpha');
  });

  it('le versionCode reflète le build en attente de validation Android (Phase 5.S2)', () => {
    expect(appJson.expo.android.versionCode).toBe(12);
  });

  it('bloque les permissions non nécessaires introduites par expo-screen-capture (détection uniquement, non utilisée)', () => {
    expect(appJson.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.READ_MEDIA_IMAGES', 'android.permission.DETECT_SCREEN_CAPTURE']),
    );
  });
});
