# Emplacement des avatars loups (Phase 7.2 — architecture uniquement)

Aucune image définitive dans ce dossier pour l'instant. Convention à
respecter lorsque les 9 images seront fournies (Phase 7.5) :

| Identifiant catalogue (`constants/avatars.ts`) | Fichier attendu |
|---|---|
| `wolf_white_calm` | `wolf_white_calm.png` |
| `wolf_grey` | `wolf_grey.png` |
| `wolf_black` | `wolf_black.png` |
| `wolf_brown` | `wolf_brown.png` |
| `wolf_snow` | `wolf_snow.png` |
| `wolf_green_eye` | `wolf_green_eye.png` |
| `wolf_young` | `wolf_young.png` |
| `wolf_guardian` | `wolf_guardian.png` |
| `wolf_alpha` | `wolf_alpha.png` |

Format attendu : PNG carré, 512×512, cadrage cohérent avec le loup officiel
du branding (`white-alpha-wolf-main.png`) mais **jamais ce visuel lui-même**
— le loup au bandeau reste réservé à l'identité White Alpha, jamais un
avatar utilisateur ordinaire (voir PLAN.md, Phase 7).

Une fois un fichier ajouté, décommenter l'entrée correspondante dans
`WOLF_AVATAR_SOURCES` (`src/constants/avatars.ts`) :

```ts
wolf_white_calm: require('../../assets/images/avatars/wolf_white_calm.png'),
```

Tant qu'une entrée n'est pas ajoutée, `resolveWolfAvatarSource()` renvoie
`null` et `AvatarImage` retombe sur son repli existant (initiale) — aucune
image manquante ne peut casser le build.
