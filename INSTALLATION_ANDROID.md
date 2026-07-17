# White Alpha — Installation Android (build 14, v1.0.0)

White Alpha n'est pas distribuée via le Play Store. L'installation se fait
par chargement direct (« sideload ») de l'APK signé.

## Avant d'installer

Vérifier l'intégrité du fichier avant toute installation :

| Champ | Valeur attendue |
|---|---|
| Fichier | `WHITEALPHA_RELEASE_AUTONOME_BUILD14_SECURISE.apk` |
| Taille | 96 659 968 octets |
| SHA-256 (APK) | `74aa0204eb69dae9293a25d4a74b5427139419c063236db78e3ae50b5de06498` |
| Package | `com.kenjiro.whitealpha` |
| versionCode | 14 |
| Empreinte SHA-256 du certificat | `c6c357d42b766c7e3d1fc0c9f8e9b9f2ce4fd0e8ed1afe63bf008799d3a09aee` |

Toute divergence sur la taille ou le SHA-256 signifie que le fichier n'est
pas le fichier validé : ne pas l'installer.

## Procédure d'installation (première installation)

1. Transférer l'APK sur l'appareil Android par un moyen de confiance
   (câble, ou stockage personnel — jamais un lien reçu d'un tiers non
   vérifié).
2. Dans les paramètres Android, autoriser temporairement l'installation
   d'applications depuis la source utilisée pour ce transfert.
3. Ouvrir le fichier APK et confirmer l'installation.
4. **Immédiatement après l'installation**, désactiver à nouveau
   l'autorisation d'installation depuis des sources inconnues.

## Procédure de mise à jour

White Alpha n'ayant pas de mécanisme de mise à jour automatique (hors Play
Store), chaque nouvelle version doit être installée manuellement :

1. Vérifier que le nouvel APK porte un `versionCode` strictement supérieur
   et la **même empreinte de certificat de signature** que la version
   installée (sinon Android refusera l'installation par-dessus l'existante).
2. Installer le nouvel APK par-dessus l'ancien (sans le désinstaller au
   préalable) : les données de session et l'état local sont conservés.
3. Si le certificat de signature diffère, une désinstallation complète est
   nécessaire avant d'installer la nouvelle version — dans ce cas, les
   données locales de l'appareil sont perdues (la session Supabase reste
   accessible via une nouvelle connexion, les données serveur ne sont pas
   affectées).

## Procédure de récupération

- **Perte de session locale** : se reconnecter avec l'email et le mot de
  passe du compte. Les conversations et messages sont conservés côté
  serveur (Supabase), pas uniquement sur l'appareil.
- **Compte propriétaire, perte de l'accès au facteur MFA** : la
  récupération ne peut se faire que côté administration Supabase (aucune
  procédure de contournement n'existe côté client, par conception — c'est
  la garantie même de la protection MFA).
- **Appareil perdu ou volé** : se connecter à un autre appareil et changer
  le mot de passe du compte depuis les paramètres Supabase Auth ; pour le
  compte propriétaire, envisager également la révocation du facteur MFA
  existant et l'enrôlement d'un nouveau facteur côté administration.

## Rappel de sécurité après tout test ou installation

- Désactiver le débogage USB.
- Désactiver le débogage sans fil.
- Désactiver l'installation d'applications inconnues.
- Réactiver le blocage automatique constructeur si désactivé pour le test
  (ex. Samsung Auto Blocker).
- Activer le verrouillage USB lorsque l'appareil est verrouillé.
- Ne laisser aucun ordinateur autorisé pour le débogage ADB s'il n'est pas
  nécessaire en continu.

## Absence de support Play Store

Cette version n'étant pas distribuée via le Play Store, aucune des
protections propres à ce canal (Play Protect automatique, Play Integrity,
mise à jour silencieuse) ne s'applique. L'utilisateur est seul responsable
de la vérification de l'origine et de l'intégrité de chaque APK installé.
