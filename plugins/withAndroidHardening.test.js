const {
  setGlideLoggingDisabled,
  GLIDE_LOGS_PROPERTY_KEY,
  GLIDE_LOGS_PROPERTY_VALUE,
  setBuildMemoryIncreased,
  JVM_ARGS_PROPERTY_KEY,
  JVM_ARGS_PROPERTY_VALUE,
  NETWORK_SECURITY_CONFIG_XML,
  FLAG_SECURE_MARKER,
  FLAG_SECURE_BLOCK,
  setReleaseSigningConfig,
  RELEASE_SIGNING_MARKER,
  RELEASE_KEYSTORE_RELATIVE_PATH,
  RELEASE_STORE_PASSWORD_ENV,
  RELEASE_KEY_ALIAS_ENV,
  RELEASE_KEY_PASSWORD_ENV,
  DEBUG_SIGNING_CONFIG_BLOCK,
  RELEASE_BUILD_TYPE_SIGNING_ANCHOR,
} = require('./withAndroidHardening');
const appJson = require('../app.json');

// Phase 10.5a : correctif de la fuite de chemins privés/identifiants de
// fichiers dans logcat (Glide, via expo-image), diagnostiquée en debug ET
// en release. Ces tests verrouillent la mutation `gradle.properties`
// (`EXPO_ALLOW_GLIDE_LOGS=false`) sans avoir à exécuter un prebuild complet.
describe('withAndroidHardening — EXPO_ALLOW_GLIDE_LOGS (Phase 10.5a)', () => {
  it('ajoute la propriété EXPO_ALLOW_GLIDE_LOGS=false quand elle est absente', () => {
    const result = setGlideLoggingDisabled([]);

    expect(result).toEqual([{ type: 'property', key: GLIDE_LOGS_PROPERTY_KEY, value: 'false' }]);
  });

  it("ne l'ajoute qu'une seule fois même après plusieurs appels", () => {
    let properties = [];
    properties = setGlideLoggingDisabled(properties);
    properties = setGlideLoggingDisabled(properties);
    properties = setGlideLoggingDisabled(properties);

    const matches = properties.filter((item) => item.type === 'property' && item.key === GLIDE_LOGS_PROPERTY_KEY);
    expect(matches).toHaveLength(1);
  });

  it('remplace une valeur précédente "true" par "false"', () => {
    const properties = [{ type: 'property', key: GLIDE_LOGS_PROPERTY_KEY, value: 'true' }];

    const result = setGlideLoggingDisabled(properties);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('false');
  });

  it('laisse les autres propriétés Gradle inchangées', () => {
    const properties = [
      { type: 'comment', value: '# Project-wide Gradle settings.' },
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: 'newArchEnabled', value: 'true' },
      { type: 'empty' },
    ];

    const result = setGlideLoggingDisabled(properties);

    expect(result).toEqual([
      { type: 'comment', value: '# Project-wide Gradle settings.' },
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: 'newArchEnabled', value: 'true' },
      { type: 'empty' },
      { type: 'property', key: GLIDE_LOGS_PROPERTY_KEY, value: 'false' },
    ]);
  });

  it('reste idempotent : deux appels successifs produisent le même résultat final', () => {
    const once = setGlideLoggingDisabled([{ type: 'property', key: 'hermesEnabled', value: 'true' }]);
    const twice = setGlideLoggingDisabled([...once]);

    expect(twice).toEqual(once);
  });

  it('la valeur exportée pour les tests correspond à la valeur réellement appliquée', () => {
    expect(GLIDE_LOGS_PROPERTY_VALUE).toBe('false');
  });
});

// Phase 10.5a : org.gradle.jvmargs augmenté, nécessaire uniquement pour que
// la compilation source d'expo-image (buildFromSource) ne tombe pas en
// OutOfMemoryError: Metaspace pendant la tâche KSP.
describe('withAndroidHardening — org.gradle.jvmargs (Phase 10.5a)', () => {
  it('remplace la valeur par défaut par la valeur augmentée', () => {
    const properties = [{ type: 'property', key: JVM_ARGS_PROPERTY_KEY, value: '-Xmx2048m -XX:MaxMetaspaceSize=512m' }];

    const result = setBuildMemoryIncreased(properties);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(JVM_ARGS_PROPERTY_VALUE);
  });

  it('la valeur contient bien Xmx4096m, MaxMetaspaceSize=1024m et UTF-8', () => {
    expect(JVM_ARGS_PROPERTY_VALUE).toContain('-Xmx4096m');
    expect(JVM_ARGS_PROPERTY_VALUE).toContain('-XX:MaxMetaspaceSize=1024m');
    expect(JVM_ARGS_PROPERTY_VALUE).toContain('-Dfile.encoding=UTF-8');
  });

  it("ne l'ajoute qu'une seule fois même après plusieurs appels", () => {
    let properties = [];
    properties = setBuildMemoryIncreased(properties);
    properties = setBuildMemoryIncreased(properties);

    const matches = properties.filter((item) => item.type === 'property' && item.key === JVM_ARGS_PROPERTY_KEY);
    expect(matches).toHaveLength(1);
  });
});

