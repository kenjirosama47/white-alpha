import { SaveFormat, ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { compressPersonalPhoto, pickPersonalPhotoFromLibrary } from '@/services/personal-photo';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickPersonalPhotoFromLibrary — autorisation', () => {
  it('lève une erreur en français si la permission bibliothèque est refusée (autorisation refusée)', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(pickPersonalPhotoFromLibrary()).rejects.toThrow('Accès à tes photos refusé');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('ouvre le sélecteur avec recadrage portrait natif une fois la permission accordée (autorisation acceptée)', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });

    await pickPersonalPhotoFromLibrary();

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [9, 16] }),
    );
  });
});

describe('pickPersonalPhotoFromLibrary — sélection', () => {
  beforeEach(() => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  });

  it('retourne null quand la sélection ou le recadrage est annulé', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    const result = await pickPersonalPhotoFromLibrary();

    expect(result).toBeNull();
  });

  it('retourne l’URI, la largeur et la hauteur pour une image valide (jamais fileName)', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/picked.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2_000_000,
          width: 1080,
          height: 1920,
          fileName: 'IMG_20260721_secretlocation.jpg',
        },
      ],
    });

    const result = await pickPersonalPhotoFromLibrary();

    expect(result).toEqual({ uri: 'file:///cache/picked.jpg', width: 1080, height: 1920 });
    // Jamais de fileName dans le résultat exposé à l'appelant.
    expect(result).not.toHaveProperty('fileName');
  });

  it('rejette un format non pris en charge (format invalide)', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/picked.heic', mimeType: 'image/heic', fileSize: 1000, width: 100, height: 100 }],
    });

    await expect(pickPersonalPhotoFromLibrary()).rejects.toThrow('Format d’image non pris en charge');
  });

  it('rejette un fichier trop volumineux (fichier trop volumineux)', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/picked.jpg',
          mimeType: 'image/jpeg',
          fileSize: 50 * 1024 * 1024,
          width: 4000,
          height: 6000,
        },
      ],
    });

    await expect(pickPersonalPhotoFromLibrary()).rejects.toThrow('ne doit pas dépasser');
  });
});

describe('compressPersonalPhoto', () => {
  it('redimensionne, compresse et réencode en JPEG (recadrage/compression)', async () => {
    const mockSaveAsync = jest.fn().mockResolvedValue({ uri: 'file:///cache/out.jpg', width: 720, height: 1280 });
    const mockRenderAsync = jest.fn().mockResolvedValue({ saveAsync: mockSaveAsync });
    const mockResize = jest.fn().mockReturnValue({ renderAsync: mockRenderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize: mockResize });

    const result = await compressPersonalPhoto('file:///cache/picked.jpg');

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///cache/picked.jpg');
    expect(mockResize).toHaveBeenCalledWith({ width: 720, height: 1280 });
    expect(mockSaveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: SaveFormat.JPEG }));
    expect(result).toEqual({ uri: 'file:///cache/out.jpg', width: 720, height: 1280 });
  });

  it("ne demande jamais de contenu base64 (aucune persistance base64 en AsyncStorage possible ensuite)", async () => {
    const mockSaveAsync = jest.fn().mockResolvedValue({ uri: 'file:///cache/out.jpg', width: 720, height: 1280 });
    const mockRenderAsync = jest.fn().mockResolvedValue({ saveAsync: mockSaveAsync });
    const mockResize = jest.fn().mockReturnValue({ renderAsync: mockRenderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize: mockResize });

    await compressPersonalPhoto('file:///cache/picked.jpg');

    const saveOptions = mockSaveAsync.mock.calls[0][0];
    expect(saveOptions.base64).not.toBe(true);
  });
});
