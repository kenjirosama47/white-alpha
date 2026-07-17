# White Alpha — Notes de version v1.0.0 (build 14)

## Résumé

Première version stable de White Alpha : application de messagerie privée
1-à-1, développée avec Expo / React Native et Supabase. Distribuée
uniquement sous forme d'APK Android autonome (aucune publication sur le
Play Store à ce stade).

## Fonctionnalités validées

- Création de compte et connexion (Supabase Auth).
- Conversations privées 1-à-1 : création, ouverture, liste.
- Recherche d'utilisateurs par nom d'utilisateur.
- Envoi et réception de messages texte en temps réel (Supabase Realtime).
- Envoi de photos et de vidéos dans une conversation.
- Suppression de ses propres messages (texte et pièces jointes, y compris
  le fichier associé dans le stockage).
- Rôle **propriétaire unique** de la plateforme, non modifiable depuis le
  client, protégé par une contrainte d'unicité en base de données.
- Authentification à deux facteurs (MFA TOTP) pour le compte propriétaire,
  obligatoire pour toute action sensible réservée au propriétaire.
- Durcissement Android : protection contre la capture d'écran et l'aperçu
  dans les applications récentes sur les écrans privés, trafic réseau
  chiffré exclusivement, journalisation désactivée en version Release,
  permissions minimales.

## Limites connues (v1.0.0)

- Pas d'appels audio ni vidéo.
- Pas de conversations de groupe.
- Pas de publication sur le Play Store : mise à jour uniquement par
  réinstallation manuelle d'un nouvel APK.
- Pas de certificate pinning réseau (décision documentée dans
  [SECURITY.md](SECURITY.md) : le certificat TLS du projet Supabase tourne
  automatiquement sur un cycle court, un pinning rigide risquerait de
  bloquer l'application à chaque renouvellement).
- Aucune protection applicative ne peut empêcher une attaque physique sur
  l'appareil, un accès root, ou une compromission complète du système
  d'exploitation — voir [SECURITY.md](SECURITY.md).

## Métadonnées publiques de l'APK

| Champ | Valeur |
|---|---|
| Fichier | `WHITEALPHA_RELEASE_AUTONOME_BUILD14_SECURISE.apk` |
| Taille | 96 659 968 octets |
| SHA-256 (APK) | `74aa0204eb69dae9293a25d4a74b5427139419c063236db78e3ae50b5de06498` |
| Package | `com.kenjiro.whitealpha` |
| versionCode | 14 |
| version | 1.0.0 |
| Empreinte SHA-256 du certificat de signature | `c6c357d42b766c7e3d1fc0c9f8e9b9f2ce4fd0e8ed1afe63bf008799d3a09aee` |

Voir [INSTALLATION_ANDROID.md](INSTALLATION_ANDROID.md) pour la procédure
d'installation et de mise à jour, et [TEST_FINAL_BUILD14.md](TEST_FINAL_BUILD14.md)
pour la matrice de tests complète de cette version.
