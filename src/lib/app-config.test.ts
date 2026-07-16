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

  it('le package et le versionCode restent inchangés par cette sous-phase', () => {
    expect(appJson.expo.android.package).toBe('com.kenjiro.whitealpha');
    expect(appJson.expo.android.versionCode).toBe(10);
  });
});
