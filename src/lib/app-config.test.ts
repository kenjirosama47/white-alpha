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

  it('bloque READ_MEDIA_IMAGES (permission de détection introduite par expo-screen-capture, non utilisée)', () => {
    expect(appJson.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.READ_MEDIA_IMAGES']),
    );
  });

  // DETECT_SCREEN_CAPTURE ne doit PAS être bloquée : ScreenCaptureModule.kt
  // (expo-screen-capture) l'exige dès son OnCreate (Activity.registerScreenCaptureCallback,
  // API 34+) pour son initialisation native, indépendamment de tout appel JS
  // à une API de détection (aucune n'est utilisée dans ce projet). La
  // bloquer provoque un crash immédiat au démarrage sur Android 14+
  // (constaté par test manuel réel sur émulateur API 36, Phase 5.S2).
  it("ne bloque pas DETECT_SCREEN_CAPTURE (nécessaire à l'initialisation native d'expo-screen-capture, sinon crash au démarrage sur API 34+)", () => {
    expect(appJson.expo.android.blockedPermissions).not.toContain('android.permission.DETECT_SCREEN_CAPTURE');
  });
});
