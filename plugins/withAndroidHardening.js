const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  withGradleProperties,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Durcissement Android natif (Phase 5.S5), reproductible à chaque
 * `expo prebuild --clean` — remplace les correctifs testés à la main dans
 * un worktree temporaire (Phase 5.S5, section 1). Quatre volets :
 *
 * 1. Network Security Config : aucun trafic cleartext, certificats système
 *    uniquement (aucun certificat utilisateur en Release).
 * 2. Manifeste : retrait de SYSTEM_ALERT_WINDOW (permission optionnelle du
 *    template Expo, jamais utilisée par l'application) et désactivation du
 *    Picture-in-Picture codé en dur par expo-video sur
 *    FullscreenPlayerActivity (indépendant de l'option de plugin
 *    `supportsPictureInPicture: false` déjà présente dans app.json, qui ne
 *    s'applique qu'à MainActivity — jamais utilisée pour la vidéo).
 * 3. MainApplication.kt : FLAG_SECURE appliqué par défaut à CHAQUE Activity
 *    créée dans le process, pas seulement MainActivity. expo-screen-capture
 *    (Phase 5.S2) ne pose ce flag que sur `currentActivity.window`, ce qui
 *    ne couvre pas les Activity natives distinctes lancées par des modules
 *    tiers (ex. FullscreenPlayerActivity, lecture vidéo plein écran) :
 *    chaque Activity possède sa propre Window, FLAG_SECURE ne se propage
 *    jamais automatiquement entre Activity. L'écran public (auth) continue
 *    d'être explicitement désécurisé par le code JS existant sur
 *    MainActivity une fois l'absence de session confirmée — ce
 *    comportement n'est pas modifié ici.
 * 4. gradle.properties : `EXPO_ALLOW_GLIDE_LOGS=false` (Phase 10.5a, suite
 *    au diagnostic de fuite de chemins privés/identifiants de fichiers dans
 *    logcat via le logging DEBUG interne de Glide, activé par
 *    `expo-image`/`ExpoImageAppGlideModule.kt` quand cette propriété vaut
 *    `true`). Constaté présent en debug ET en release sur ce projet ;
 *    forcé à `false` ici pour rester reproductible à chaque prebuild, sans
 *    dépendre d'un éventuel défaut externe.
 * 5. gradle.properties : `org.gradle.jvmargs` augmenté (Phase 10.5a) —
 *    nécessaire uniquement parce que `expo-image` est compilé depuis les
 *    sources (`package.json` → `expo.autolinking.android.buildFromSource`,
 *    seul moyen de rendre le volet 4 réellement effectif : l'AAR précompilé
 *    par défaut a `ALLOW_GLIDE_LOGS=true` figé, insensible à nos propriétés
 *    Gradle locales). La tâche KSP ajoutée par cette compilation source a
 *    échoué une première fois avec `OutOfMemoryError: Metaspace` sur la
 *    configuration par défaut (`-Xmx2048m -XX:MaxMetaspaceSize=512m`).
 *    Valeur de départ volontairement modeste (`-Xmx4096m
 *    -XX:MaxMetaspaceSize=1024m`), à ajuster seulement si nécessaire.
 *    Purement lié aux ressources de build local, sans rapport avec la
 *    sécurité runtime de l'app — regroupé ici pour rester dans l'unique
 *    mécanisme `withGradleProperties` déjà en place plutôt que d'ajouter un
 *    second plugin.
 */

const NETWORK_SECURITY_CONFIG_FILENAME = 'network_security_config.xml';
const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
`;

const SYSTEM_ALERT_WINDOW_PERMISSION = 'android.permission.SYSTEM_ALERT_WINDOW';
const FULLSCREEN_PLAYER_ACTIVITY = 'expo.modules.video.FullscreenPlayerActivity';

const FLAG_SECURE_MARKER = '// WHITEALPHA_FLAG_SECURE_LIFECYCLE (Phase 5.S5)';
const FLAG_SECURE_IMPORT_LINES = ['import android.app.Activity', 'import android.os.Bundle', 'import android.view.WindowManager'];
const FLAG_SECURE_APPLICATION_IMPORT_ANCHOR = 'import android.app.Application';
const FLAG_SECURE_ONCREATE_ANCHOR = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';

const FLAG_SECURE_BLOCK = `
    ${FLAG_SECURE_MARKER}
    // FLAG_SECURE par défaut sur toute Activity créée dans le process (voir
    // commentaire en tête de plugins/withAndroidHardening.js).
    registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityResumed(activity: Activity) {}
      override fun onActivityPaused(activity: Activity) {}
      override fun onActivityStopped(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    })`;

function withNetworkSecurityConfigFile(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, NETWORK_SECURITY_CONFIG_FILENAME), NETWORK_SECURITY_CONFIG_XML);
      return config;
    },
  ]);
}

function withManifestHardening(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    // Explicite en plus de la Network Security Config ci-dessus (qui bloque
    // déjà le cleartext via cleartextTrafficPermitted="false") : les deux
    // mécanismes sont redondants par conception, jamais contradictoires.
    mainApplication.$['android:usesCleartextTraffic'] = 'false';

    if (Array.isArray(androidManifest.manifest['uses-permission'])) {
      androidManifest.manifest['uses-permission'] = androidManifest.manifest['uses-permission'].filter(
        (entry) => entry.$['android:name'] !== SYSTEM_ALERT_WINDOW_PERMISSION,
      );
    }

    if (!Array.isArray(mainApplication.activity)) {
      mainApplication.activity = [];
    }
    const alreadyDeclared = mainApplication.activity.some((activity) => activity.$['android:name'] === FULLSCREEN_PLAYER_ACTIVITY);
    if (!alreadyDeclared) {
      mainApplication.activity.push({
        $: {
          'android:name': FULLSCREEN_PLAYER_ACTIVITY,
          'android:supportsPictureInPicture': 'false',
          'tools:replace': 'android:supportsPictureInPicture',
        },
      });
    }

    return config;
  });
}

const GLIDE_LOGS_PROPERTY_KEY = 'EXPO_ALLOW_GLIDE_LOGS';
const GLIDE_LOGS_PROPERTY_VALUE = 'false';

/**
 * Mutation pure (testable sans exécuter de prebuild) : ajoute ou remplace
 * la propriété `EXPO_ALLOW_GLIDE_LOGS` dans la liste `gradleProperties`
 * fournie par `withGradleProperties`. Idempotent — un appel répété sur le
 * même tableau ne crée jamais de doublon et ne modifie aucune autre entrée.
 */
function setGlideLoggingDisabled(gradleProperties) {
  const existingIndex = gradleProperties.findIndex(
    (item) => item.type === 'property' && item.key === GLIDE_LOGS_PROPERTY_KEY,
  );

  if (existingIndex >= 0) {
    gradleProperties[existingIndex] = {
      ...gradleProperties[existingIndex],
      value: GLIDE_LOGS_PROPERTY_VALUE,
    };
  } else {
    gradleProperties.push({
      type: 'property',
      key: GLIDE_LOGS_PROPERTY_KEY,
      value: GLIDE_LOGS_PROPERTY_VALUE,
    });
  }

  return gradleProperties;
}

function withGlideLoggingDisabled(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = setGlideLoggingDisabled(config.modResults);
    return config;
  });
}

const JVM_ARGS_PROPERTY_KEY = 'org.gradle.jvmargs';
const JVM_ARGS_PROPERTY_VALUE = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8';

/**
 * Mutation pure (testable sans exécuter de prebuild) : ajoute ou remplace
 * `org.gradle.jvmargs`. Même logique d'idempotence que
 * `setGlideLoggingDisabled` ci-dessus.
 */
function setBuildMemoryIncreased(gradleProperties) {
  const existingIndex = gradleProperties.findIndex(
    (item) => item.type === 'property' && item.key === JVM_ARGS_PROPERTY_KEY,
  );

  if (existingIndex >= 0) {
    gradleProperties[existingIndex] = {
      ...gradleProperties[existingIndex],
      value: JVM_ARGS_PROPERTY_VALUE,
    };
  } else {
    gradleProperties.push({
      type: 'property',
      key: JVM_ARGS_PROPERTY_KEY,
      value: JVM_ARGS_PROPERTY_VALUE,
    });
  }

  return gradleProperties;
}

function withIncreasedBuildMemory(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = setBuildMemoryIncreased(config.modResults);
    return config;
  });
}

function withMainApplicationFlagSecure(config) {
  return withMainApplication(config, (config) => {
    let { contents } = config.modResults;

    if (!contents.includes(FLAG_SECURE_MARKER)) {
      for (const importLine of FLAG_SECURE_IMPORT_LINES) {
        if (!contents.includes(importLine)) {
          contents = contents.replace(FLAG_SECURE_APPLICATION_IMPORT_ANCHOR, `${FLAG_SECURE_APPLICATION_IMPORT_ANCHOR}\n${importLine}`);
        }
      }

      if (!contents.includes(FLAG_SECURE_ONCREATE_ANCHOR)) {
        throw new Error(
          "withAndroidHardening: ancrage 'ApplicationLifecycleDispatcher.onApplicationCreate(this)' introuvable dans MainApplication.kt généré — le template Expo a changé, mettre à jour plugins/withAndroidHardening.js.",
        );
      }
      contents = contents.replace(FLAG_SECURE_ONCREATE_ANCHOR, `${FLAG_SECURE_ONCREATE_ANCHOR}\n${FLAG_SECURE_BLOCK}`);
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withAndroidHardening(config) {
  config = withNetworkSecurityConfigFile(config);
  config = withManifestHardening(config);
  config = withMainApplicationFlagSecure(config);
  config = withGlideLoggingDisabled(config);
  config = withIncreasedBuildMemory(config);
  return config;
}

module.exports = withAndroidHardening;
// Exports supplémentaires réservés aux tests (withAndroidHardening.test.js) :
// logique pure et constantes du durcissement existant, pour verrouiller la
// non-régression sans avoir à exécuter un prebuild complet.
module.exports.setGlideLoggingDisabled = setGlideLoggingDisabled;
module.exports.GLIDE_LOGS_PROPERTY_KEY = GLIDE_LOGS_PROPERTY_KEY;
module.exports.GLIDE_LOGS_PROPERTY_VALUE = GLIDE_LOGS_PROPERTY_VALUE;
module.exports.setBuildMemoryIncreased = setBuildMemoryIncreased;
module.exports.JVM_ARGS_PROPERTY_KEY = JVM_ARGS_PROPERTY_KEY;
module.exports.JVM_ARGS_PROPERTY_VALUE = JVM_ARGS_PROPERTY_VALUE;
module.exports.NETWORK_SECURITY_CONFIG_XML = NETWORK_SECURITY_CONFIG_XML;
module.exports.FLAG_SECURE_MARKER = FLAG_SECURE_MARKER;
module.exports.FLAG_SECURE_BLOCK = FLAG_SECURE_BLOCK;
