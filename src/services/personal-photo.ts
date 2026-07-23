import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  PERSONAL_PHOTO_COMPRESSION_QUALITY,
  PERSONAL_PHOTO_TARGET_HEIGHT,
  PERSONAL_PHOTO_TARGET_WIDTH,
} from '@/constants/personal-photo';
import { validateImageFile } from '@/types/chat';

export type PickedPersonalPhoto = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Ouvre le sélecteur de photos (jamais la caméra, jamais le micro), avec
 * recadrage natif portrait (`allowsEditing`, `aspect: [9, 16]` — l'OS
 * fournit déjà le repositionnement et le zoom, aucune bibliothèque de
 * recadrage supplémentaire nécessaire). La permission n'est demandée qu'à
 * cet appel, jamais avant (jamais au montage de l'écran) : cette fonction
 * n'est appelée que depuis un gestionnaire de tap explicite (« Choisir une
 * photo »/« Remplacer »).
 *
 * Retourne `null` si l'utilisateur annule (sélection ou recadrage).
 * Ne lit et n'expose jamais `fileName` (nom original de la photo, jamais
 * journalisé ni affiché) : seule l'URI temporaire choisie par l'OS est
 * utilisée, jamais un identifiant qui remonterait au fichier source.
 */
export async function pickPersonalPhotoFromLibrary(): Promise<PickedPersonalPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Accès à tes photos refusé. Autorise l’accès dans les réglages pour choisir une photo personnelle.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [9, 16],
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];

  const validation = validateImageFile({
    mimeType: asset.mimeType,
    sizeBytes: asset.fileSize ?? 0,
  });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export type CompressedPersonalPhoto = {
  /** URI temporaire (cache) du résultat — à déplacer vers le stockage privé via `savePersonalPhotoFile` (voir `lib/personal-photo-storage.ts`), jamais utilisée telle quelle comme référence durable. */
  uri: string;
  width: number;
  height: number;
};

/**
 * Redimensionne et compresse localement la photo déjà recadrée par l'OS :
 * limite la résolution finale (`PERSONAL_PHOTO_TARGET_WIDTH/HEIGHT`) et le
 * poids (qualité `PERSONAL_PHOTO_COMPRESSION_QUALITY`), toujours réencodée
 * en JPEG. Le réencodage complet de l'image ne conserve aucune métadonnée
 * EXIF de la photo source (aucune option de l'API ne permet de la
 * conserver) : ni orientation d'origine, ni position GPS, ni modèle
 * d'appareil.
 */
export async function compressPersonalPhoto(uri: string): Promise<CompressedPersonalPhoto> {
  const context = ImageManipulator.manipulate(uri).resize({
    width: PERSONAL_PHOTO_TARGET_WIDTH,
    height: PERSONAL_PHOTO_TARGET_HEIGHT,
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: PERSONAL_PHOTO_COMPRESSION_QUALITY,
  });

  return { uri: saved.uri, width: saved.width, height: saved.height };
}
