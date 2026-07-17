# White Alpha — Validation finale build 14 / v1.0.0 (Phase 5.S6)

Ce document consigne la matrice de validation exécutée avant le gel
fonctionnel de la version stable v1.0.0. Aucune information sensible
(email complet, UUID complet, secret TOTP, QR code, mot de passe, clé
`service_role`, URL signée) n'est incluse.

## 1. Validations automatiques

| Vérification | Résultat |
|---|---|
| `npm ci` | OK |
| `npm test -- --runInBand` | OK, aucun test en échec |
| `npx tsc --noEmit` | OK, aucune erreur |
| `npm run lint` | OK, aucune erreur |
| `npx expo-doctor` | 19/20 — voir note ci-dessous |
| `npx expo export --platform android --clear` | OK |
| `npx supabase db reset` | OK |
| `npx supabase test db` | OK, toutes les suites pgTAP passent |
| `npx supabase db lint` | OK |
| `npx supabase db push --linked --dry-run` | OK, aucune migration non appliquée |

**Note expo-doctor (19/20)** : le seul point signalé concerne 5 paquets du
SDK Expo (`expo`, `@expo/ui`, `expo-constants`, `expo-image-picker`,
`expo-router`) dont la version installée est en retard d'un correctif
mineur (« patch ») par rapport à la version attendue par le SDK 57.
Conformément à la consigne de gel fonctionnel, ces dépendances n'ont pas
été mises à jour automatiquement (aucun `npx expo install --check` exécuté,
aucun `npm audit fix --force`). Aucun de ces écarts n'a d'impact
fonctionnel ou de sécurité constaté sur le build 14.

## 2. Audit de l'APK build 14 (inspection directe, sans reconstruction)

| Vérification | Résultat |
|---|---|
| Signature valide, certificat EAS attendu | OK |
| `debuggable=false`, `profileable=false`, `testOnly=false` | OK |
| `allowBackup=false` | OK |
| `usesCleartextTraffic=false` + Network Security Config active | OK |
| Certificats système uniquement en Release | OK |
| R8 + `shrinkResources` actifs | OK |
| Bundle JS de production présent | OK |
| Variables Supabase embarquées (URL + clé publique) | OK |
| Aucun `expo-dev-client` / `expo-dev-launcher` / menu développeur / serveur Metro | OK |
| Aucune URL `localhost` / `127.0.0.1` / `10.0.2.2` / `ws://` applicative | OK (occurrences résiduelles identifiées comme internes à des SDK tiers, sans lien avec une URL applicative réelle) |
| Aucune clé `service_role`, secret TOTP, mot de passe ou contenu de message en clair | OK |
| Permissions Android minimales, aucune permission caméra/micro/localisation/contacts | OK |
| `SYSTEM_ALERT_WINDOW` absente | OK |

## 3. Tests fonctionnels de non-régression

### Simulation SQL directe (niveau RLS/RPC, exécutée cette session)

- Compte utilisateur normal : création/ouverture de conversation, envoi de
  message texte, recherche de profil — OK.
- Suppression de son propre message — OK.
- Compte propriétaire en AAL1 (sans MFA vérifié) sur une fonction
  sensible — refus correct.
- Compte propriétaire en AAL2 (MFA vérifié) sur la même fonction — accès
  correctement autorisé.
- Compte utilisateur normal avec une revendication AAL2 falsifiée — refus
  correct (la vérification porte sur le rôle, pas seulement sur l'AAL).
- Tentative de création d'un second propriétaire (y compris en contournant
  la voie applicative habituelle) — refus correct, décompte des rôles
  inchangé après la tentative (1 propriétaire, aucune donnée résiduelle).
- Double suppression du même message — la seconde tentative ne produit
  aucune erreur bloquante et aucun effet de bord (idempotence confirmée).

### Test réel sur appareil (rapporté par l'utilisateur, build 14)

Ouverture directe, connexion Supabase, Conversations, Recherche,
Discussion, Profil, rôle propriétaire et MFA conservés, envoi de
message/photo/vidéo, suppression, capture bloquée sur écran privé, aperçu
des applications récentes masqué, comportement arrière-plan/premier plan,
fermeture et réouverture — aucun plantage constaté.

## 4. Base de données et Storage

- RLS active sur les 4 tables exposées (`profiles`, `conversations`,
  `messages`, `message_attachments`) — confirmé.
- Aucun privilège de table accordé au rôle `anon` — confirmé.
- Toutes les fonctions `SECURITY DEFINER` applicatives fixent
  `search_path=public, pg_temp` — confirmé (une fonction interne
  `rls_auto_enable`, gérée par la plateforme Supabase elle-même et non par
  ce projet, utilise `search_path=pg_catalog` : hors périmètre applicatif).
- Bucket `chat-media` : privé, limite de taille et types MIME conformes.
- Bucket `avatars` : public par conception, limite de taille et types MIME
  conformes.
- Aucun fichier Storage orphelin (sans ligne `message_attachments`
  correspondante) — confirmé, 0 résultat.
- Aucune ligne `message_attachments` orpheline (sans fichier Storage
  correspondant) — confirmé, 0 résultat.
- Suppression cohérente message + Storage, double suppression sans
  erreur — confirmé.
- Toutes les données de test utilisées portent un préfixe clairement
  identifiable (`phase51test*`) et ont été nettoyées après validation ;
  aucune donnée réelle n'a été modifiée.

## 5. Anomalies confirmées

Aucune anomalie bloquante confirmée à l'issue de cette phase.

## 6. Faux positifs écartés

- Occurrences de chaînes ressemblant à des URL locales ou à des schémas
  `ws://` dans le bundle JS compilé : tracées à des bibliothèques tierces
  (SDK Metro, SDK AWS embarqué dans `@supabase/storage-js`, options de
  configuration de `tus-js-client`), sans rapport avec une URL applicative
  réelle de White Alpha.

## 7. Risques résiduels

- Absence de certificate pinning (décision documentée, voir `SECURITY.md`).
- Aucune protection contre un appareil rooté, une attaque physique directe,
  ou une compromission complète du système d'exploitation (limite assumée
  de toute application tierce, voir `SECURITY.md`).
- 5 dépendances Expo en retard d'un correctif mineur (voir section 1) —
  sans impact fonctionnel constaté, à surveiller lors d'une phase
  ultérieure de mise à jour des dépendances.

## 8. Décision versionCode

Aucune anomalie bloquante n'a été constatée : le build 14 (versionCode 14)
reste la version stable candidate. Aucun versionCode 15 n'a été créé.

## 9. Dépendances et versions (extrait)

| Paquet | Version |
|---|---|
| `expo` | ~57.0.6 |
| `react-native` | 0.86.0 |
| `@supabase/supabase-js` | ^2.110.5 |

## 10. Absence de support Play Store

Cette version est distribuée exclusivement en APK autonome. Voir
[INSTALLATION_ANDROID.md](INSTALLATION_ANDROID.md).
