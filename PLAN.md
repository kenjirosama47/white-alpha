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
- **Validation manuelle Android — Terminée**, sur la version Preview
  autonome (`versionCode` 4), avec deux comptes réels : sélection d'une
  vraie vidéo MP4 depuis la bibliothèque du téléphone, upload reprenable
  TUS, message + pièce jointe créés atomiquement, réception en temps réel
  sur le second compte, lecture vidéo avec contrôles natifs, plein écran,
  conservation après fermeture/réouverture de l'app, limites de taille et
  de durée respectées. Confirmé en base : message vidéo réel de 6 055 996
  octets (~5,8 Mo), durée 31 965 ms (~32 s), `storage_path` cohérent entre
  Storage et `message_attachments`. Vidéo réelle conservée (aucune
  suppression). Phase 4B close.

## Phase 5 — Finalisation, fiabilité et identité White Alpha

### Phase 5.4 — Suppression sécurisée des messages et médias — Terminée et validée
- RPC `delete_own_message(p_message_id uuid)` (migration
  `20260716090000_delete_own_message.sql`, **poussée sur le projet distant**,
  `SECURITY DEFINER`, `search_path` explicite, `EXECUTE` réservé à
  `authenticated`, refusé à `anon`/`public`) — vérifiée sur le projet
  distant : vérifie `auth.uid()`, vérifie que `sender_id` correspond bien à
  l'appelant (refuse toute suppression du message d'un autre utilisateur),
  idempotente (un message déjà supprimé renvoie un résultat vide, jamais une
  erreur), ne renvoie que `message_id`/`message_type`/`storage_path` (jamais
  d'URL signée, d'email ni de chemin local), ne supprime jamais elle-même de
  fichier Storage.
- `alter table public.messages replica identity full` (même migration,
  vérifiée sur le projet distant) : nécessaire pour que les événements
  Realtime `DELETE` contiennent `conversation_id` dans la ligne `OLD` et
  soient donc livrés au filtre `conversation_id=eq.<id>` déjà utilisé par
  l'écran de conversation.
