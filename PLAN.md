# Discussion Privée Claude — Plan de développement

Application mobile privée de messagerie, avec un écran séparé Assistant Claude.
Pas d'appels audio/vidéo, pas de groupes en V1.

## Phase 1 — Squelette & authentification (en cours)
- Nettoyage du template Expo par défaut (démo Home/Explore).
- Architecture de dossiers (voir README technique / structure `src/app`).
- Écrans : Bienvenue, Connexion, Inscription.
- Structure de navigation protégée (`Stack.Protected`) branchée sur un contexte
  d'authentification **temporaire et local** (aucun vrai compte, aucune clé).
- `.env.example` (app mobile) et `supabase/functions/.env.example` (Edge Functions),
  sans aucune valeur secrète.
- Vérifications : `tsc --noEmit`, `expo lint`, `expo-doctor`.

## Phase 2 — Authentification réelle (Supabase) — Terminée
- Intégration `@supabase/supabase-js`.
- Remplacement du contexte d'auth temporaire par une vraie session Supabase
  (email/mot de passe, persistance de session via AsyncStorage).
- Table `profiles` (id, username, avatar, created_at) + RLS, création automatique
  du profil via trigger `on_auth_user_created` sur `auth.users`.
- Deep link natif `whitealpha://auth/callback` pour la confirmation d'email
  (scheme app.json, route `src/app/auth/callback.tsx`, écran de renvoi d'email).
- Build Preview Android autonome (APK signé, sans dépendance à Metro/PC) validé
  sur téléphone : inscription réelle, connexion réelle, session persistée.
- **⚠️ Confirmation email temporairement désactivée dans Supabase Auth pour les
  tests de développement.** À réactiver avec un fournisseur SMTP fiable (au lieu
  du SMTP par défaut Supabase, limité en volume et peu fiable en delivrabilité)
  avant toute publication ou usage par de vrais utilisateurs.
- Écran de profil utilisateur (lecture/édition) : reporté à une phase ultérieure,
  non bloquant pour la Phase 3.

## Phase 3 — Recherche & conversations
- Recherche d'un utilisateur par pseudo.
- Création d'une conversation privée entre deux utilisateurs (1-to-1 uniquement).
- Liste des conversations de l'utilisateur connecté.
- **Schéma distant (tables, RLS, RPC) — Terminé et vérifié.** Migration
  `20260715104100_create_conversations_and_messages.sql` poussée sur le projet
  distant : tables `conversations`/`messages`, policies RLS (accès réservé aux
  participants), fonctions `search_public_profiles` et
  `get_or_create_direct_conversation` (SECURITY DEFINER, exécution réservée à
  `authenticated`), `messages` ajoutée à la publication `supabase_realtime`.
  14 tests pgTAP locaux passent ; vérification post-push sur le projet distant
  confirmée (tables, RLS actif, policies, GRANT `authenticated` corrects,
  `anon` sans accès effectif malgré les GRANT larges par défaut de Supabase
  Cloud, fonctions RPC rejetant tout appel non authentifié).
- Interface mobile (recherche, création de conversation, liste) : non
  commencée, en attente de validation utilisateur avant de démarrer.

## Phase 4 — Messagerie temps réel
- Table `messages` + Supabase Realtime (subscriptions).
- Envoi/réception de messages texte en direct.
- États de lecture/livraison de base.

## Phase 5 — Médias (photos & vidéos)
- Upload photos et vidéos enregistrées via Supabase Storage.
- Prévisualisation dans la conversation.
- Compression/limites de taille côté client.

## Phase 6 — Assistant Claude (écran séparé)
- Écran dédié, distinct des conversations privées entre utilisateurs.
- Appel à l'API Anthropic via une **Supabase Edge Function** (clé `ANTHROPIC_API_KEY`
  stockée uniquement côté serveur, jamais dans l'app mobile).
- Historique de conversation avec l'assistant, propre à chaque utilisateur.

## Phase 7 — Durcissement & polish
- Revue des policies RLS Supabase (accès conversations/messages/médias).
- Gestion des erreurs réseau, états de chargement, écrans vides.
- Notifications (à définir : push ou in-app uniquement).
- Remplacement des assets de démonstration Expo restants (logo/splash) par le
  branding définitif de l'application.

## Décision d'architecture — Supabase & Railway

- **Supabase** reste la seule plateforme backend pendant la Phase 2 et au-delà pour :
  authentification (Supabase Auth), profils utilisateurs, base PostgreSQL, Row Level
  Security, messages en temps réel (Supabase Realtime), et stockage futur des photos/vidéos
  (Supabase Storage). Railway ne remplace Supabase à aucun moment.
- **Railway** (projet existant `melodious-serenity`) est réservé à une **phase ultérieure**
  pour un service distinct nommé **`white-alpha-api`**, qui hébergera :
  - l'API backend sécurisée de White Alpha ;
  - l'intégration Claude côté serveur (jamais dans l'app mobile) ;
  - la limitation de débit (rate limiting) ;
  - la vérification des jetons Supabase ;
  - tout traitement qui ne doit jamais s'exécuter directement dans l'application mobile.
- Rien n'est déployé sur Railway avant le début de cette phase ultérieure.
- Quand cette phase démarrera, l'application mobile communiquera avec `white-alpha-api`
  **exclusivement en HTTPS**.

## Identité visuelle finale (White Alpha)
- Nom final affiché de l'application : « White Alpha ».
- Identité visuelle finale basée sur un loup blanc.
- Icône finale : tête de loup blanc, style moderne, sobre, reconnaissable.
- Logo, icône Android, splash screen et couleurs définitives : réalisés pendant la phase finale de finition (Phase 7).
- Les ressources Expo temporaires actuelles (logo, splash, couleurs) sont conservées pour le moment.
- Le nom du dossier local du projet (`Discussion_Privee_Claude`) n'est pas modifié.

## Périmètre explicitement exclu de la V1
- Appels audio.
- Appels vidéo.
- Conversations de groupe.
