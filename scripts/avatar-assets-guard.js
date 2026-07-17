// Garde Phase 7.5 : empêche un build Release tant que les 9 avatars loups
// définitifs ne sont pas tous ajoutés à WOLF_AVATAR_SOURCES
// (src/constants/avatars.ts). Analyse textuelle volontaire (regex, pas
// d'import TypeScript) pour rester exécutable via `node` seul, sans
// dépendance de transpilation, y compris dans un contexte de pré-build
// minimal.
//
// Usage : node scripts/avatar-assets-guard.js
// Sortie : code 0 si les 9 avatars sont présents, code 1 sinon (liste les
// identifiants manquants). À exécuter et faire passer avant toute création
// d'APK Release (voir assets/images/avatars/README.md).

const fs = require('node:fs');
const path = require('node:path');

const AVATARS_FILE = path.resolve(__dirname, '../src/constants/avatars.ts');

/**
 * Extrait la liste des identifiants officiels depuis WOLF_AVATAR_CATALOG et
 * détermine, pour chacun, si une entrée ACTIVE (non commentée) existe dans
 * WOLF_AVATAR_SOURCES. Une ligne commentée (`// wolf_x: require(...)`) ne
 * compte jamais comme présente : c'est exactement l'état actuel (Phase 7.5,
 * assets définitifs non fournis).
 */
function findMissingAvatarPresets(fileContent) {
  const catalogIds = [...fileContent.matchAll(/{\s*id:\s*'([a-z_]+)'/g)].map((match) => match[1]);
  if (catalogIds.length === 0) {
    throw new Error('Aucun identifiant trouvé dans WOLF_AVATAR_CATALOG — fichier avatars.ts inattendu.');
  }

  const sourcesBlockMatch = fileContent.match(
    /const WOLF_AVATAR_SOURCES[^{]*{([\s\S]*?)\n};/,
  );
  const sourcesBlock = sourcesBlockMatch ? sourcesBlockMatch[1] : '';

  return catalogIds.filter((id) => {
    // Une ligne active pour cet id : "id: require(...)" en tout début de
    // ligne (après espaces), jamais précédée de "//" sur cette même ligne.
    const activeLinePattern = new RegExp(`^\\s*${id}:\\s*require\\(`, 'm');
    return !activeLinePattern.test(sourcesBlock);
  });
}

function main() {
  const fileContent = fs.readFileSync(AVATARS_FILE, 'utf8');
  const missing = findMissingAvatarPresets(fileContent);

  if (missing.length > 0) {
    console.error('Avatars loups définitifs manquants (build Release bloqué) :');
    for (const id of missing) {
      console.error(`  - ${id}`);
    }
    console.error(
      '\nAjoute les images définitives dans assets/images/avatars/ puis décommente les entrées ' +
        'correspondantes dans WOLF_AVATAR_SOURCES (src/constants/avatars.ts) avant de créer un APK Release.',
    );
    process.exit(1);
  }

  console.log('Les 9 avatars loups définitifs sont tous présents dans WOLF_AVATAR_SOURCES.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { findMissingAvatarPresets };