- Ordre de suppression côté application (photo/vidéo) : fichier Storage
  supprimé en premier (`removeAttachmentFileOrThrow`, propage l'échec,
  contrairement à l'ancienne suppression best-effort) ; le message n'est
  supprimé en base qu'une fois ce fichier confirmé supprimé. Si l'étape
  Storage échoue, la base n'est jamais touchée. Si le fichier est supprimé
  mais que la RPC échoue ensuite, une reprise automatique de l'étape base
  (jusqu'à 3 tentatives, délais croissants) est tentée avant de proposer un
  bouton « Réessayer » manuel — jamais une nouvelle suppression Storage.
- Interface : action « Supprimer » sur ses propres messages uniquement,
  confirmation avant suppression, état « Suppression… », erreur avec
  « Réessayer », message retiré de la liste après succès (localement et via
  l'événement Realtime `DELETE` chez l'autre participant).
- Policies RLS `DELETE` de la Phase 4A (`sender_id = auth.uid()` sur
  `messages`, `uploader_id = auth.uid()` sur `message_attachments` et
  `storage.objects`) réutilisées sans modification comme source de vérité
  de l'autorisation ; la RPC ajoute un point d'entrée unique et idempotent,
  ne les remplace ni ne les affaiblit — grants de table inchangés (revérifiés
  sur le projet distant : aucun `INSERT`/`DELETE` excessif réactivé pour
  `anon`/`public`).
- 85 tests pgTAP locaux passent (14 + 8 + 26 Phase 4A + 20 Phase 4B + 17
  Phase 5.4), 166 tests unitaires Jest passent.
- **Bug trouvé et corrigé lors du test manuel Android (versionCode 6)** :
  suppression d'une vidéo entraînant la fermeture complète de l'application.
  Cause confirmée par lecture du code natif d'`expo-video`
  (`VideoPlayer.kt#close`) : un appel explicite à `player.pause()` dans l'effet
  de nettoyage de `message-video.tsx` s'exécutait après la libération
  automatique du lecteur par `useVideoPlayer` (les cleanups React s'exécutent
  dans l'ordre de déclaration des effets, jamais l'inverse), soit un appel sur
  un lecteur ExoPlayer déjà libéré côté natif — crash non rattrapable côté
  JavaScript. Corrigé : plus aucun appel explicite à une méthode du lecteur
  depuis un cleanup ; garde `mountedRef` supplémentaire empêchant `player.play()`
  si le composant a été démonté pendant le chargement (`replaceAsync`) d'une
  vidéo. Bouton ⋮ dédié également ajouté sur les vidéos envoyées par
  l'utilisateur (le rendu natif Android de `VideoView`, via `SurfaceView` par
  défaut, pouvait recouvrir le lien « Supprimer » sous la bulle — corrigé avec
  `surfaceType="textureView"`). Revalidé sur Android versionCode 7.
- **Test manuel avec deux comptes réels — Terminé et validé**, sur les
  versions Preview Android autonomes (versionCode 6 puis 7 pour le correctif
  ci-dessus) : suppression d'un message texte, d'une photo et d'une vidéo par
  leur auteur (bouton ⋮ dédié pour la vidéo), confirmation avant suppression,
  état « Suppression… », disparition de la bulle après succès, White Alpha et
  la conversation restent ouvertes et utilisables, vidéo absente après
  fermeture/réouverture de l'app, suppression impossible sur un message reçu
  (aucune option affichée). Vérifié sur le projet distant après le test : le
  message vidéo, sa pièce jointe et son fichier Storage n'existent plus,
  aucun fichier orphelin dans `chat-media` (bucket entièrement vide et
  toujours privé après ce test). Phase 5.4 close.

### Phase 5.3 — Reprise et nouvelle tentative des uploads — Terminée et validée
- Objectif : après un échec d'upload photo/vidéo, permettre une nouvelle
  tentative sans re-sélectionner le fichier, dans la même session.
- Vidéos (TUS) : `uploadVideoResumable` expose désormais `retry()`, qui
  réutilise la même instance `tus.Upload` (donc la même ressource côté
  serveur) pour reprendre depuis le dernier octet reçu, au lieu de repartir
  de zéro — `retryDelays` de `tus-js-client` inchangés. Un cancel volontaire
  (`cancelUpload`) termine définitivement la ressource côté serveur
  (`abort(true)`) : plus aucune reprise possible ensuite, un futur envoi crée
  une ressource entièrement neuve.
- Photos : chaque tentative (y compris une reprise après échec) génère un
  nouveau chemin Storage (`generateStoragePath`) — jamais d'écrasement d'un
  fichier précédent.
- État local uniquement (URI, MIME, taille, durée, dimensions), jamais
  persisté en base ni journalisé ; jeton de session jamais exposé.
- Une seule sélection/upload à la fois par écran de conversation (protection
  déjà existante depuis la Phase 4B, revérifiée).
- Interface : bouton « Réessayer » explicite après un échec (remplace
  « Envoyer » quand une erreur est affichée), barre de progression vidéo
  conservée après un échec reprenable (ne repart pas de 0 à la reprise).
- Limitation MVP inchangée (documentée en Phase 4B) : aucune reprise après un
  redémarrage complet de l'application (pas de persistance `urlStorage`) —
  la reprise n'est validée que **pendant la même session** (app restée
  ouverte, y compris pendant la coupure réseau elle-même). Toujours hors
  périmètre du MVP.
- **Test manuel — Terminé et validé**, sur la version Preview Android
  autonome (versionCode 7) : coupure réseau pendant l'upload d'une vidéo,
  message d'erreur en français, aperçu et texte du champ conservés, bouton
  « Réessayer » affiché, annulation disponible, reprise après retour du
  réseau (même session), envoi final réussi, White Alpha reste ouverte.
  Vérifié sur le projet distant après le test : exactement un objet Storage,
  un message vidéo et un `message_attachment` pour cet envoi, `storage_path`
  identique entre Storage et la base, MIME `video/mp4`, taille et durée
  cohérentes ; aucun doublon ni fichier orphelin issus de la tentative
  interrompue ; bucket `chat-media` toujours privé. Phase 5.3 close.

### Phase 5.2 — États chargement, vide, erreur et connexion réseau cohérents — Terminée et validée
- Objectif : uniformiser les états (chargement, liste vide, erreur récupérable,
  absence de connexion, reconnexion, nouvelle tentative) sur les écrans
  Conversations, Recherche et Discussion, sans toucher à la logique métier de
  la messagerie/photos/vidéos/suppression/reprise (inchangée).
- Composants partagés intégrés (`src/components/`) : `AppLoadingState`,
  `AppEmptyState`, `AppErrorState`, `RetryButton`, `OfflineBanner` — props
  simples (titre, description, action optionnelle, libellé bouton, compact/
  plein écran, `accessibilityLabel`), style noir existant conservé. Intégrés
  dans les trois écrans (`index.tsx`, `search.tsx`, `conversation/[id].tsx`),
  remplaçant les blocs de chargement/erreur/vide ad hoc précédents.
