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

## Phase 2 — Authentification réelle (Supabase)
- Intégration `@supabase/supabase-js`.
- Remplacement du contexte d'auth temporaire par une vraie session Supabase
  (email/mot de passe, persistance de session).
- Table `profiles` (id, username, avatar, created_at) + RLS.
- Écran de profil utilisateur (lecture/édition).

## Phase 3 — Recherche & conversations
- Recherche d'un utilisateur par pseudo.
- Création d'une conversation privée entre deux utilisateurs (1-to-1 uniquement).
- Liste des conversations de l'utilisateur connecté.

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
