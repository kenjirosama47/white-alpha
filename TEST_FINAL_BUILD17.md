# White Alpha — Validation finale build 17 (correctif avatars & discussion White Alpha)

Ce document consigne la matrice de validation exécutée pour le build 17,
qui corrige deux anomalies constatées sur le build 16 en test réel :
l'avatar loup choisi ne s'actualisait pas sur tous les écrans, et l'écran
de discussion n'appliquait pas le style sombre White Alpha. Aucune
information sensible (email complet, UUID complet, secret TOTP, QR code,
mot de passe, clé `service_role`, clé `sb_secret_`, URL signée) n'est
incluse.

## 1. Validations automatiques

| Vérification | Résultat |
|---|---|
| `npm run check:avatars` | OK, 9/9 avatars présents |
| `npm test -- --runInBand` | OK, 78 suites / 677 tests |
| `npx tsc --noEmit` | OK, aucune erreur |
| `npm run lint` | OK, aucune erreur |
| `npx expo-doctor` | 19/20 — même point résiduel que les builds 14/15 (paquets Expo en retard d'un correctif mineur, non corrigés dans ce build) |
| `npx expo export --platform android --clear` | OK |
| `npx supabase db reset` / `test db` | OK, 227/227 assertions pgTAP |
| `npx supabase db lint` | OK (local et distant) |
| `npx supabase db push --linked` | OK, migration `20260718090000` appliquée et synchronisée |
| `git diff --check` | OK |

## 2. Audit de l'APK build 17

| Vérification | Résultat |
|---|---|
| Package | `com.kenjiro.whitealpha` |
| versionCode / versionName | 17 / 1.0.0 |
| Taille | 103 328 105 octets (~98,5 Mo) |
| SHA-256 APK | `78722a7132722d6453b62dbe5783866b5bd1e0bda80238d20cffee4ea0f305e7` |
| Certificat SHA-256 | `c6c357d42b766c7e3d1fc0c9f8e9b9f2ce4fd0e8ed1afe63bf008799d3a09aee` — identique aux builds précédents (même keystore EAS) |
| Signature valide, `debuggable=false` | OK |
| `allowBackup=false`, réseau durci | OK |
| R8 + `shrinkResources` actifs | OK |
| Aucun `expo-dev-client` / `dev-launcher` / `dev-menu` | OK |
| Composants exportés | `MainActivity` (launcher) + `FirebaseInstanceIdReceiver` (protégé par permission signature) uniquement |
| Aucun `service_role` ni `sb_secret_` dans le bundle compilé | OK |
| Aucune référence visible à Claude | OK |
| 9/9 avatars intégrés (empreinte de taille exacte) | OK |

## 3. Correctif avatars — cause et résolution

- **Cause** : résolution d'affichage par vérité brute (`if (avatarUrl)`)
  dans `AvatarImage`, prop `wolfPreset` omise sur 4 écrans sur 6, et trois
  instances indépendantes de `useMyProfile` (Profil, galerie, liste des
  conversations) sans état partagé.
- **Correctif** : `resolveAvatarDisplay` centralisé (URL valide > preset >
  initiale), `wolfPreset`/`otherAvatarPreset` threadés partout,
  `MyProfileProvider` partagé (un `setProfile` réussi se reflète
  immédiatement sur tous les écrans, sans redémarrage).
- **Migration** `20260718090000` : `get_conversation_for_notification`
  expose désormais `other_avatar_preset` (signature, grants, `SECURITY
  DEFINER`, `search_path` inchangés).

## 4. Correctif discussion — style White Alpha

Palette sombre imposée (`forcedScheme`, indépendante du thème système) sur
l'écran de discussion uniquement : fond noir profond, bulles vert forêt
(envoyées) / gris pierre (reçues), texte blanc cassé, composeur en carte
sombre, bouton d'envoi circulaire vert forêt. Aucune image de fond lourde
ajoutée. Realtime, messages, uploads et Supabase non modifiés.

## 5. Tests fonctionnels — téléphone réel (rapportés par l'utilisateur, build 17)

### Avatars

- Installation par-dessus le build 16 — OK
- Choix d'un nouvel avatar — OK
- Sauvegarde — OK
- Mise à jour immédiate dans Profil — OK
- Mise à jour sans redémarrer l'application — OK
- Avatar visible dans Recherche — OK
- Avatar visible dans Conversations — OK
- Avatar visible dans l'en-tête de Discussion — OK
- Aucune initiale affichée si un avatar est disponible — OK
- `avatar_url` valide reste prioritaire sur `avatar_preset` (compte avec
  photo personnelle) — OK
- `avatar_url` vide ou invalide retombe sur `avatar_preset` — OK
- Échec de sauvegarde (réseau coupé) conserve l'ancien avatar — OK

### Discussion

- Fond noir profond — OK
- En-tête sombre avec avatar et nom — OK
- Bulles envoyées vert forêt — OK
- Bulles reçues gris pierre foncé — OK
- Texte lisible (blanc cassé) — OK
- Séparateurs de date discrets — OK
- Composeur sombre — OK
- Bouton envoyer circulaire — OK
- Photos et vidéos lisibles — OK
- Clavier ne masque pas le composeur — OK
- États erreur et hors connexion lisibles (Wi-Fi et données coupées) — OK
- Retour normal après réactivation du réseau — OK
- Aucun plantage — OK

Tous les points sont validés sans exception, sur deux passes de test
réel (validation initiale, puis vérification ciblée des 4 points
nécessitant une manipulation réseau). Aucune anomalie résiduelle
constatée.

## 6. Anomalies confirmées

Aucune anomalie bloquante confirmée à l'issue de ce build. Les deux
anomalies d'origine (avatar non actualisé, style de discussion non
appliqué) sont corrigées et validées.

## 7. Risques résiduels

- Paquets Expo en retard d'un correctif mineur (voir section 1) — sans
  impact fonctionnel constaté, non corrigé dans ce build.
- Absence de certificate pinning (décision documentée, voir
  `SECURITY.md`).
- Aucune protection contre un appareil rooté, une attaque physique
  directe, ou une compromission complète du système d'exploitation.

## 8. Décision versionCode

Le build 17 (versionCode 17) est validé sans anomalie bloquante et
devient la nouvelle version stable candidate, succédant au build 16.

## 9. Absence de support Play Store

Cette version est distribuée exclusivement en APK autonome. Voir
[INSTALLATION_ANDROID.md](INSTALLATION_ANDROID.md).