- Erreurs centralisées (`src/utils/errors.ts`) : `describeError`/
  `classifyError` traduisent toute erreur inattendue (réseau, délai dépassé,
  session expirée, accès refusé, serveur indisponible) en message français ;
  `rpcErrorMessage`/`friendlyRpcError` ne font confiance à `error.message` que
  pour une exception volontaire de RPC (SQLSTATE `P0001`) — jamais un message
  Postgres brut. Appliqué à `services/conversations.ts` et
  `services/profiles.ts` (fuite de message technique brut corrigée) ; réutilisé
  sans changement de comportement dans `services/messages.ts`.
- Connexion réseau : nouvelle dépendance `@react-native-community/netinfo`
  (12.0.1, installée via `expo install`, compatible SDK 57). Hook
  `use-network-status.ts` + `OfflineBanner` monté une seule fois dans le
  layout racine (`src/app/_layout.tsx`) : bandeau « Aucune connexion
  Internet » pendant une coupure, « Connexion rétablie » brièvement (3s) au
  retour. Aucune déconnexion automatique, aucune donnée déjà chargée effacée.
- **Reconnexion Realtime protégée contre les abonnements multiples** : le
  canal Realtime existant (un seul par conversation, déjà en place depuis la
  Phase 3) se reconnecte seul au niveau du WebSocket (comportement natif
  `supabase-js`) — aucune re-souscription manuelle ajoutée. Au retour de
  connexion, une resynchronisation silencieuse récupère les données
  manquées : `use-messages.ts` **fusionne** les messages (jamais de
  réinitialisation, dédoublonnage par id) ; `use-conversations.ts` recharge la
  liste complète (non paginée, donc sûr) sans jamais déclencher l'écran de
  chargement plein écran ni l'indicateur « tirer pour actualiser ». Vérifié
  par test : un seul canal/abonnement créé, aucun doublon après reconnexion.
- 220 tests unitaires Jest passent (166 + 54 pour cette phase), `tsc`/`lint`/
  `expo-doctor` au vert.
- **Test manuel — Terminé et validé**, sur la version Preview Android
  autonome (versionCode 8) : bandeau « Aucune connexion Internet » pendant
  une coupure, conversations et messages déjà chargés conservés, erreur en
  français lors d'une opération tentée hors connexion, White Alpha reste
  ouverte, bandeau « Connexion rétablie » au retour du réseau, reconnexion
  Realtime sans abonnement ni message en double, états chargement/vide/erreur
  cohérents, bouton « Réessayer » fonctionnel. Phase 5.2 close.

### Phase 5.1 — Profil utilisateur et paramètres — Développée, migration distante appliquée, validation manuelle Android restant à effectuer
- Écran unique `src/app/(app)/profile.tsx` (vue profil + édition + section
  Paramètres, bascule locale, pas de route séparée) : avatar, nom affiché,
  `@username`, bouton « Modifier le profil », section Paramètres
  (Confidentialité, statut de connexion, version de l'app, « Se déconnecter »).
  Accès depuis l'écran Conversations (lien « Profil » dans l'en-tête).
- RPC `update_my_profile(username, display_name, avatar_path default null)`
  (migration `20260716140000_profile_settings.sql`, **poussée sur le projet
  distant et vérifiée** : `SECURITY DEFINER`, `search_path` explicite,
  `EXECUTE` réservé à `authenticated`, refusé à `anon`/`public`, agit
  exclusivement sur `auth.uid()` — aucun `user_id` libre accepté, ne renvoie
  jamais d'email) : normalise le nom d'utilisateur en minuscules, valide
  nom/username côté PostgreSQL (3-30 caractères pour le username, doit
  commencer par une lettre/chiffre jamais un underscore ; 2-50 pour le nom
  affiché), message français explicite si le nom d'utilisateur est déjà pris.
  Contrainte `username_format` resserrée en conséquence (auparavant 3-24,
  pouvait commencer par un underscore) ; `handle_new_user` (inscription) mis à
  jour avec la même règle. Grants explicites ajoutés sur `public.profiles`
  (SELECT+UPDATE pour `authenticated` uniquement, rien pour `anon`) —
  auparavant implicites (privilèges larges par défaut de Supabase Cloud),
  rendus explicites en défense en profondeur.
- Bucket Storage `avatars` (public, 5 Mo max, `image/jpeg`/`png`/`webp`
  uniquement, distinct de `chat-media`) : chemin obligatoire
  `user_id/uuid.ext`, upload/suppression/lecture limités au propre dossier de
  l'appelant (policies RLS testées et vérifiées vers/depuis un autre compte).
  `public.profiles.avatar_url` stocke un **chemin** Storage (jamais une URL),
  converti en URL publique côté client (`getAvatarPublicUrl`, appel local
  sans réseau) dans les mappers de `services/profiles.ts` et
  `services/conversations.ts` — chaque consommateur reçoit toujours une URL
  prête à afficher. Choix du bucket public documenté et vérifié en conditions
  réelles après le push (upload réel + récupération HTTP sans aucune
  authentification via `/storage/v1/object/public/avatars/...`, statut 200) :
  un avatar est déjà traité comme public par le schéma existant
  (`search_public_profiles`/`list_my_conversations` le renvoient déjà à tout
  utilisateur authentifié). « Public » ne veut pas dire « listable » : aucun
  listing global (vérifié : `list` sur le bucket en anonyme renvoie `[]`).
- **Bug trouvé et corrigé par les tests pgTAP avant tout push** : une policy
  SELECT manquante sur le bucket `avatars` empêchait silencieusement (sans
  erreur) la suppression de son propre avatar via la policy DELETE pourtant
  correcte — comportement RLS Postgres constaté empiriquement, pas documenté
  a priori. Policy SELECT ajoutée, strictement limitée au propre dossier de
  l'appelant (ne permet toujours pas de voir les avatars des autres
  utilisateurs, qui restent accessibles uniquement via l'URL publique).
  Une colonne `id` ambiguë dans `update_my_profile` (conflit avec le paramètre
  de sortie `RETURNS TABLE`) a également été corrigée.
- Flux de remplacement d'avatar : sélection bibliothèque uniquement (jamais
  caméra), recadrage carré natif, aperçu annulable avant envoi ; upload → RPC
  → suppression de l'ancien avatar uniquement après succès complet (jamais
  celui d'un autre compte) ; en cas d'échec de la RPC après un upload réussi,
  suppression compensatoire du **nouveau** fichier uniquement.
