/**
 * Catalogue des décorations de fond prédéfinies (Phase 10.4 — voir
 * PLAN.md). Assets locaux embarqués à l'application (WebP, 360×640) :
 * aucun téléchargement au démarrage, fonctionnement hors connexion,
 * chargement immédiat, aucune URL distante utilisée par l'application.
 *
 * 18 des 24 fonds sont des photographies réelles, sourcées exclusivement
 * depuis Wikimedia Commons et recadrées/converties localement (jamais
 * d'image FitPro, jamais de logo ou personnage protégé) : chacune est soit
 * domaine public (œuvre du gouvernement fédéral américain — NPS/USFWS/NASA
 * — ou auto-libérée par son auteur), soit CC0, jamais CC-BY ni CC-BY-SA —
 * aucune attribution n'est donc requise. Détail complet (auteur, licence,
 * page source) dans `assets/images/decorations/README.md`. Les 6 fonds
 * restants (Abstrait sombre, Minimaliste) et l'emblème White Alpha sont des
 * créations originales générées par script
 * (`scripts/generate-decoration-assets.py`, `scripts/generate-emblem.py`) ;
 * le fond `white_alpha_banner` reprend un visuel déjà possédé par le projet
 * (déjà utilisé sur les écrans d'authentification/branding).
 *
 * Seul un identifiant stable (`DecorationId`) est destiné à être stocké
 * côté préférences d'apparence (`BackgroundConfig`, `types/appearance.ts`)
 * — jamais un chemin de fichier ni une URL, jamais un chemin absolu
 * Windows. Le client résout localement l'identifiant vers l'image
 * correspondante (même principe que `constants/avatars.ts`).
 */

export type DecorationCategoryId =
  | 'white_alpha'
  | 'wolves'
  | 'nature'
  | 'mountains'
  | 'forest'
  | 'night_sky'
  | 'dark_abstract'
  | 'minimal';

export type DecorationCategory = {
  id: DecorationCategoryId;
  label: string;
};

export const DECORATION_CATEGORIES: readonly DecorationCategory[] = [
  { id: 'white_alpha', label: 'White Alpha' },
  { id: 'wolves', label: 'Loups' },
  { id: 'nature', label: 'Nature' },
  { id: 'mountains', label: 'Montagnes' },
  { id: 'forest', label: 'Forêt' },
  { id: 'night_sky', label: 'Ciel nocturne' },
  { id: 'dark_abstract', label: 'Abstrait sombre' },
  { id: 'minimal', label: 'Minimaliste' },
] as const;

export type DecorationId =
  | 'white_alpha_banner'
  | 'white_alpha_glow'
  | 'white_alpha_howl'
  | 'wolves_gaze'
  | 'wolves_pack'
  | 'wolves_snow'
  | 'nature_river'
  | 'nature_waterfall'
  | 'nature_meadow'
  | 'mountains_ridge'
  | 'mountains_peak'
  | 'mountains_dusk'
  | 'forest_canopy'
  | 'forest_mist'
  | 'forest_sunbeams'
  | 'night_sky_stars'
  | 'night_sky_moon'
  | 'night_sky_ravine'
  | 'dark_abstract_waves'
  | 'dark_abstract_orbs'
  | 'dark_abstract_grid'
  | 'minimal_slate'
  | 'minimal_paper'
  | 'minimal_ink';

export type DecorationCatalogEntry = {
  id: DecorationId;
  categoryId: DecorationCategoryId;
  /** Libellé affiché dans la galerie de sélection (jamais utilisé comme identifiant de stockage). */
  label: string;
};

export const DECORATION_CATALOG: readonly DecorationCatalogEntry[] = [
  { id: 'white_alpha_banner', categoryId: 'white_alpha', label: 'Loup blanc White Alpha' },
  { id: 'white_alpha_glow', categoryId: 'white_alpha', label: 'Sceau White Alpha' },
  { id: 'white_alpha_howl', categoryId: 'white_alpha', label: 'Hurlement' },
  { id: 'wolves_gaze', categoryId: 'wolves', label: 'Portrait dans la neige' },
  { id: 'wolves_pack', categoryId: 'wolves', label: 'Meute au repos' },
  { id: 'wolves_snow', categoryId: 'wolves', label: 'Loup dans la neige' },
  { id: 'nature_river', categoryId: 'nature', label: 'Rivière et collines' },
  { id: 'nature_waterfall', categoryId: 'nature', label: 'Cascade' },
  { id: 'nature_meadow', categoryId: 'nature', label: 'Prairie' },
  { id: 'mountains_ridge', categoryId: 'mountains', label: 'Panorama alpin' },
  { id: 'mountains_peak', categoryId: 'mountains', label: 'Sommet et lac' },
  { id: 'mountains_dusk', categoryId: 'mountains', label: 'Vallée au crépuscule' },
  { id: 'forest_canopy', categoryId: 'forest', label: 'Forêt moussue' },
  { id: 'forest_mist', categoryId: 'forest', label: 'Brume' },
  { id: 'forest_sunbeams', categoryId: 'forest', label: 'Rayons de soleil' },
  { id: 'night_sky_stars', categoryId: 'night_sky', label: 'Voie lactée' },
  { id: 'night_sky_moon', categoryId: 'night_sky', label: 'Pleine lune' },
  { id: 'night_sky_ravine', categoryId: 'night_sky', label: 'Ciel étoilé' },
  { id: 'dark_abstract_waves', categoryId: 'dark_abstract', label: 'Vagues' },
  { id: 'dark_abstract_orbs', categoryId: 'dark_abstract', label: 'Halos' },
  { id: 'dark_abstract_grid', categoryId: 'dark_abstract', label: 'Grille' },
  { id: 'minimal_slate', categoryId: 'minimal', label: 'Ardoise' },
  { id: 'minimal_paper', categoryId: 'minimal', label: 'Papier' },
  { id: 'minimal_ink', categoryId: 'minimal', label: 'Encre' },
] as const;

