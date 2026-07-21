# Décorations de fond — galerie Apparence (Phase 10.4)

24 images WebP, 360×640 (ratio portrait téléphone), recadrées sans
déformation (crop pur puis redimensionnement proportionnel) et pourvues
d'un léger voile sombre automatique en haut de l'image quand c'était
nécessaire pour la lisibilité d'un texte superposé (calculé sur la
luminosité de la bande supérieure, jamais appliqué systématiquement).

Aucune image FitPro, aucun logo ni personnage protégé, aucune image
téléchargée directement depuis Google Images. Trois origines seulement :

1. **Photographies réelles du domaine public ou CC0** (18 fonds) —
   exclusivement sourcées sur Wikimedia Commons, licence vérifiée
   directement sur la page de chaque fichier avant intégration. Aucune
   n'est CC-BY ni CC-BY-SA : **aucune attribution n'est requise**.
2. **Créations originales générées par script** (6 fonds : Abstrait
   sombre × 3, Minimaliste × 3, + l'emblème `white_alpha_glow`) —
   `scripts/generate-decoration-assets.py` et `scripts/generate-emblem.py`.
3. **Asset déjà possédé par le projet** (`white_alpha_banner`) — recadrage
   de `assets/images/white-alpha-wolf-branding.jpg`, déjà utilisé sur les
   écrans d'authentification/branding.

## Traçabilité des 18 photographies (référence interne, aucune attribution exigée)

| Identifiant | Page source (Wikimedia Commons) | Auteur | Licence |
|---|---|---|---|
| `white_alpha_howl` | [Canis lupus howling on glacial erratic.jpg](https://commons.wikimedia.org/wiki/File:Canis_lupus_howling_on_glacial_erratic.jpg) | Jim Peaco / NPS | PD-USGov |
| `wolves_gaze` | [Yellowstone-wolf-17120.jpg](https://commons.wikimedia.org/wiki/File:Yellowstone-wolf-17120.jpg) | Doug Smith / NPS | PD-USGov |
| `wolves_pack` | [Junction Butte Pack photographed from a fixed-wing during wolf study (49235371881).jpg](https://commons.wikimedia.org/wiki/File:Junction_Butte_Pack_photographed_from_a_fixed-wing_during_wolf_study_(49235371881).jpg) | Dan Stahler / NPS | PD-USGov |
| `wolves_snow` | [Radio collared gray wolf on snow.jpg](https://commons.wikimedia.org/wiki/File:Radio_collared_gray_wolf_on_snow.jpg) | Tracy Brooks / USFWS | PD (USFWS) |
| `nature_river` | [River flowing through hills (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:River_flowing_through_hills_(Unsplash).jpg) | Adam Morse | CC0 |
| `nature_waterfall` | [Idyllic landscape with a waterfall (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Idyllic_landscape_with_a_waterfall_(Unsplash).jpg) | Robert Lukeman | CC0 |
| `nature_meadow` | [Windswept meadow (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Windswept_meadow_(Unsplash).jpg) | Paul Jarvis | CC0 |
| `mountains_ridge` | [Snowy Alpine panorama (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Snowy_Alpine_panorama_(Unsplash).jpg) | Leon Kirchner | CC0 |
| `mountains_peak` | [Sunset over Peyto Lake (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Sunset_over_Peyto_Lake_(Unsplash).jpg) | Mark Basarab | CC0 |
| `mountains_dusk` | [Sunset over a misty valley (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Sunset_over_a_misty_valley_(Unsplash).jpg) | Neven Krcmarek | CC0 |
| `forest_canopy` | [Dark mossy forest.jpg](https://commons.wikimedia.org/wiki/File:Dark_mossy_forest.jpg) | Jon Sullivan | PD (auto-déclaré) |
| `forest_mist` | [Foggy Green Forest (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Foggy_Green_Forest_(Unsplash).jpg) | Guy Bowden | CC0 |
| `forest_sunbeams` | [Sun's rays in a dense forest (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Sun's_rays_in_a_dense_forest_(Unsplash).jpg) | Filip Varga | CC0 |
| `night_sky_stars` | [Milky Way Galaxy.jpg](https://commons.wikimedia.org/wiki/File:Milky_Way_Galaxy.jpg) | Nick Risinger | PD (auto-déclaré) |
| `night_sky_moon` | [Full moon.jpeg](https://commons.wikimedia.org/wiki/File:Full_moon.jpeg) | NASA/JPL/USGS (Galileo) | PD-USGov |
| `night_sky_ravine` | [Star Night Sky Ravine (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Star_Night_Sky_Ravine_(Unsplash).jpg) | Mark Basarab | CC0 |

`white_alpha_banner`, `white_alpha_glow` et les 6 fonds Abstrait
sombre/Minimaliste n'apparaissent pas dans ce tableau : propriété du
projet, aucune source externe.

## Convention

Identifiant catalogue (`constants/decorations.ts`) → fichier
`assets/images/decorations/<catégorie>/<identifiant>.webp`, jamais un
chemin dynamique (`require(...)` explicite par clé, pour que Metro résolve
chaque asset statiquement — même principe que les avatars loups, voir
`assets/images/avatars/README.md`).

Tant qu'une entrée venait à manquer, `resolveDecorationSource()` renvoie
`null` : la vignette et le fond retombent sur leur repli existant (libellé
seul), jamais une erreur de bundling sur un asset manquant.

## Procédure si une entrée devait être remplacée

1. Vérifier la licence de la nouvelle source de la même façon (page du
   fichier consultée directement, jamais CC-BY/CC-BY-SA, aucune
   attribution requise).
2. Recadrer en portrait sans déformer le sujet principal, WebP qualité
   ~70–85 selon la complexité de l'image (quelques dizaines de Ko max).
3. Remplacer le fichier au même chemin, sans toucher à
   `constants/decorations.ts` (sauf renommage d'identifiant, à documenter).
4. Vérifier qu'aucune image n'est un doublon binaire des autres (hash
   SHA-256).
5. Exécuter `npm test -- --runInBand`.
