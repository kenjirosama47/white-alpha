# White Alpha — Validation finale build 15 (Phase 6 — notifications push)

Ce document consigne la matrice de validation exécutée pour le build 15,
qui ajoute les notifications push privées et sécurisées à la version
stable v1.0.0 (build 14). Aucune information sensible (email complet, UUID
complet, secret TOTP, QR code, mot de passe, clé `service_role`, secret
partagé, URL signée, token push complet) n'est incluse.

## 1. Validations automatiques

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand` | OK, 433/433 tests |
| `npx tsc --noEmit` | OK, aucune erreur |
| `npm run lint` | OK, aucune erreur |
| `npx expo-doctor` | 19/20 — même point résiduel que le build 14 (paquets Expo en retard d'un correctif mineur, non corrigés automatiquement) |
| `npx expo export --platform android --clear` | OK |
| `npx supabase db reset` / `test db` / `db lint` | OK, 190/190 assertions pgTAP |
| `npx supabase db push --linked` | OK, migrations notifications appliquées et synchronisées |

## 2. Audit de l'APK build 15 (manifeste fusionné final)

| Vérification | Résultat |
|---|---|
| Signature valide, certificat identique aux builds 12/13/14 | OK |
| `debuggable=false`, `testOnly=false` | OK |
| `allowBackup=false` | OK |
| `usesCleartextTraffic=false` + Network Security Config active | OK |
| R8 + `shrinkResources` actifs | OK |
| Aucun `expo-dev-client` / `dev-launcher` / `dev-menu` | OK |
| `POST_NOTIFICATIONS` présente (nécessaire, Android 13+) | OK |
| Aucune permission caméra/micro/localisation/contacts | OK |
| `SYSTEM_ALERT_WINDOW` absente | OK |
| Aucun `service_role` ni secret Edge Function dans le bundle compilé | OK |
| Aucun token push complet dans les logs (client et Edge Function) | OK, vérifié en local et sur le projet distant |
| Canal Android « Messages » : nom générique, importance HIGH, visibilité écran verrouillé privée par défaut | OK |

## 3. Notifications — architecture et sécurité

- Table `user_push_devices` : RLS active, lecture limitée à `auth.uid()`,
  toute écriture exclusivement via RPC `SECURITY DEFINER`.
- Table `notification_preferences` : RLS active, aucun accès table direct,
  RPC uniquement.
- Table `push_notification_log` : RLS active, aucun accès client, réservée
  à l'Edge Function (`service_role`).
- Déduplication par `(message_id, appareil)` : contrainte unique confirmée
  (local et distant).
- Aucune lecture globale des tokens : confirmé par test RLS (un utilisateur
  ne voit jamais les appareils d'un autre) et par grants (`anon` : aucun
  privilège ; `authenticated` : `SELECT` sur `user_push_devices`
  uniquement).
- Edge Function `notify-new-message` : protégée par secret partagé (401 si
  absent/incorrect), utilise `service_role` uniquement côté serveur, ne
  notifie jamais l'expéditeur, contenu de notification générique fixe («
  Nouveau message » / « Vous avez reçu un nouveau message »).
- **Anomalie trouvée et corrigée avant activation** : la migration initiale
  n'avait pas révoqué les privilèges larges accordés par défaut par
  Supabase Cloud à `anon`/`authenticated` sur les nouvelles tables (RLS
  bloquait déjà tout accès réel, vérifié empiriquement avant correctif).
  Migration corrective appliquée et vérifiée.

## 4. Tests fonctionnels de non-régression

### Simulation SQL directe et test réel sur le projet distant

- Message valide → trigger Postgres → Edge Function déployée : déclenché
  avec succès (`status_code: 200`), vérifié à plusieurs reprises.
- Destinataire membre traité, expéditeur jamais notifié.
- Doublon bloqué (contrainte unique confirmée en réinsertion manuelle).
- Token Expo invalide désactivé automatiquement après réponse réelle de
  l'API Expo Push (`DeviceNotRegistered`).
- Secret incorrect/absent : refusé (401).
- Toutes les données de test utilisées (préfixe `phase5*test*`/`a1`-`a6`
  clairement identifiables) nettoyées après chaque validation.

### Test réel sur appareil (rapporté par l'utilisateur, build 15)

- Installation par-dessus le build 14 — OK
- Ouverture directe — OK
- Connexion Supabase — OK
- Demande de permission de notification — OK
- Refus de permission sans blocage de la messagerie — OK
- Activation depuis Profil → Notifications — OK
- Notification reçue, application ouverte — OK
- Notification reçue, application en arrière-plan — OK
- Notification reçue, application fermée — OK
- Tap sur la notification → ouverture de la bonne conversation — OK
- Aucune donnée privée affichée dans la notification — OK
- Déconnexion → désactivation du token de cet appareil uniquement — OK
- Aucun plantage — OK

Tous les points sont validés sans exception. Aucune anomalie résiduelle
constatée sur le parcours notifications.

## 5. Anomalies confirmées

Aucune anomalie bloquante confirmée à l'issue de cette phase (l'anomalie de
grants décrite en section 3 a été corrigée avant toute activation réelle,
sans exposition constatée).

## 6. Risques résiduels

- Absence de certificate pinning (décision documentée, voir `SECURITY.md`).
- Aucune protection contre un appareil rooté, une attaque physique directe,
  ou une compromission complète du système d'exploitation.
- Logs runtime de l'Edge Function non consultables via le CLI utilisé
  (Dashboard Supabase requis pour un audit approfondi des logs distants).
- Quelques dépendances Expo en retard d'un correctif mineur (voir
  section 1) — sans impact fonctionnel constaté.

## 7. Décision versionCode

Le build 15 (versionCode 15) est validé sans anomalie bloquante et devient
la nouvelle version stable candidate, succédant au build 14.

## 8. Absence de support Play Store

Cette version est distribuée exclusivement en APK autonome. Voir
[INSTALLATION_ANDROID.md](INSTALLATION_ANDROID.md).