- Déconnexion : confirmation inline (cohérent avec le pattern déjà existant
  de confirmation de suppression de message, pas d'`Alert.alert`), erreur
  française si l'appel échoue, aucune suppression de conversation ni de
  fichier.
- **Suppression de compte toujours interdite** : risque documenté de
  suppression en cascade des conversations partagées (`ON DELETE CASCADE`)
  — hors périmètre de cette phase et de toute phase tant que ce risque n'est
  pas traité séparément.
- 30 tests pgTAP locaux passent pour cette phase (115 au total avec les
  phases précédentes), 277 tests unitaires Jest passent (220 + 57 pour cette
  phase), `tsc`/`lint`/`expo-doctor` au vert, `db lint --linked` sans erreur.
- Migration `20260716140000_profile_settings.sql` **poussée et vérifiée sur
  le projet distant** (`migration list --linked` synchronisé, toutes les
  vérifications de sécurité de la RPC et des policies Storage revérifiées
  directement sur le projet distant après le push).
- **Bug trouvé lors de la première validation manuelle (versionCode 9)** : l'en-tête
  de l'écran Conversations n'affichait qu'un lien texte « Profil », sans avatar ni
  `accessibilityLabel` dédié. Corrigé : bouton affichant l'avatar de l'utilisateur
  connecté (ou son initiale à défaut), `accessibilityLabel="Ouvrir mon profil"`,
  navigation vers `/profile` au toucher ; la déconnexion reste exclusivement dans
  l'écran Profil, jamais dans l'en-tête Conversations. Un test structurel
  (`src/app/(app)/_layout.test.tsx`) vérifie que `/profile` est déclaré dans le même
  groupe Stack protégé (`Stack.Protected guard={isAuthenticated}` du layout racine)
  que les autres écrans authentifiés — aucune redirection dupliquée par écran.
- Écran Profil : ligne discrète « Version X.Y.Z — build N » ajoutée dans Paramètres,
  valeurs tirées de `Constants.expoConfig` (`expo-constants`, déjà une dépendance
  existante, aucune nouvelle dépendance).
- 283 tests unitaires Jest passent (277 + 6 pour ce correctif), `tsc`/`lint`/
  `expo-doctor` au vert.
- **Test manuel — Terminé et validé**, sur la version Preview Android autonome
  (versionCode 9 puis 10 pour le correctif d'accès au profil ci-dessus) : écran
  Profil accessible depuis l'en-tête Conversations, modification du nom affiché,
  modification du nom d'utilisateur, validation des saisies, sélection et upload de
  l'avatar, avatar conservé après réouverture de l'app, avatar visible depuis un
  autre compte, remplacement de l'avatar, déconnexion et reconnexion, aucune adresse
  email publique, White Alpha reste ouverte. Phase 5.1 close.
- **Suppression de compte reste hors périmètre** de toute phase actuelle ou future
  tant que le risque `ON DELETE CASCADE` documenté ci-dessus n'est pas traité
  séparément.

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