/**
 * Images embarquées (`assets/images/decorations/<catégorie>/<id>.webp`,
 * `require(...)` explicite par clé — jamais un chemin dynamique, pour que
 * Metro puisse résoudre chaque asset statiquement, même principe que
 * `WOLF_AVATAR_SOURCES`). Tant qu'une entrée est absente,
 * `resolveDecorationSource` renvoie `null` : la vignette et le fond
 * retombent sur leur repli existant (libellé seul), jamais une erreur de
 * bundling sur un asset manquant.
 */
const DECORATION_SOURCES: Partial<Record<DecorationId, number>> = {
  white_alpha_banner: require('../../assets/images/decorations/white_alpha/white_alpha_banner.webp'),
  white_alpha_glow: require('../../assets/images/decorations/white_alpha/white_alpha_glow.webp'),
  white_alpha_howl: require('../../assets/images/decorations/white_alpha/white_alpha_howl.webp'),
  wolves_gaze: require('../../assets/images/decorations/wolves/wolves_gaze.webp'),
  wolves_pack: require('../../assets/images/decorations/wolves/wolves_pack.webp'),
  wolves_snow: require('../../assets/images/decorations/wolves/wolves_snow.webp'),
  nature_river: require('../../assets/images/decorations/nature/nature_river.webp'),
  nature_waterfall: require('../../assets/images/decorations/nature/nature_waterfall.webp'),
  nature_meadow: require('../../assets/images/decorations/nature/nature_meadow.webp'),
  mountains_ridge: require('../../assets/images/decorations/mountains/mountains_ridge.webp'),
  mountains_peak: require('../../assets/images/decorations/mountains/mountains_peak.webp'),
  mountains_dusk: require('../../assets/images/decorations/mountains/mountains_dusk.webp'),
  forest_canopy: require('../../assets/images/decorations/forest/forest_canopy.webp'),
  forest_mist: require('../../assets/images/decorations/forest/forest_mist.webp'),
  forest_sunbeams: require('../../assets/images/decorations/forest/forest_sunbeams.webp'),
  night_sky_stars: require('../../assets/images/decorations/night_sky/night_sky_stars.webp'),
  night_sky_moon: require('../../assets/images/decorations/night_sky/night_sky_moon.webp'),
  night_sky_ravine: require('../../assets/images/decorations/night_sky/night_sky_ravine.webp'),
  dark_abstract_waves: require('../../assets/images/decorations/dark_abstract/dark_abstract_waves.webp'),
  dark_abstract_orbs: require('../../assets/images/decorations/dark_abstract/dark_abstract_orbs.webp'),
  dark_abstract_grid: require('../../assets/images/decorations/dark_abstract/dark_abstract_grid.webp'),
  minimal_slate: require('../../assets/images/decorations/minimal/minimal_slate.webp'),
  minimal_paper: require('../../assets/images/decorations/minimal/minimal_paper.webp'),
  minimal_ink: require('../../assets/images/decorations/minimal/minimal_ink.webp'),
};

export function resolveDecorationSource(id: DecorationId | string | null | undefined): number | null {
  if (!id) return null;
  return DECORATION_SOURCES[id as DecorationId] ?? null;
}

export function isDecorationId(value: string): value is DecorationId {
  return DECORATION_CATALOG.some((entry) => entry.id === value);
}

export function getDecorationLabel(id: DecorationId): string {
  return DECORATION_CATALOG.find((entry) => entry.id === id)?.label ?? id;
}

/** Décorations d'une catégorie, dans l'ordre du catalogue (galerie, Phase 10.4). Tableau vide si la catégorie est inconnue ou n'a aucune entrée — jamais une erreur. */
export function getDecorationsByCategory(categoryId: DecorationCategoryId): readonly DecorationCatalogEntry[] {
  return DECORATION_CATALOG.filter((entry) => entry.categoryId === categoryId);
}
