// Génère les icônes PWA White Alpha depuis public/icons/source-1024.png
// (copie de assets/images/icon.png du projet mobile, Phase 7). Nécessite
// `sharp` (devDependency). À relancer manuellement si le logo source change
// — jamais exécuté automatiquement au build.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const source = path.join(iconsDir, 'source-1024.png');

// Fond noir profond White Alpha (Colors.dark.background) : utilisé comme
// toile de fond pour l'icône maskable (jamais transparent — les OS qui
// masquent l'icône dans une forme non carrée peuvent laisser apparaître le
// fond de l'écran d'accueil dans les coins si l'arrière-plan est transparent).
const BACKGROUND = '#0D0F0C';

async function generateStandard(size, filename) {
  await sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(path.join(iconsDir, filename));
  console.log(`✓ ${filename} (${size}x${size})`);
}

/**
 * Icône "maskable" (spécification PWA) : le contenu visuel important doit
 * tenir dans la "zone de sécurité" centrale (un cercle inscrit à ~80% de la
 * taille totale), car l'OS peut recadrer l'icône dans n'importe quelle forme
 * (cercle, superellipse, etc.) et rogner tout ce qui dépasse cette zone.
 * Le logo source (gros plan serré sur le loup) remplit déjà tout le cadre :
 * on le réduit à 70% et on le centre sur un fond uni pour laisser une marge
 * de sécurité suffisante, plutôt que de risquer un recadrage disgracieux du
 * museau/des oreilles sur certains lanceurs Android.
 */
async function generateMaskable(size, filename) {
  const contentSize = Math.round(size * 0.7);
  const content = await sharp(source).resize(contentSize, contentSize, { fit: 'cover' }).png().toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: content, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, filename));
  console.log(`✓ ${filename} (${size}x${size}, maskable, zone de sécurité 70%)`);
}

async function main() {
  await generateStandard(192, 'icon-192.png');
  await generateStandard(512, 'icon-512.png');
  await generateStandard(180, 'apple-touch-icon.png');
  await generateStandard(32, 'favicon-32.png');
  await generateMaskable(512, 'icon-maskable-512.png');
  console.log('\nIcônes générées dans web/public/icons/.');
}

main().catch((error) => {
  console.error('Échec de la génération des icônes :', error);
  process.exit(1);
});