// Correctif signature officielle : le template Expo par défaut signe
// buildTypes.release avec signingConfigs.debug (constaté par audit
// apksigner : certificat "CN=Android Debug" sur l'APK release). Ces tests
// verrouillent la mutation texte de build.gradle sans exécuter de prebuild.
describe('withAndroidHardening — signingConfigs.release officiel', () => {
  const FAKE_BUILD_GRADLE = `
    defaultConfig {
        applicationId 'com.kenjiro.whitealpha'
    }
${DEBUG_SIGNING_CONFIG_BLOCK}
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
${RELEASE_BUILD_TYPE_SIGNING_ANCHOR}
            shrinkResources true
            minifyEnabled true
        }
    }
`;

  it('ajoute un bloc signingConfigs.release pointant vers le keystore officiel', () => {
    const result = setReleaseSigningConfig(FAKE_BUILD_GRADLE);

    expect(result).toContain(`storeFile rootProject.file('${RELEASE_KEYSTORE_RELATIVE_PATH}')`);
    expect(result).toContain(`System.getenv('${RELEASE_STORE_PASSWORD_ENV}')`);
    expect(result).toContain(`System.getenv('${RELEASE_KEY_ALIAS_ENV}')`);
    expect(result).toContain(`System.getenv('${RELEASE_KEY_PASSWORD_ENV}')`);
  });

  it('ne contient jamais de mot de passe en clair, uniquement des lectures System.getenv', () => {
    const result = setReleaseSigningConfig(FAKE_BUILD_GRADLE);
    const releaseBlock = result.slice(result.indexOf('release {', result.indexOf('signingConfigs')));

    expect(releaseBlock).not.toMatch(/storePassword\s+'[^']*'/);
    expect(releaseBlock).not.toMatch(/keyPassword\s+'[^']*'/);
  });

  it('fait pointer buildTypes.release sur signingConfigs.release, jamais signingConfigs.debug', () => {
    const result = setReleaseSigningConfig(FAKE_BUILD_GRADLE);
    const releaseBuildType = result.slice(result.lastIndexOf('release {'));

    expect(releaseBuildType).toContain('signingConfig signingConfigs.release');
    expect(releaseBuildType).not.toContain('signingConfig signingConfigs.debug');
  });

  it('laisse buildTypes.debug inchangé (toujours signingConfigs.debug)', () => {
    const result = setReleaseSigningConfig(FAKE_BUILD_GRADLE);

    expect(result).toMatch(/debug \{\s*signingConfig signingConfigs\.debug\s*\}/);
  });

  it('est idempotent : un second appel ne duplique pas le bloc release', () => {
    const once = setReleaseSigningConfig(FAKE_BUILD_GRADLE);
    const twice = setReleaseSigningConfig(once);

    expect(twice).toBe(once);
    expect(twice.match(/release \{/g)).toHaveLength(2); // signingConfigs.release + buildTypes.release
  });

  it('échoue bruyamment si le template Expo attendu a changé (pas de bloc debug reconnu)', () => {
    expect(() => setReleaseSigningConfig('signingConfigs { }')).toThrow(/signingConfigs par défaut introuvable/);
  });

  it('le marqueur identifie bien le correctif de signature officielle', () => {
    expect(RELEASE_SIGNING_MARKER).toContain('RELEASE_SIGNING');
  });
});

// Non-régression sur le durcissement existant (Phase 5.S5), pour s'assurer
// que l'ajout du volet Glide (Phase 10.5a) n'a pas altéré les volets
// précédents du même plugin.
describe('withAndroidHardening — non-régression du durcissement existant (Phase 5.S5)', () => {
  it('Network Security Config : cleartext toujours bloqué, certificats système uniquement', () => {
    expect(NETWORK_SECURITY_CONFIG_XML).toContain('cleartextTrafficPermitted="false"');
    expect(NETWORK_SECURITY_CONFIG_XML).toContain('<certificates src="system"/>');
  });

  it('MainApplication.kt : le bloc FLAG_SECURE est toujours généré avec son marqueur', () => {
    expect(FLAG_SECURE_MARKER).toBe('// WHITEALPHA_FLAG_SECURE_LIFECYCLE (Phase 5.S5)');
    expect(FLAG_SECURE_BLOCK).toContain('WindowManager.LayoutParams.FLAG_SECURE');
    expect(FLAG_SECURE_BLOCK).toContain(FLAG_SECURE_MARKER);
  });

  it('app.json : allowBackup reste explicitement désactivé (déjà verrouillé par ailleurs, revérifié ici dans le contexte du correctif Glide)', () => {
    expect(appJson.expo.android.allowBackup).toBe(false);
  });

  // R8/minification (minifyEnabled) est un défaut du plugin Gradle React
  // Native, pas une propriété gradle.properties de ce projet : aucune
  // assertion unitaire pertinente ici. Non-régression vérifiée par un
  // build release réel (BUILD SUCCESSFUL, proguard actif, APK signé et
  // fonctionnel) plutôt que par un test unitaire qui ne ferait que
  // dupliquer la configuration sans l'exécuter.
});
