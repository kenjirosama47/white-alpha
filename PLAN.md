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

## Phase 3 — Recherche, conversations & messagerie temps réel
- Recherche d'un utilisateur par pseudo.
- Création d'une conversation privée entre deux utilisateurs (1-to-1 uniquement).
- Liste des conversations de l'utilisateur connecté.
- **Schéma distant (tables, RLS, RPC) — Terminé et vérifié.** Migration
  `20260715104100_create_conversations_and_messages.sql` poussée sur le projet
  distant : tables `conversations`/`messages`, policies RLS (accès réservé aux
  participants), fonctions `search_public_profiles` et
  `get_or_create_direct_conversation` (SECURITY DEFINER, exécution réservée à
  `authenticated`), `messages` ajoutée à la publication `supabase_realtime`.
- **Durcissement défense en profondeur — Terminé et vérifié.** Migration
  `20260715125649_harden_conversations_messages_grants.sql` : `REVOKE ALL` sur
  `conversations`/`messages` pour `anon` (zéro privilège de table, vérifié
  sur le projet distant) ; `authenticated` réduit au strict nécessaire des
  policies existantes (SELECT seul sur `conversations` ;
  SELECT/INSERT/UPDATE/DELETE sur `messages`) ; aucune policy RLS modifiée.
- **RPC `list_my_conversations` — Terminée et vérifiée.** Migration
  `20260715130037_list_conversations_rpc.sql` : liste les conversations de
  l'utilisateur courant avec le profil public de l'autre participant (id,
  username, display_name, avatar_url — jamais d'email) et un aperçu du
  dernier message, triée par activité récente. SECURITY DEFINER, `search_path`
  explicite, réservée à `authenticated` (`EXECUTE` refusé à `anon`/`public`,
  vérifié sur le projet distant), refuse tout appel non authentifié.
  22 tests pgTAP locaux passent (14 + 8 pour cette RPC).
- **Interface mobile — Écrans Conversations/Recherche/Discussion.** Architecture
  séparée (`src/types/chat.ts`, `src/services/{profiles,conversations,messages}.ts`,
  `src/hooks/{use-conversations,use-messages,use-user-search}.ts`, composants
  dans `src/components/`, routes Expo Router `src/app/(app)/{index,search,
  conversation/[id]}.tsx`) : aucune logique Supabase directement dans les
  composants. Écran Conversations (états chargement/erreur/vide, actualisation
  manuelle), écran Recherche (RPC `search_public_profiles`, anti-rebond,
  exclusion de l'utilisateur courant, aucun email affiché), écran Discussion
  (historique paginé, Realtime filtré par `conversation_id`, validation
  1-4000 caractères, protection double envoi, nettoyage du channel au
  démontage). 22 tests unitaires Jest/Testing Library (validation, services,
  double envoi, nettoyage Realtime, état vide). Photos/vidéos/groupes/appels/
  Assistant Claude/identité visuelle du loup : non commencés (hors périmètre
  Phase 3).

## Statut Phase 3 (synthèse)
- Schéma distant (tables, RLS, RPC, durcissement, `list_my_conversations`) :
  **appliqué et vérifié** sur le projet Supabase distant.
- Interface mobile de discussion (Conversations, Recherche, Discussion) :
  **terminée**, 22 tests unitaires passent, `tsc`/`lint`/`expo-doctor` au vert.
- Dépendances Expo réalignées sur SDK 57 (`expo install --fix`, versions
  patch uniquement) : `expo-doctor` 20/20.
- **Test manuel avec deux comptes réels — Terminé et validé** sur la version
  Preview Android autonome : champ de saisie visible au-dessus du clavier,
  bouton Envoyer accessible, message téléphone → Web, message Web → téléphone
  en temps réel, conversation conservée après réouverture. Phase 3 close.

## Phase 4 — Photos et vidéos

### Phase 4A — Photos — Terminée et validée
- Bucket Supabase Storage privé `chat-media` (jamais public) — vérifié sur le
  projet distant (`public = false`, limite 10 Mo, `image/jpeg`/`image/png`/
  `image/webp`).
- Modèle `message_type` (`text`/`image`) sur `public.messages` avec contrainte
  de longueur conditionnelle au type. INSERT direct sur `messages` et sur
  `message_attachments` révoqué pour `authenticated` : toute création passe
  exclusivement par les RPC `SECURITY DEFINER` `create_text_message` et
  `create_image_message` (search_path explicite, `EXECUTE` réservé à
  `authenticated`, jamais `anon`/`public`) — vérifié sur le projet distant.
- Table `public.message_attachments` (migration
  `20260715140000_create_message_attachments.sql`, **poussée sur le projet
  distant**) liée à `public.messages`/`public.conversations`, RLS stricte
  (lecture réservée aux deux participants, suppression réservée à
  l'expéditeur) — vérifiée sur le projet distant.
- Politiques `storage.objects` avec chemin obligatoire
  `conversation_id/uploader_id/uuid.extension`, aucune permission `anon`,
  aucun usage de `service_role` côté application — vérifiées sur le projet
  distant.
- Upload Storage effectué avant l'appel RPC (non transactionnel avec la base) ;
  seules les lignes `messages`/`message_attachments` sont atomiques côté
  PostgreSQL ; suppression compensatoire du fichier Storage si la RPC échoue.
- Sélection d'une photo depuis la bibliothèque (`expo-image-picker`, sans
  permission caméra ni microphone), aperçu avant envoi, upload avec
  vérification MIME/taille (max 10 Mo, jpeg/png/webp), affichage dans la
  bulle de conversation (URL signée temporaire, jamais persistée en base —
  vérifié : aucune colonne URL dans le schéma distant).
- États de lecture/livraison de base : reporté à une phase ultérieure.
- 48 tests pgTAP locaux passent (14 + 8 Phase 3 mis à jour pour la nouvelle
  RPC + 26 Phase 4A), 74 tests unitaires Jest passent.
- **Validation manuelle complète — Terminée**, sur la version Preview Android
  autonome (`versionCode` 3, build EAS avec `expo-image-picker`) : réception
  d'une photo test en temps réel, ouverture en plein écran, sélection d'une
  vraie photo depuis la bibliothèque Android, aperçu et annulation, envoi
  téléphone → second compte, réception en temps réel côté destinataire,
  conservation de l'image après fermeture/réouverture de l'app. Compte de
  test et toutes ses données (profil, conversation, message, pièce jointe,
  fichier Storage) supprimés après validation ; zéro donnée orpheline
  vérifiée ; bucket `chat-media` confirmé toujours privé ; aucun compte réel
  affecté. Phase 4A close.

### Phase 4B — Vidéos enregistrées — Développée, migration distante appliquée
- Bibliothèque uniquement (aucune caméra, aucun micro, une seule vidéo par
  message), MP4 exclusivement, 60 secondes / 50 Mo maximum.
- Modèle `message_type`/`media_type` étendu à `'video'` (migration
  `20260715150000_add_video_messages.sql`, **poussée sur le projet
  distant**) : nouvelle colonne `duration_ms` sur `message_attachments`,
  contraintes MIME/taille/durée conditionnelles au type — contraintes photo
  (10 Mo, jpeg/png/webp) **inchangées**, vérifié sur le projet distant.
- RPC `create_video_message` (`SECURITY DEFINER`, `search_path` explicite,
  `sender_id`/`uploader_id` exclusivement via `auth.uid()`, `EXECUTE` réservé
  à `authenticated`) — vérifiée sur le projet distant. `create_text_message`/
  `create_image_message` inchangées, INSERT direct sur `messages`/
  `message_attachments` toujours révoqué (revérifié après la migration).
- Bucket `chat-media` (inchangé, toujours privé) : `allowed_mime_types`
  étendu à `video/mp4`, `file_size_limit` relevé à 52 428 800 (50 Mo) —
  vérifié sur le projet distant. Policies `storage.objects` de la Phase 4A
  réutilisées sans modification (déjà agnostiques à l'extension du fichier).
- Upload reprenable (protocole TUS, `tus-js-client`) vers le hostname
  Storage direct du projet : progression, délais de nouvelle tentative,
  annulation, chemin UUID neuf à chaque envoi. Upload Storage effectué avant
  l'appel RPC (non transactionnel avec la base, comme pour les photos) ;
  suppression compensatoire du fichier Storage si la RPC échoue.
- Lecture vidéo (`expo-video`, `useVideoPlayer`/`VideoView`) : contrôles
  natifs, plein écran autorisé, aucune lecture automatique, boucle/PiP/
  lecture en arrière-plan désactivés, lecteur chargé (`replaceAsync`)
  uniquement au tap utilisateur, mis en pause au démontage. Composant
  `src/components/message-video.tsx`.
- Interface : choix Photo/Vidéo dans le composer, aperçu (durée/taille),
  barre de progression, bouton Annuler l'envoi, envoi de texte jamais
  bloqué pendant la préparation d'une vidéo, un seul média à la fois par
  conversation.
- URL signée temporaire pour l'affichage (jamais persistée en base — vérifié
  : aucune colonne URL dans le schéma distant), renouvelée à l'expiration.
- **Limitation MVP documentée** : la reprise d'upload après coupure réseau
  est prise en charge pendant la session en cours (délais de nouvelle
  tentative de `tus-js-client`, upload toujours en mémoire) ; **elle n'est
  pas prise en charge après un redémarrage complet de l'application**
  (aucune persistance `urlStorage` de l'upload en cours). À traiter dans une
  phase ultérieure si nécessaire.
- 68 tests pgTAP locaux passent (14 + 8 + 26 Phase 4A + 20 Phase 4B),
  121 tests unitaires Jest passent (116 + 5 pour les deux correctifs
  ci-dessous).
- **Bugs trouvés et corrigés lors du test manuel Web** : (1) sur web,
  `expo-image-picker` rapporte la durée vidéo en secondes au lieu de
  millisecondes (bug amont de la librairie) — normalisé côté app
  (`Platform.OS === 'web'` → conversion + arrondi entier) avant tout envoi ;
  (2) une erreur PostgreSQL brute pouvait fuiter jusqu'à l'utilisateur au
  lieu d'un message français — seules les exceptions volontairement levées
  par nos RPC (`SQLSTATE P0001`) sont désormais affichées telles quelles.
- **Test manuel Web — Réussi** : vidéo MP4 réelle envoyée depuis un compte
  de test vers `kenjies47`, durée correctement enregistrée en base
  (entier, ms), lecture confirmée (contrôles natifs, plein écran).
  Compte de test et toutes ses données supprimés après validation.
- **Reste à faire : test manuel réel sur Android** avec une vidéo choisie
  sur le téléphone, entre deux comptes réels, sur la version Preview
  autonome (`versionCode` 4, déjà compatible — le correctif de durée ne
  concerne que la plateforme web, la durée native étant déjà en
  millisecondes). Aucun nouveau build requis pour ce correctif.

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
