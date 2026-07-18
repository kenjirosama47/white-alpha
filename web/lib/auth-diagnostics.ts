/**
 * Diagnostic serveur temporaire (Phase 8.3, tests réels d'inscription) — à
 * retirer une fois les tests réels d'authentification terminés et validés.
 *
 * Journalise uniquement une catégorie, une étape et un statut non sensible
 * (ex. code HTTP Supabase) — jamais l'email, le mot de passe, le nom
 * d'utilisateur saisis, ni un jeton, ni un identifiant utilisateur. Écrit
 * uniquement dans les logs serveur (`console.error`, jamais transmis au
 * navigateur) : ne modifie jamais le message générique retourné au client,
 * ne casse jamais l'anti-énumération déjà en place dans `registerAction`.
 */
export function logAuthDiagnostic(category: string, step: string, status?: string | number): void {
  const statusPart = status === undefined ? '' : ` status=${status}`;
  console.error(`[auth-diagnostic] category=${category} step=${step}${statusPart}`);
}
