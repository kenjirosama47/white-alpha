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

  it('le versionCode reflète le build en attente de validation Android (correctifs trombone/avatar/icône-splash, build 21)', () => {
    expect(appJson.expo.android.versionCode).toBe(21);
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

// Phase 5.S5 : durcissement Android, garde-fou de non-régression sur les
// options de plugin qui contrôlent la surface de permissions native.
describe('app.json — surface de permissions (Phase 5.S5)', () => {
  function findPlugin(name: string): [string, Record<string, unknown>] | undefined {
    return (appJson.expo.plugins as unknown[]).find(
      (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === name,
    );
  }

  it('expo-image-picker désactive explicitement cameraPermission et microphonePermission', () => {
    const plugin = findPlugin('expo-image-picker');
    expect(plugin).toBeDefined();
    expect(plugin?.[1].cameraPermission).toBe(false);
    expect(plugin?.[1].microphonePermission).toBe(false);
  });

  it('expo-video désactive explicitement supportsBackgroundPlayback et supportsPictureInPicture', () => {
    const plugin = findPlugin('expo-video');
    expect(plugin).toBeDefined();
    expect(plugin?.[1].supportsBackgroundPlayback).toBe(false);
    expect(plugin?.[1].supportsPictureInPicture).toBe(false);
  });

  it('le scheme de deep link reste "whitealpha" (utilisé par la vérification manifeste, Phase 5.S5)', () => {
    expect(appJson.expo.scheme).toBe('whitealpha');
  });

  // Phase 10.5a : expo-file-system est installé (stockage privé des photos
  // personnelles, voir lib/personal-photo-storage.ts) mais SON PLUGIN
  // n'est délibérément jamais enregistré ici — l'exécuter ajouterait
  // READ_EXTERNAL_STORAGE/WRITE_EXTERNAL_STORAGE/INTERNET au manifeste
  // Android, alors que l'app n'accède qu'à son propre répertoire privé
  // (`Paths.document`), qui ne nécessite aucune permission. Un plugin non
  // listé dans `plugins` ne s'exécute jamais au prebuild : ce test verrouille
  // cette décision contre un ajout accidentel futur.
  it("n'enregistre pas le plugin expo-file-system (stockage privé uniquement, aucune permission de stockage externe nécessaire)", () => {
    expect(findPlugin('expo-file-system')).toBeUndefined();
    expect(appJson.expo.plugins).not.toContain('expo-file-system');
  });
});
