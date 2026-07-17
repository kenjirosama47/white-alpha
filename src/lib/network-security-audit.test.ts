import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Garde-fou de non-régression (Phase 5.S5) : scanne le code source pour
 * tout pattern réseau interdit en Release. Complète — ne remplace pas —
 * l'inspection du bundle compilé et du manifeste fusionné (faite séparément
 * lors des validations de build), qui reste la seule vérification faisant
 * foi pour ce qui atteint réellement l'APK.
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

// Regex volontairement précise : "https://" ne doit jamais déclencher un
// faux positif sur "http://" (vérifié par le test dédié ci-dessous).
const CLEARTEXT_HTTP_PATTERN = /http:\/\//;
const WEBSOCKET_CLEARTEXT_PATTERN = /ws:\/\//;
const LOCALHOST_PATTERNS = [/localhost/, /127\.0\.0\.1/, /10\.0\.2\.2/];
const PRIVATE_IP_PATTERN = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/;

describe('Audit réseau statique du code source (Phase 5.S5)', () => {
  it('au moins un fichier source est bien scanné (le test ne passe pas silencieusement sur un répertoire vide)', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  it("aucun fichier source ne contient d'URL http:// en clair", () => {
    const offenders = sourceFiles.filter((file) => CLEARTEXT_HTTP_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('aucun fichier source ne contient de WebSocket non chiffré (ws://)', () => {
    const offenders = sourceFiles.filter((file) => WEBSOCKET_CLEARTEXT_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('aucun fichier source ne contient localhost/127.0.0.1/10.0.2.2 (adresses de développement)', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return LOCALHOST_PATTERNS.some((pattern) => pattern.test(content));
    });
    expect(offenders).toEqual([]);
  });

  it("aucun fichier source ne contient d'adresse IP privée codée en dur", () => {
    const offenders = sourceFiles.filter((file) => PRIVATE_IP_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('les endpoints Supabase réellement construits utilisent explicitement https:// (lib/supabase.ts, services/media.ts)', () => {
    const supabaseLib = readFileSync(join(SRC_ROOT, 'lib', 'supabase.ts'), 'utf8');
    const mediaService = readFileSync(join(SRC_ROOT, 'services', 'media.ts'), 'utf8');
    expect(supabaseLib).not.toContain('http://');
    expect(mediaService).toMatch(/https:\/\/\$\{projectRef\}\.storage\.supabase\.co/);
  });
});
