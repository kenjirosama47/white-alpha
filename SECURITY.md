# White Alpha — Architecture de sécurité (v1.0.0 / build 14)

Ce document décrit l'architecture de sécurité de White Alpha telle que
validée au terme des phases 5.S2 à 5.S6, ainsi que ses limites assumées.

## Authentification et autorisation

- Authentification gérée exclusivement par Supabase Auth (email + mot de
  passe). L'application ne stocke jamais de mot de passe en clair.
- Un seul rôle privilégié existe : **propriétaire** (`owner`). Il est
  attribué manuellement côté administration Supabase, jamais depuis le
  client.
- L'unicité du propriétaire est garantie par un index unique partiel en
  base de données (`role = 'owner'`), vérifié y compris en cas de
  contournement direct de la contrainte applicative.
- Le rôle d'un profil ne peut pas être modifié par le client : la colonne
  `role` n'est pas accordée en écriture au rôle `authenticated`, et un
  déclencheur (`trigger`) refuse toute tentative de changement même par un
  chemin administratif non prévu.
- Le compte propriétaire est protégé par une authentification à deux
  facteurs (MFA TOTP, via Supabase Auth MFA). Toute action réservée au
  propriétaire exige un niveau d'authentification **AAL2** (facteur MFA
  vérifié dans la session en cours) ; un accès en AAL1 est explicitement
  refusé côté base de données, pas seulement côté interface.

## Base de données et Storage (Supabase)

- Row Level Security (RLS) est activée sur l'ensemble des tables exposées
  (`profiles`, `conversations`, `messages`, `message_attachments`).
- Le rôle `anon` ne dispose d'aucun privilège de table sur le schéma
  applicatif.
- Toute fonction `SECURITY DEFINER` fixe explicitement son `search_path`
  (`public, pg_temp`) afin d'empêcher un détournement par manipulation du
  chemin de recherche.
- Les droits d'exécution (`GRANT EXECUTE`) sont limités aux fonctions
  destinées au client, avec le principe du moindre privilège.
- Le bucket `chat-media` (photos/vidéos échangées) est **privé** : aucun
  accès public direct.
- Le bucket `avatars` est public par conception (photos de profil visibles
  par les autres utilisateurs), conformément à l'architecture validée.
- La suppression d'un message supprime de façon cohérente sa pièce jointe
  associée (base de données et fichier Storage), et une nouvelle tentative
  de suppression sur un message déjà supprimé n'échoue pas et ne produit
  aucun effet de bord.
- Aucune pièce jointe orpheline (fichier Storage sans ligne, ou ligne sans
  fichier Storage) n'a été constatée lors de l'audit final.

## Durcissement Android (APK)

- `debuggable=false`, `profileable=false`, `testOnly=false`,
  `allowBackup=false`.
- Aucun composant de développement embarqué : ni `expo-dev-client`, ni
  `expo-dev-launcher`, ni menu développeur, ni connexion à un serveur
  Metro local.
- Trafic réseau exclusivement en HTTPS : `usesCleartextTraffic=false`,
  Network Security Config explicite n'autorisant que les autorités de
  certification système.
- R8 (minification) et `shrinkResources` activés en Release.
- `FLAG_SECURE` appliqué à **toutes** les fenêtres (`Activity`) de
  l'application via un enregistrement global des rappels de cycle de vie,
  y compris l'Activity native de lecture vidéo plein écran (qui possède sa
  propre fenêtre, distincte de l'Activity principale) : capture d'écran et
  aperçu dans les applications récentes bloqués partout, sauf sur les
  écrans explicitement rendus publics (ex. écran de connexion).
- Permissions Android minimales : aucune permission caméra, micro,
  localisation ou contacts. `SYSTEM_ALERT_WINDOW` explicitement retirée du
  manifeste final.
- Aucune journalisation (`console.log`) de contenu applicatif en version
  Release : la journalisation de débogage est conditionnée à `__DEV__` et
  ne contient de toute façon jamais de valeur sensible (secret, jeton,
  contenu de message) en développement comme en production.
- Aucun secret n'est embarqué dans l'APK : pas de clé `service_role`, pas
  de secret TOTP, pas de mot de passe.

## Décisions de sécurité documentées

- **Pas de certificate pinning** : le certificat TLS du projet Supabase
  est émis automatiquement par Google Trust Services sur un cycle de
  validité court (environ 90 jours) et renouvelé sans intervention
  manuelle. Un pinning rigide sur ce certificat casserait l'application à
  chaque rotation pour une application distribuée hors Play Store (donc
  sans mécanisme de mise à jour forcée à distance). Le risque d'interruption
  de service dépasse le bénéfice de sécurité dans ce contexte précis.
- **Pas de Play Integrity** : nécessiterait une publication sur le Play
  Store, hors périmètre de la distribution actuelle en APK autonome.

## Limites assumées

Aucune mesure décrite dans ce document ne peut empêcher :
- une attaque physique directe sur un appareil déverrouillé ou déverrouillable ;
- une compromission par accès root de l'appareil ;
- une compromission complète du système d'exploitation sous-jacent.

Ces scénarios sont hors du périmètre que peut couvrir une application
tierce, quelle que soit sa conception.

## Signalement

Toute anomalie de sécurité reproductible doit être documentée avec les
étapes de reproduction avant toute correction, conformément au principe de
gel fonctionnel de la version stable (voir `PLAN.md`).
