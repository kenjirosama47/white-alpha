@AGENTS.md

## Architecture backend — Supabase & Railway
- Supabase est la seule plateforme backend active (auth, profils, PostgreSQL, RLS,
  temps réel, stockage futur) : ne pas la remplacer par Railway pendant la Phase 2.
- Le projet Railway existant `melodious-serenity` est réservé à une phase ultérieure
  pour un service séparé nommé `white-alpha-api` (API backend sécurisée, intégration
  Claude côté serveur, rate limiting, vérification des jetons Supabase). Aucun déploiement
  Railway tant que cette phase n'a pas commencé.
- L'app mobile communiquera avec `white-alpha-api` uniquement en HTTPS, une fois cette
  phase démarrée (voir PLAN.md).

## Identité visuelle finale
- Nom final affiché de l'application : « White Alpha ».
- Identité visuelle finale basée sur un loup blanc.
- Icône finale : tête de loup blanc, style moderne, sobre, reconnaissable.
- Logo, icône Android, splash screen et couleurs définitives : réalisés pendant la phase finale de finition (voir PLAN.md).
- Les ressources Expo temporaires actuelles sont conservées pour le moment.
- Le nom du dossier local `Discussion_Privee_Claude` n'est pas modifié.
