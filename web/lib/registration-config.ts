/**
 * White Alpha reste une messagerie strictement privée (voir PLAN.md, Phase
 * 8) : l'inscription publique en libre-service est désactivée par défaut —
 * les comptes sont créés par un administrateur (Supabase Studio/CLI),
 * jamais via `/inscription`. Bascule unique : changer cette seule valeur
 * réactive le flux existant sans toucher au reste de `registerAction` ni à
 * ses tests (voir `actions.test.ts`, describe « inscription désactivée »
 * pour le comportement courant).
 */
export const PUBLIC_REGISTRATION_ENABLED = false;
