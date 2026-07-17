# Emplacement des avatars loups (Phase 7.5 — complète, 9/9)

Convention respectée (identifiant catalogue `constants/avatars.ts` → fichier,
PNG carré 512×512, cadrage cohérent avec le loup officiel du branding —
jamais ce visuel lui-même) :

| Identifiant | Fichier | Statut |
|---|---|---|
| `wolf_white_calm` | `wolf_white_calm.png` | ✅ présent |
| `wolf_grey` | `wolf_grey.png` | ✅ présent |
| `wolf_black` | `wolf_black.png` | ✅ présent |
| `wolf_brown` | `wolf_brown.png` | ✅ présent |
| `wolf_snow` | `wolf_snow.png` | ✅ présent |
| `wolf_green_eye` | `wolf_green_eye.png` | ✅ présent |
| `wolf_young` | `wolf_young.png` | ✅ présent |
| `wolf_guardian` | `wolf_guardian.png` | ✅ présent |
| `wolf_alpha` | `wolf_alpha.png` | ✅ présent |

`npm run check:avatars` confirme les 9/9 actifs dans `WOLF_AVATAR_SOURCES` —
plus aucun repli texte en usage normal (reste disponible comme garde si une
future entrée venait à manquer).

## Historique des écarts corrigés pendant l'intégration

- Une première tentative pour `wolf_alpha` était un doublon binaire exact de
  `wolf_grey.png` (même fichier téléchargé deux fois) — écartée.
- Deux tentatives pour `wolf_white_calm` ont été écartées : un loup noir avec
  cicatrice (hors spécification), puis le loup officiel du branding
  (bandeau + cicatrices + œil vert — réservé à l'identité de l'app, jamais un
  avatar utilisateur). L'image finalement retenue est un loup gris très clair
  au regard calme, sans cicatrice ni bandeau ni neige.

## Procédure si une entrée devait être remplacée

1. Redimensionner en PNG carré 512×512 si nécessaire.
2. Mettre à jour l'entrée dans `WOLF_AVATAR_SOURCES` (`src/constants/avatars.ts`).
3. Vérifier qu'aucune image n'est un doublon binaire des autres (hash SHA-256).
4. Exécuter `npm run check:avatars` (doit rester à 9/9).
5. Exécuter `npm test -- --runInBand`.

Tant qu'une entrée est absente, `resolveWolfAvatarSource()` renvoie `null` et
`AvatarImage`/`WolfAvatarTile` retombent sur leur repli existant (initiale ou
nom du loup) — aucune image manquante ne peut casser le build.
