import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Garde-fou de non-régression (Phase 6) : la clé service_role et tout secret
 * partagé de l'Edge Function notify-new-message ne doivent jamais apparaître
 * dans le code de l'application mobile (src/). Ces valeurs n'existent
 * légitimement que côté serveur (Edge Function, variables d'environnement
 * Supabase) — jamais dans un bundle JS distribué sur un appareil.
 */

const SRC_ROOT = join(__dirname, '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_SUFFIXES = ['.test.ts', '.test.tsx'];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      if (!EXCLUDED_SUFFIXES.some((suffix) => entry.endsWith(suffix))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

const sourceFiles = collectSourceFiles(SRC_ROOT);

const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'service_role', pattern: /service_role/i },
  { name: 'clé secrète Expo Access Token', pattern: /expo_access_token/i },
  { name: 'secret partagé notify-new-message', pattern: /notify_new_message_shared_secret/i },
];

describe('Audit statique des secrets serveur dans le code client (Phase 6)', () => {
  it('au moins un fichier source est bien scanné (le test ne passe pas silencieusement sur un répertoire vide)', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    it(`aucun fichier source client ne contient "${name}"`, () => {
      const offenders = sourceFiles.filter((file) => pattern.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }

  it('le module client push-notifications ne contient jamais le contenu réel des notifications (titre/texte fixés côté Edge Function uniquement)', () => {
    const clientModule = readFileSync(join(SRC_ROOT, 'lib', 'push-notifications.ts'), 'utf8');
    expect(clientModule).not.toMatch(/Nouveau message/);
  });
});
