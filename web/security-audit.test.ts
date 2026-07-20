import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Audit statique du code source web/ (Phase 8.2) — garde-fous de
 * non-régression, indépendants de toute relecture manuelle. Ne scanne que le
 * code que nous écrivons (jamais node_modules/.next/coverage).
 */
const ROOT = __dirname;
const IGNORED_DIRS = new Set(['node_modules', '.next', 'coverage', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry)) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceFiles = collectSourceFiles(ROOT);

describe('"use server" — uniquement des fonctions asynchrones exportées (corrigé après revue)', () => {
  // Next.js/React Server Actions imposent qu'un fichier "use server" ne
  // puisse exporter QUE des fonctions asynchrones (types compris, effacés à
  // la compilation) — exporter une valeur (ex. `export const initialState =
  // {...}` ou `export { initialState }`) fait échouer l'évaluation du module
  // entier au runtime (jamais détecté par `tsc` ni par un test Jest classique
  // qui mocke le module, comme observé lors du test réel d'inscription : la
  // page rendait « Une erreur est survenue » avec 2 issues dans l'overlay
  // Next.js). Voir https://nextjs.org/docs/messages/invalid-use-server-value
  const useServerFiles = sourceFiles.filter((file) => readFileSync(file, 'utf8').trimStart().startsWith("'use server'"));

  it('au moins un fichier "use server" existe (le garde-fou ci-dessous ne serait pas testé sinon)', () => {
    expect(useServerFiles.length).toBeGreaterThan(0);
  });

  it('aucun fichier "use server" n\'exporte une constante ou un export groupé (uniquement `export type` et `export async function`)', () => {
    const offenders = useServerFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /export const \w+/.test(content) || /export \{/.test(content);
    });

    expect(offenders).toEqual([]);
  });
});

describe('web/ — audit statique de sécurité (Phase 8.2)', () => {
  it('aucun fichier source ne référence localStorage pour la session (cookies HttpOnly uniquement)', () => {
    const offenders = sourceFiles.filter((file) => readFileSync(file, 'utf8').includes('localStorage'));

    expect(offenders).toEqual([]);
  });

  it('aucune clé sb_secret_ ni service_role littérale dans le code source', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /sb_secret_[A-Za-z0-9]/.test(content) || /service_role['"]/.test(content);
    });

    expect(offenders).toEqual([]);
  });

  it('createServerClient (session) impose httpOnly: true — jamais le défaut @supabase/ssr (false)', () => {
    const configContent = readFileSync(path.join(ROOT, 'lib', 'supabase', 'config.ts'), 'utf8');

    expect(configContent).toMatch(/httpOnly:\s*true/);
  });

  it("aucun fichier ne construit d'URL de conversation avec des données privées en paramètre (préparation, avant l'écran conversations)", () => {
    const offenders = sourceFiles.filter((file) => /[?&](email|token|password)=/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it("registerAction ne branche jamais sur le détail de l'erreur signUp (anti-énumération, corrigé après revue)", () => {
    const content = readFileSync(path.join(ROOT, 'app', 'inscription', 'actions.ts'), 'utf8');

    expect(content).not.toMatch(/error\.message/);
    expect(content).not.toContain('User already registered');
  });

  it('aucun code MFA, mot de passe ou jeton de confirmation journalisé via console.* (Phase 8.3)', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /console\.\w+\([^)]*\b(code|password|token|tokenHash|token_hash)\b/i.test(content);
    });

    expect(offenders).toEqual([]);
  });
});

describe('web/ — audit statique de sécurité (Phase 8.4, réinitialisation mot de passe)', () => {
  it('app/membre/page.tsx n’affiche jamais user.email (pseudonyme public uniquement, anomalie corrigée)', () => {
    const content = readFileSync(path.join(ROOT, 'app', 'membre', 'page.tsx'), 'utf8');

    expect(content).not.toMatch(/user\.email/);
  });

  it('app/auth/callback/route.ts ne construit jamais une redirection interpolant error/error_code/error_description (uniquement des cibles fixes)', () => {
    const content = readFileSync(path.join(ROOT, 'app', 'auth', 'callback', 'route.ts'), 'utf8');

    expect(content).not.toMatch(/error_description/);
    expect(content).not.toMatch(/\$\{errorParam\}/);
  });

  it('app/reset-password/page.tsx revérifie une session valide et redirige vers /forgot-password (jamais /membre) si absente', () => {
    const content = readFileSync(path.join(ROOT, 'app', 'reset-password', 'page.tsx'), 'utf8');

    expect(content).toMatch(/if\s*\(\s*!user\s*\)/);
    expect(content).toMatch(/redirect\(['"]\/forgot-password\?reason=link_expired['"]\)/);
    expect(content).not.toMatch(/redirect\(['"]\/membre['"]\)/);
  });

  it('app/reset-password/actions.ts ne journalise jamais le mot de passe saisi', () => {
    const content = readFileSync(path.join(ROOT, 'app', 'reset-password', 'actions.ts'), 'utf8');

    expect(content).not.toMatch(/console\.\w+\([^)]*\bpassword\b/i);
  });
});

describe('web/ — audit statique de sécurité (Phase 8.4, conversations)', () => {
  it("aucun dangerouslySetInnerHTML nulle part dans web/ (aucune injection HTML de message)", () => {
    const offenders = sourceFiles.filter((file) => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'));

    expect(offenders).toEqual([]);
  });

  it('aucun contenu de message journalisé via console.* (variable `content` ou `message.content`)', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /console\.\w+\([^)]*\b(content|message\.content|normalized)\b/i.test(content);
    });

    expect(offenders).toEqual([]);
  });

  it('aucune utilisation d’IndexedDB (aucun stockage persistant de message sans décision explicite)', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /\bindexedDB\b/.test(content) || /\bopenDatabase\b/.test(content);
    });

    expect(offenders).toEqual([]);
  });
});

describe('public/sw.js — audit statique du Service Worker (Phase 8.2)', () => {
  const swContent = readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');

  it('exclut explicitement les routes authentifiées du cache', () => {
    expect(swContent).toContain("'/membre'");
    expect(swContent).toContain("'/verification-mfa'");
    expect(swContent).toContain('NEVER_CACHE_PATH_PREFIXES');
  });

  it('exclut explicitement /conversations du cache (Phase 8.4 — messages privés)', () => {
    expect(swContent).toContain("'/conversations'");
  });

  it('exclut explicitement les URLs signées (paramètres token/Signature) du cache', () => {
    expect(swContent).toMatch(/token|Signature/);
  });

  it("n'intercepte jamais une requête vers une autre origine (ex. Supabase)", () => {
    expect(swContent).toContain('url.origin !== self.location.origin');
  });

  it('nettoie les anciens caches à chaque nouvelle version (activate)', () => {
    expect(swContent).toContain('caches.delete');
  });
});
